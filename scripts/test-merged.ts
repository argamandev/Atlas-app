// node --import tsx scripts/test-merged.ts  — memory vs report vs merged (gpt-4o, TPM-safe spacing)
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { correctTranscript, type Profile, type GptChunkFn } from '../src/lib/correction'
import { score } from './lib/measure-core'

const ROOT = process.cwd()
function env(k: string): string {
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const m = t.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const openai = new OpenAI({ apiKey: env('OPENAI_API_KEY') })
const gptChunk: GptChunkFn = (p) =>
  openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: p }], response_format: { type: 'json_object' }, max_tokens: 2000, temperature: 0 })
    .then(r => r.choices[0].message.content ?? '{}')

const PROFILE: Profile = { company: 'אמפא', business: 'נדל"ן מניב', quarter: 'Q1 2026', speakers: 'זוהר רדי (ceo), שירן (moderator)' }

// Pre-extracted on gpt-4o (avoids re-extraction so we stay under the 30k TPM cap):
const MEMORY = ['אמפא','ToHa','מיטאון','אמפא טאואר','מגדל אלקטרה','אמפא ישראל','דוראל','אמפא יובלים','WeWork','עזריאלי טאון','שרונה','לונדון מיניסטור','ראול סרוגו']
const REPORT = ['אמפא','אמפא קפיטל','אמפא יובלים','אמפא ישראל','מגדל אלקטרה','אמפא פארק','גליל ים','אמפא רימון הנדיב','כרמי גת','אמפא TLV','אור אייל','אבי חסיד','לוי','אמפא נדל"ן','בית אמפא','אמצור']
const MERGED = Array.from(new Set([...MEMORY, ...REPORT]))

const raw = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.ivrit-raw.json'), 'utf8'))
  return (j.output[0].result.flat() as { text?: string }[]).map(s => s.text ?? '').join('').trim()
})()
const gold = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.gold.txt'), 'utf8')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const main = async () => {
  const conds: Array<[string, string[]]> = [['MEMORY', MEMORY], ['REPORT', REPORT], ['MERGED (memory∪report)', MERGED]]
  for (let i = 0; i < conds.length; i++) {
    const [label, ents] = conds[i]
    const r = await correctTranscript(raw, PROFILE, ents, gptChunk, 400)
    const s = score(raw, r.text, gold)
    console.log(`\n=== ${label} (${ents.length} entities) ===`)
    console.log(`FIXED ${s.fixed}  INTRODUCED ${s.introduced} ${s.introduced === 0 ? '✅' : '❌'}  remaining ${s.remaining} (raw=46)`)
    if (i < conds.length - 1) { console.log('  …waiting 60s for TPM…'); await sleep(60000) }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
