// node --import tsx scripts/run-experiment.ts
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { correctTranscript, type Profile, type GptChunkFn } from '../src/lib/correction'
import { score, tokenize, lcsGoldMatched } from './lib/measure-core'

const ROOT = process.cwd()
function env(k: string): string {
  const txt = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const m = txt.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const openai = new OpenAI({ apiKey: env('OPENAI_API_KEY') })
const gptChunk: GptChunkFn = (prompt) =>
  openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
    temperature: 0,
  }).then(r => r.choices[0].message.content ?? '{}')

// Raw IVRIT plain text out of the captured RunPod response.
function rawFromJson(): string {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.ivrit-raw.json'), 'utf8'))
  const segs: { text?: string }[] = j.output[0].result.flat()
  return segs.map(s => s.text ?? '').join('').trim()
}

const PROFILE: Profile = { company: 'אמפא', business: 'נדל"ן מניב', quarter: 'Q1 2026', speakers: 'זוהר רדי (ceo), שירן (moderator)' }

// THROWAWAY measuring stick — NOT shipped. Read off the gold.
const AMPA_ENTITIES = ['אמפא TLV', 'אמפא קפיטל', 'אמפא ישראל', 'אמפא יובלים', 'ToHa', 'מיטאון', 'עזריאלי טאון', 'בית אמצור', 'סרוגו', 'דוראל אורבן']

const gold = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.gold.txt'), 'utf8')

const main = async () => {
  const raw = rawFromJson()
  const out = path.join(ROOT, 'scripts', 'out'); fs.mkdirSync(out, { recursive: true })

  console.log('Running Run A (no list)…')
  const a = await correctTranscript(raw, PROFILE, [], gptChunk)
  fs.writeFileSync(path.join(out, 'runA.txt'), a.text)

  console.log('Running Run B (+ hand-built list)…')
  const b = await correctTranscript(raw, PROFILE, AMPA_ENTITIES, gptChunk)
  fs.writeFileSync(path.join(out, 'runB.txt'), b.text)

  fs.writeFileSync(path.join(out, 'runA.corrections.json'), JSON.stringify(a.applied, null, 2))
  fs.writeFileSync(path.join(out, 'runB.corrections.json'), JSON.stringify(b.applied, null, 2))

  const gToks = tokenize(gold)
  const gbRaw = lcsGoldMatched(tokenize(raw), gToks)

  const show = (label: string, candidate: string, applied: { original: string; corrected?: string }[], flags: number) => {
    const s = score(raw, candidate, gold)
    console.log(`\n=== ${label} ===`)
    console.log(`applied: ${applied.length}  flagged: ${flags}`)
    console.log(`errors: baseline ${s.baselineErrors} -> candidate ${s.candidateErrors}  | FIXED ${s.fixed}  INTRODUCED ${s.introduced} ${s.introduced === 0 ? '✅' : '❌'}  remaining ${s.remaining}`)
    const gc = lcsGoldMatched(tokenize(candidate), gToks)
    const introduced = gToks.map((t, i) => (gbRaw[i] && !gc[i]) ? `${gToks[i - 1] ?? ''} [${t}] ${gToks[i + 1] ?? ''}`.trim() : null).filter(Boolean)
    if (introduced.length) { console.log('  INTRODUCED (broke a correct gold word):'); introduced.forEach(m => console.log('    ' + m)) }
    console.log('  applied corrections:'); applied.forEach(c => console.log(`    "${c.original}" -> "${c.corrected}"`))
  }
  show('RAW baseline', raw, [], 0)
  show('Run A (no list, = shipped)', a.text, a.applied, a.flags.length)
  show('Run B (+ list, measurement)', b.text, b.applied, b.flags.length)
  console.log('\nOutputs: scripts/out/runA.txt, runB.txt, *.corrections.json')
}
main().catch(e => { console.error(e); process.exit(1) })
