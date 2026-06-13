// live-broadcast.mjs — TRUE live broadcast spike (Core 1, the real product loop):
//
//   Zoom call -> Recall bot -> { websocket: live audio (PCM), webhook: transcript chunks }
//   -> Gemini live correction -> viewer page playing audio ~5 min behind the call with
//   karaoke captions in perfect sync (current word WHITE, upcoming gray).
//
// Viewers joining before the buffer fills see a countdown ("השידור יתחיל בעוד...").
// When the call ends, the broadcast keeps playing until the buffer drains.
//
// Usage:
//   node scripts/live-broadcast.mjs                                  -> serve on :8788
//   node scripts/live-broadcast.mjs start "<zoom_url>" "<tunnel>"    -> create the bot
//   Player: http://localhost:8788  (?delay=60 to test with a shorter buffer; default 300)
//
// Requires: cloudflared tunnel --url http://localhost:8788 (same tunnel carries wss)

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(__dirname, 'out')
const LINES_FILE = join(OUT_DIR, 'broadcast-lines.jsonl')
const PCM_FILE = join(OUT_DIR, 'broadcast-audio.pcm')
const STATE_FILE = join(__dirname, '.live-broadcast.json')
const PORT = 8788
const SAMPLE_RATE = 16000
const DEFAULT_DELAY = 300 // seconds behind live
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

// ============ bot creation (subcommand) ============
async function startBot(meetingUrl, tunnelBase) {
  if (!meetingUrl || !tunnelBase) throw new Error('Usage: start "<zoom_url>" "<https tunnel base>"')
  const base = tunnelBase.replace(/\/$/, '')
  const wsBase = base.replace(/^https:/, 'wss:')
  const REGION = env.RECALL_REGION || 'us-west-2'
  const res = await fetch(`https://${REGION}.recall.ai/api/v1/bot`, {
    method: 'POST',
    headers: { Authorization: `Token ${env.RECALL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: 'Timlul Live',
      recording_config: {
        transcript: { provider: { recallai_streaming: { mode: 'prioritize_accuracy', language_code: 'auto' } } },
        audio_mixed_raw: {}, // enable the raw-audio artifact so it can stream to our websocket
        realtime_endpoints: [
          { type: 'webhook', url: `${base}/recall`, events: ['transcript.data'] },
          { type: 'websocket', url: `${wsBase}/ws`, events: ['audio_mixed_raw.data'] },
        ],
      },
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Recall ${res.status}: ${JSON.stringify(body, null, 2)}`)
  writeFileSync(STATE_FILE, JSON.stringify({ botId: body.id, meetingUrl, createdAt: new Date().toISOString() }, null, 2))
  console.log(`✅ Live bot created: ${body.id}\n   audio  -> ${wsBase}/ws\n   text   -> ${base}/recall\nAdmit "Timlul Live" from the waiting room.`)
}

// ============ Gemini live correction (same as live-pipeline) ============
const COMPANY_CONTEXT = `"תמיס" (Themis) is an Israeli public real-estate company (נדל"ן). This is its quarterly investor-relations call. Common terms: נכסים מניבים, שיעור תפוסה, NOI, שיעור היוון, שווי הוגן, שערוך, נדל"ן להשקעה, ייזום, דמי שכירות, FFO, LTV, מינוף, אג"ח, ריבית, מימון, רבעון, EBITDA, תזרים מזומנים, אנליסטים.`

async function geminiCorrect(context, utterance) {
  const t0 = Date.now()
  const prompt = `You are a live-caption corrector for a Hebrew investor-relations call.
${COMPANY_CONTEXT}

Below is ONE raw utterance from live Hebrew speech-to-text. Fix ONLY words you are confident are mis-transcribed given the financial context. Do NOT rephrase, do NOT add or remove words — keep exactly the same number of words in the same order. If nothing is clearly wrong, return the text unchanged.

Return ONLY the corrected utterance text. No explanations.

Previous lines (context):
${context || '(start of call)'}

Raw utterance:
${utterance}`
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
}

// ============ live state ============
const pcmChunks = [] // Buffer[]
let pcmBytes = 0
let audioStartRel = null // relative seconds of first audio packet
let liveEnded = false
const lines = [] // {id, raw, corrected, words:[{text, rawText, start}]}
let nextId = 1
const queue = []
let working = false

function liveEdgeRel() {
  return audioStartRel === null ? null : audioStartRel + pcmBytes / 2 / SAMPLE_RATE
}

async function processQueue() {
  if (working) return
  working = true
  while (queue.length) {
    const item = queue.shift()
    const context = lines.slice(-6).map((l) => l.corrected || l.raw).join('\n')
    const { corrected, ms } = await geminiCorrect(context, item.raw)
    const a = item.raw.split(/\s+/), b = (corrected || '').split(/\s+/).filter(Boolean)
    const countOk = corrected && a.length === b.length
    const words = countOk
      ? item.words.map((w, j) => ({ ...w, rawText: w.text, text: b[j] }))
      : item.words.map((w) => ({ ...w, rawText: w.text }))
    const line = { id: item.id, raw: item.raw, corrected, geminiMs: ms, words }
    lines.push(line)
    appendFileSync(LINES_FILE, JSON.stringify(line) + '\n')
    console.log(`[caption] line ${line.id}: ${item.words.length} words, gemini=${ms}ms, fixes=${countOk ? a.reduce((n, w, j) => n + (w !== b[j] ? 1 : 0), 0) : 'raw-fallback'}`)
  }
  working = false
}

// heartbeat: visible proof of life every 30s — buffer size, captions, viewer activity
let pcmHits = 0
setInterval(() => {
  const edge = liveEdgeRel()
  const buffered = edge === null ? 0 : edge - audioStartRel
  console.log(`[status] audio=${audioStartRel === null ? 'NOT STARTED' : Math.round(buffered) + 's buffered'} | captions=${lines.length} lines | viewer=${pcmHits > 0 ? 'PLAYING' : 'idle'}${liveEnded ? ' | CALL ENDED' : ''}`)
  pcmHits = 0
}, 30 * 1000)

// ============ HTTP + WS server ============
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'POST' && url.pathname === '/recall') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      res.writeHead(200).end('ok')
      try {
        const evt = JSON.parse(body)
        if (evt?.event !== 'transcript.data') return
        const ws = evt?.data?.data?.words ?? []
        const raw = ws.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
        if (!raw) return
        queue.push({
          id: nextId++,
          raw,
          words: ws.map((w) => ({ text: w.text, start: w.start_timestamp?.relative ?? null })),
        })
        processQueue()
      } catch { /* ignore */ }
    })
    return
  }
  if (url.pathname === '/state') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ audioStartRel, liveEdgeRel: liveEdgeRel(), liveEnded, sampleRate: SAMPLE_RATE, lines }))
    return
  }
  if (url.pathname === '/pcm') {
    // raw S16LE slice by relative-seconds window
    const from = Number(url.searchParams.get('from'))
    const to = Number(url.searchParams.get('to'))
    if (audioStartRel === null || !isFinite(from) || !isFinite(to) || to <= from) { res.writeHead(416).end(); return }
    const startByte = Math.max(0, Math.round((from - audioStartRel) * SAMPLE_RATE) * 2)
    const endByte = Math.min(pcmBytes, Math.round((to - audioStartRel) * SAMPLE_RATE) * 2)
    if (endByte <= startByte) { res.writeHead(204).end(); return }
    pcmHits++
    const all = Buffer.concat(pcmChunks, pcmBytes)
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-from-rel': String(Math.max(from, audioStartRel)) })
    res.end(all.subarray(startByte, endByte))
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(PAGE)
})

const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (sock) => {
  console.log('[audio] Recall websocket connected')
  sock.on('message', (msg) => {
    try {
      const evt = JSON.parse(msg.toString())
      if (evt?.event !== 'audio_mixed_raw.data') return
      const b64 = evt?.data?.data?.buffer
      const rel = evt?.data?.data?.timestamp?.relative
      if (!b64) return
      if (audioStartRel === null && typeof rel === 'number') {
        audioStartRel = rel
        console.log(`[audio] stream started at rel=${rel.toFixed(2)}s`)
      }
      const buf = Buffer.from(b64, 'base64')
      pcmChunks.push(buf)
      pcmBytes += buf.length
      appendFileSync(PCM_FILE, buf)
    } catch { /* ignore */ }
  })
  sock.on('close', () => {
    console.log('[audio] websocket closed (call likely ended)')
    liveEnded = true
  })
})

// ============ the viewer page ============
const PAGE = `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>תמלול. — שידור חי</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  body{background:#0a0a0a;color:#f5f5f4;font-family:'IBM Plex Sans Hebrew','Segoe UI',sans-serif;margin:0;padding-bottom:120px}
  header{position:sticky;top:0;z-index:5;background:#0a0a0aee;backdrop-filter:blur(8px);padding:16px 28px;border-bottom:1px solid #1f1f1f;display:flex;align-items:center;gap:16px}
  .live{display:inline-flex;align-items:center;gap:8px;color:#ef4444;font-weight:600;font-size:13px;border:1px solid #ef444433;padding:4px 12px;border-radius:99px}
  .dot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse 1.4s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}
  h1{font-size:17px;margin:0;font-weight:600}h1 b{color:#C04A00}
  #behind{margin-inline-start:auto;color:#737373;font-size:13px;font-variant-numeric:tabular-nums;direction:ltr}
  main{max-width:760px;margin:0 auto;padding:48px 28px}
  #words{font-size:26px;line-height:2.1;font-weight:500}
  .w{color:#3f3f46;transition:color .15s}
  .w.past{color:#d4d4d8}
  .w.now{color:#fff;text-shadow:0 0 18px #ffffff44}
  .w.fixed.now,.w.fixed.past{border-bottom:2px solid #C04A0066}
  #overlay{position:fixed;inset:0;background:#0a0a0af8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:10;text-align:center;padding:24px}
  #overlay h2{font-weight:600;font-size:22px;margin:0}
  #overlay p{color:#737373;margin:0;font-size:15px;font-variant-numeric:tabular-nums}
  #joinBtn{background:#C04A00;color:#fff;border:none;border-radius:99px;padding:14px 44px;font-size:17px;font-family:inherit;cursor:pointer;font-weight:600}
  #joinBtn:disabled{background:#27272a;color:#737373;cursor:default}
</style></head><body>
<div id="overlay">
  <span class="live"><span class="dot"></span>שידור חי</span>
  <h2>תמיס — שיחת משקיעים</h2>
  <p id="ovMsg">מתחבר לשידור…</p>
  <button id="joinBtn" disabled>▶ הצטרפו לשידור</button>
</div>
<header>
  <span class="live"><span class="dot"></span>LIVE</span>
  <h1>תמיס — שיחת משקיעים · <b>תמלול.</b></h1>
  <span id="behind"></span>
</header>
<main><div id="words"></div></main>
<script>
const DELAY=Number(new URLSearchParams(location.search).get('delay')||${DEFAULT_DELAY});
const SR=${SAMPLE_RATE};
let st=null, words=[], spans=[], seenLines=0, cur=-1;
let ctx=null, playPos=null, nextAt=0, fetching=false, started=false;
const fmt=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};

async function refreshState(){
  const r=await fetch('/state');st=await r.json();
  const box=document.getElementById('words');
  for(const l of st.lines.slice(seenLines)){
    for(const w of l.words){
      const sp=document.createElement('span');
      sp.className='w'+(w.rawText&&w.rawText!==w.text?' fixed':'');
      sp.textContent=w.text;if(w.rawText&&w.rawText!==w.text)sp.title='מקור: '+w.rawText;
      box.appendChild(sp);box.appendChild(document.createTextNode(' '));
      words.push({start:w.start});spans.push(sp);
    }
  }
  seenLines=st.lines.length;
}

function updateOverlay(){
  const btn=document.getElementById('joinBtn'),msg=document.getElementById('ovMsg');
  if(!st||st.audioStartRel===null){msg.textContent='ממתין לתחילת השיחה…';btn.disabled=true;return}
  const buffered=st.liveEdgeRel-st.audioStartRel;
  if(buffered<DELAY&&!st.liveEnded){
    msg.textContent='השידור יתחיל בעוד '+fmt(DELAY-buffered)+' (מאגר השהיה נבנה)';btn.disabled=true;
  } else { msg.textContent='השידור זמין — בהשהיה של '+fmt(DELAY)+' מאחורי השיחה החיה';btn.disabled=false; }
}

document.getElementById('joinBtn').onclick=()=>{
  document.getElementById('overlay').style.display='none';
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  playPos=st.audioStartRel; nextAt=ctx.currentTime+0.3; started=true;
};

async function pump(){
  if(!started||fetching||!st)return;
  if(nextAt-ctx.currentTime>6)return; // keep ~6s scheduled ahead, no more
  // delay rule: only moments older than (liveEdge - DELAY) may play; after the call ends, everything may
  const allowedEnd=st.liveEnded?st.liveEdgeRel:st.liveEdgeRel-DELAY;
  const finalEnd=Math.min(playPos+4,allowedEnd);
  if(finalEnd-playPos<0.5)return;
  fetching=true;
  try{
    const r=await fetch('/pcm?from='+playPos+'&to='+finalEnd);
    if(r.status===200){
      const ab=await r.arrayBuffer();
      const i16=new Int16Array(ab);
      if(i16.length){
        const buf=ctx.createBuffer(1,i16.length,SR);
        const ch=buf.getChannelData(0);
        for(let i=0;i<i16.length;i++)ch[i]=i16[i]/32768;
        const src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);
        if(nextAt<ctx.currentTime)nextAt=ctx.currentTime+0.05;
        src.start(nextAt);
        nextAt+=buf.duration;
        playPos+=buf.duration;
      }
    }
  }catch(e){}
  fetching=false;
}

function tick(){
  if(started&&st){
    const playingRel=playPos-(nextAt-ctx.currentTime); // rel position of what's sounding NOW
    document.getElementById('behind').textContent='‎-'+fmt(st.liveEdgeRel-playingRel)+' מאחורי החי';
    let lo=0,hi=words.length-1,idx=-1;
    while(lo<=hi){const m=(lo+hi)>>1;if(words[m].start!==null&&words[m].start<=playingRel){idx=m;lo=m+1}else hi=m-1}
    if(idx!==cur){
      spans.forEach((sp,i)=>{sp.classList.toggle('past',i<idx);sp.classList.toggle('now',i===idx)});
      if(idx>=0){const r=spans[idx].getBoundingClientRect();
        if(r.top<120||r.bottom>innerHeight-140)spans[idx].scrollIntoView({block:'center',behavior:'smooth'})}
      cur=idx;
    }
  }
  requestAnimationFrame(tick);
}
window.t0=Date.now()/1000;
setInterval(async()=>{await refreshState();updateOverlay();pump()},1500);
refreshState().then(updateOverlay);
requestAnimationFrame(tick);
</script></body></html>`

// ============ dispatch ============
const [cmd, a1, a2] = process.argv.slice(2)
if (cmd === 'start') {
  startBot(a1, a2).catch((e) => { console.error('❌', e.message); process.exit(1) })
} else {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')
  server.listen(PORT, () => console.log(`live-broadcast on http://localhost:${PORT} (delay=${DEFAULT_DELAY}s, ?delay=60 to override)`))
}
