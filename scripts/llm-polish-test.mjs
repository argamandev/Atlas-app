// llm-polish-test.mjs — bake-off stage 2: raw live transcript -> production Gemini pipeline.
//
// Feeds the Recall-accuracy raw text and the IVRIT simulated-live raw text through the
// EXACT production formatting prompt (copied from src/lib/transcription.ts formatWithGeminiFlash)
// to see which engine's raw output produces the better FINAL transcript.
//
// Usage: node scripts/llm-polish-test.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(__dirname, 'out')

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

const COMPANY = 'אור-ים אנרגיה'
const BUSINESS_DESC = 'renewable energy and storage company' // mirrors production `${business} company`

// EXACT production prompt from src/lib/transcription.ts formatWithGeminiFlash
const buildPrompt = (rawText) => `The text below is a raw IVRIT speech-to-text with no speaker labels. The speaker names are already in the text.

your mission is to understand the context of the call, organize it beautifully with speaker names, paragraphs of each speaker and fix specific typos or wrong words based on the context you understand.

This is an investors call transcript -of a company called "${COMPANY}" which is an Israeli ${BUSINESS_DESC}. It's very important you dont "guess" the fix to a typo and you don't change the number of words in the raw transcript.

Don't rephrase and dont summorize!

Just organize everything, fix specific words you are confident they are wrong based on the context!

${rawText}`

async function gemini(rawText) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: buildPrompt(rawText) }] }],
            generationConfig: { maxOutputTokens: 65536, temperature: 1 },
          }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json.error ?? json)}`)
      const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
      if (!text) throw new Error('empty response')
      return text
    } catch (e) {
      if (attempt === 6) throw e
      console.warn(`attempt ${attempt} failed (${e.message.slice(0, 120)}) — retrying`)
      await new Promise((r) => setTimeout(r, attempt * 5000))
    }
  }
}

const inputs = [
  { key: 'recall', file: join(OUT_DIR, 'bakeoff-recall_acc.txt') },
  { key: 'ivrit', file: join(OUT_DIR, 'bakeoff-ivrit-sim.txt') },
]
for (const inp of inputs) {
  if (!existsSync(inp.file)) { console.error(`missing ${inp.file}`); continue }
  const raw = readFileSync(inp.file, 'utf8')
  console.log(`[${inp.key}] sending ${raw.length} chars through the production prompt...`)
  const t0 = Date.now()
  const out = await gemini(raw)
  const outFile = join(OUT_DIR, `polish-${inp.key}.md`)
  writeFileSync(outFile, out)
  console.log(`[${inp.key}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outFile}`)
}
console.log('\n✅ both pipeline outputs ready for comparison')
