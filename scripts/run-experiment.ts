// node --import tsx scripts/run-experiment.ts
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { correctTranscript, generateEntities, type Profile, type GptChunkFn } from '../src/lib/correction'
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

  const gToks = tokenize(gold)
  const gbRaw = lcsGoldMatched(tokenize(raw), gToks)

  const show = (label: string, candidate: string, applied: { original: string; corrected?: string }[], flagList: { text: string }[]) => {
    const s = score(raw, candidate, gold)
    const gc = lcsGoldMatched(tokenize(candidate), gToks)
    const introduced = gToks.map((t, i) => (gbRaw[i] && !gc[i]) ? `${gToks[i - 1] ?? ''} [${t}] ${gToks[i + 1] ?? ''}`.trim() : null).filter(Boolean)
    console.log(`\n=== ${label} ===`)
    console.log(`applied ${applied.length} | flagged ${flagList.length} | FIXED ${s.fixed}  INTRODUCED ${s.introduced} ${s.introduced === 0 ? '✅' : '❌'}  remaining ${s.remaining}`)
    if (introduced.length) console.log('  INTRODUCED: ' + introduced.join(' ; '))
    console.log('  flags: [' + flagList.map(f => f.text).join(' | ') + ']')
  }

  console.log('Stage 1: generating auto-entities (V2)…')
  const autoEntities = await generateEntities(raw, PROFILE, gptChunk)
  console.log('AUTO-ENTITIES:', JSON.stringify(autoEntities))
  fs.writeFileSync(path.join(out, 'auto-entities.json'), JSON.stringify(autoEntities, null, 2))

  show('RAW baseline', raw, [], [])

  const conds: Array<[string, string[], number, number]> = [
    ['400w / no-list (shipped)', [], 400, 0],
    ['400w / AUTO entities (V2)', autoEntities, 400, 0],
    ['400w / curated (ceiling)', AMPA_ENTITIES, 400, 0],
    ['200w / AUTO entities', autoEntities, 200, 30],
  ]
  for (const [label, ents, ws, ov] of conds) {
    console.log(`\nRunning: ${label} …`)
    const r = await correctTranscript(raw, PROFILE, ents, gptChunk, ws, ov)
    show(label, r.text, r.applied, r.flags)
    fs.writeFileSync(path.join(out, 'run_' + label.replace(/[^a-zA-Z0-9]/g, '_') + '.txt'), r.text)
    fs.writeFileSync(path.join(out, 'run_' + label.replace(/[^a-zA-Z0-9]/g, '_') + '.json'), JSON.stringify({ applied: r.applied, flags: r.flags }, null, 2))
  }
  console.log('\nOutputs in scripts/out/')
}
main().catch(e => { console.error(e); process.exit(1) })
