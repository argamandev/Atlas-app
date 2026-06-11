// live-replay.mjs — offline replay of the live correction pipeline (Core 1 validation).
//
// Takes the fetched Recall transcript (per-word timestamps), chunks it like live utterances,
// runs every chunk through the SAME constrained Gemini corrector as live-pipeline.mjs
// (thinking disabled), and writes a player-ready JSON preserving word timing:
//   scripts/out/replay-corrected.json = { chunks: [{ id, speaker, raw, corrected, fixes,
//     geminiMs, words: [{ text, start, end }] }] }
//
// When a chunk's corrected word count matches the raw count, corrected words inherit the
// raw words' timestamps 1:1 (karaoke-safe). Otherwise the raw words are kept for timing.
//
// Usage: node scripts/live-replay.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(__dirname, 'out')
const SRC = join(OUT_DIR, 'bakeoff-recall_acc.transcript.json')
const OUT = join(OUT_DIR, 'replay-corrected.json')
const MAX_CHUNK_WORDS = 70

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
if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')

// same prompt + config as live-pipeline.mjs (the production-realistic company context)
const COMPANY_CONTEXT = `"אור-ים אנרגיה" is an Israeli public renewable-energy company: solar projects (מגה-וואט, ג'יגה-וואט), energy storage (אגירה, מגה-וואט שעה), and a yielding real-estate arm (נכסים מניבים, שיעור תפוסה, NOI, שיעור היוון). This is its quarterly investor-relations call. Common terms: רבעון, EBITDA מתואם, FFO, CAPEX, תזרים מזומנים, אג"ח, מח"מ, ערך נקוב, LTV, מינוף, גידור, מט"ח, צבר פרויקטים, התחדשות עירונית, הנפקה, אנליסטים, מור בית השקעות.`

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
  for (let attempt = 1; attempt <= 10; attempt++) {
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
      if (attempt === 10) return { corrected: null, ms: Date.now() - t0, error: e.message }
      // patient backoff: 429/503 need real waiting, not rapid retries
      await new Promise((r) => setTimeout(r, 20000 + attempt * 5000))
    }
  }
}

// --- chunk the transcript like live utterances --------------------------------------
if (!existsSync(SRC)) throw new Error(`missing ${SRC} — run fetch first`)
const groups = JSON.parse(readFileSync(SRC, 'utf8'))
const allWords = []
for (const g of Array.isArray(groups) ? groups : groups?.transcript || []) {
  const speaker = g?.participant?.name ?? ''
  for (const w of g?.words || []) {
    allWords.push({ text: w.text, start: w.start_timestamp?.relative ?? null, end: w.end_timestamp?.relative ?? null, speaker })
  }
}
const chunks = []
let cur = []
for (const w of allWords) {
  cur.push(w)
  const endsSentence = /[.!?]$/.test(w.text)
  if ((cur.length >= MAX_CHUNK_WORDS && endsSentence) || cur.length >= MAX_CHUNK_WORDS + 20) {
    chunks.push(cur); cur = []
  }
}
if (cur.length) chunks.push(cur)

console.log(`Replaying live correction: ${allWords.length} words -> ${chunks.length} chunks\n`)
const out = []
const contextLines = []
for (let i = 0; i < chunks.length; i++) {
  const words = chunks[i]
  const raw = words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
  const { corrected, ms, error } = await geminiCorrect(contextLines.slice(-6).join('\n'), raw)
  const a = raw.split(/\s+/), b = (corrected || '').split(/\s+/).filter(Boolean)
  const countOk = corrected && a.length === b.length
  const fixes = countOk ? a.reduce((n, w, j) => n + (w !== b[j] ? 1 : 0), 0) : (corrected ? -1 : null)
  // karaoke-safe: corrected words inherit raw timestamps when counts match
  const outWords = countOk
    ? words.map((w, j) => ({ ...w, text: b[j], rawText: w.text }))
    : words.map((w) => ({ ...w, rawText: w.text }))
  out.push({ id: i + 1, speaker: words[0]?.speaker ?? '', raw, corrected, fixes, geminiMs: ms, error, words: outWords })
  contextLines.push(corrected || raw)
  console.log(`  chunk ${i + 1}/${chunks.length}: ${ms}ms, fixes=${fixes ?? 'FAILED'}${countOk ? '' : corrected ? ' (word count changed — raw timing kept)' : ''}`)
}
writeFileSync(OUT, JSON.stringify({ company: 'אור-ים אנרגיה', chunks: out }, null, 2))
console.log(`\n✅ ${OUT}`)
