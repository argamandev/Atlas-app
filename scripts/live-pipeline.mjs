// live-pipeline.mjs — the full Core 1 live loop, end to end (spike):
//   Recall bot (prioritize_accuracy) -> realtime webhook -> Gemini 3.5 Flash live correction
//   (company-aware, constrained) -> live RTL page at http://localhost:8788
//
// The page shows corrected text piling up as the call happens; words Gemini changed are
// highlighted in the brand accent with the raw word shown on hover.
//
// Usage:
//   node scripts/live-pipeline.mjs                  (server; pair with cloudflared on :8788)
//   then: node scripts/live-bakeoff.mjs start "<zoom_url>" "<tunnel_url>" recall_acc
//
// Persists lines to scripts/out/live-pipeline-lines.jsonl

import { createServer } from 'node:http'
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(__dirname, 'out')
const LINES_FILE = join(OUT_DIR, 'live-pipeline-lines.jsonl')
const PORT = 8788
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

function loadEnv() {
  const out = {}
  for (const raw of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    out[line.slice(0, eq).trim()] = val
  }
  return out
}
const env = loadEnv()
if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing from .env.local')

// --- live-correction prompt: production-realistic context (company profile, not the script) ---
const COMPANY = 'אור-ים אנרגיה'
const COMPANY_CONTEXT = `"${COMPANY}" is an Israeli public renewable-energy company: solar projects (מגה-וואט, ג'יגה-וואט), energy storage (אגירה, מגה-וואט שעה), and a yielding real-estate arm (נכסים מניבים, שיעור תפוסה, NOI, שיעור היוון). This is its quarterly investor-relations call. Common terms: רבעון, EBITDA מתואם, FFO, CAPEX, תזרים מזומנים, אג"ח, מח"מ, ערך נקוב, LTV, מינוף, גידור, מט"ח, צבר פרויקטים, התחדשות עירונית, הנפקה, אנליסטים, מור בית השקעות.`

function correctionPrompt(context, utterance) {
  return `You are a live-caption corrector for a Hebrew investor-relations call.
${COMPANY_CONTEXT}

Below is ONE raw utterance from live Hebrew speech-to-text. Fix ONLY words you are confident are mis-transcribed given the financial context. Do NOT rephrase, do NOT add or remove words — keep exactly the same number of words in the same order. If nothing is clearly wrong, return the text unchanged.

Return ONLY the corrected utterance text. No explanations.

Previous lines (context):
${context || '(start of call)'}

Raw utterance:
${utterance}`
}

async function geminiCorrect(context, utterance) {
  const t0 = Date.now()
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: correctionPrompt(context, utterance) }] }],
            // thinking disabled: this is a constrained word-fix task — speed matters, and
            // thought parts must never leak into the caption text
            generationConfig: { maxOutputTokens: 4096, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(`Gemini ${res.status}`)
      const text = (json.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim()
      if (!text) throw new Error('empty')
      return { corrected: text, ms: Date.now() - t0 }
    } catch (e) {
      if (attempt === 3) return { corrected: null, ms: Date.now() - t0, error: e.message }
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}

// --- state ---------------------------------------------------------------------
const lines = [] // {id, at, speaker, raw, corrected, lagS, geminiMs}
let nextId = 1
// survive restarts mid-call: reload previously persisted lines
if (existsSync(LINES_FILE)) {
  for (const l of readFileSync(LINES_FILE, 'utf8').split('\n').filter(Boolean)) {
    try { lines.push(JSON.parse(l)) } catch { /* skip */ }
  }
  if (lines.length) nextId = Math.max(...lines.map((l) => l.id)) + 1
}
const queue = []
let working = false

async function processQueue() {
  if (working) return
  working = true
  while (queue.length) {
    const item = queue.shift()
    const context = lines.slice(-6).map((l) => l.corrected || l.raw).join('\n')
    const { corrected, ms, error } = await geminiCorrect(context, item.raw)
    const line = { ...item, corrected, geminiMs: ms, error }
    lines.push(line)
    appendFileSync(LINES_FILE, JSON.stringify(line) + '\n')
    const fixes = corrected && countDiffs(item.raw, corrected)
    console.log(`[${new Date().toISOString().slice(11, 19)}] line ${line.id}: lag=${item.lagS}s gemini=${ms}ms fixes=${fixes ?? 'FAILED'}`)
  }
  working = false
}
function countDiffs(raw, corrected) {
  const a = raw.split(/\s+/).filter(Boolean), b = corrected.split(/\s+/).filter(Boolean)
  if (a.length !== b.length) return -1 // word count changed (Gemini disobeyed)
  return a.reduce((n, w, i) => n + (w !== b[i] ? 1 : 0), 0)
}

// --- server ----------------------------------------------------------------------
const server = createServer((req, res) => {
  if (req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      res.writeHead(200).end('ok')
      try {
        const evt = JSON.parse(body)
        if (evt?.event !== 'transcript.data') return // finals only for the pipeline
        const words = evt?.data?.data?.words ?? []
        const speaker = evt?.data?.data?.participant?.name ?? ''
        const raw = words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
        if (!raw) return
        const abs = words[0]?.start_timestamp?.absolute
        const lagS = abs ? Math.round((Date.now() - Date.parse(abs)) / 1000) : null
        queue.push({ id: nextId++, at: new Date().toISOString(), speaker, raw, lagS })
        processQueue()
      } catch { /* ignore malformed */ }
    })
    return
  }
  if (req.url === '/lines') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(lines))
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(PAGE)
})

const PAGE = `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>תמלול. — שידור חי</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{background:#0a0a0a;color:#f5f5f4;font-family:'IBM Plex Sans Hebrew','Segoe UI',sans-serif;margin:0;padding:0 0 120px}
  header{position:sticky;top:0;background:#0a0a0aee;backdrop-filter:blur(6px);padding:18px 28px;border-bottom:1px solid #262626;display:flex;align-items:center;gap:14px}
  .live{display:inline-flex;align-items:center;gap:8px;color:#ef4444;font-weight:600;font-size:14px}
  .dot{width:9px;height:9px;border-radius:50%;background:#ef4444;animation:pulse 1.4s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
  h1{font-size:18px;margin:0;font-weight:600}
  h1 b{color:#C04A00}
  #status{color:#737373;font-size:13px;margin-inline-start:auto;font-variant-numeric:tabular-nums}
  main{max-width:860px;margin:0 auto;padding:28px}
  .line{margin:0 0 22px;animation:fadein .6s}
  @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1}}
  .meta{color:#525252;font-size:12px;margin-bottom:6px;direction:ltr;text-align:right}
  .txt{font-size:21px;line-height:1.75}
  mark{background:transparent;color:#ff8c42;border-bottom:2px solid #C04A00;cursor:help}
  .failed{color:#a3a3a3;font-style:italic}
  #empty{color:#525252;text-align:center;margin-top:80px;font-size:16px}
</style></head><body>
<header><span class="live"><span class="dot"></span>LIVE</span><h1>אור-ים אנרגיה — שיחת משקיעים · <b>תמלול.</b></h1><span id="status"></span></header>
<main><div id="empty">ממתין לקטע הראשון מהשיחה… (מצב דיוק-גבוה: הקטעים מגיעים כל ~1–3 דקות)</div><div id="lines"></div></main>
<script>
let seen=0, lastAt=Date.now();
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function render(l){
  const div=document.createElement('div');div.className='line';
  let html='';
  if(l.corrected){
    const a=l.raw.split(/\\s+/),b=l.corrected.split(/\\s+/);
    if(a.length===b.length){
      html=b.map((w,i)=>w!==a[i]?'<mark title="מקור: '+esc(a[i])+'">'+esc(w)+'</mark>':esc(w)).join(' ');
    } else { html=esc(l.corrected); }
  } else { html='<span class="failed">'+esc(l.raw)+' (תיקון נכשל — מוצג מקור)</span>'; }
  const fixes=l.corrected?l.corrected.split(/\\s+/).filter((w,i)=>w!==l.raw.split(/\\s+/)[i]).length:0;
  div.innerHTML='<div class="meta">'+l.at.slice(11,19)+' · lag '+(l.lagS??'?')+'s · gemini '+(l.geminiMs??'?')+'ms · '+fixes+' fixes</div><div class="txt">'+html+'</div>';
  document.getElementById('lines').appendChild(div);
  window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
}
async function poll(){
  try{
    const r=await fetch('/lines');const all=await r.json();
    if(all.length>seen){document.getElementById('empty').style.display='none';
      for(const l of all.slice(seen))render(l); seen=all.length; lastAt=Date.now();}
    document.getElementById('status').textContent=seen+' קטעים · עדכון אחרון לפני '+Math.round((Date.now()-lastAt)/1000)+'s';
  }catch(e){}
  setTimeout(poll,1500);
}
poll();
</script></body></html>`

server.listen(PORT, () => console.log(`live-pipeline on http://localhost:${PORT} — Gemini correction armed (${COMPANY})`))
