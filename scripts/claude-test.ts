// node --import tsx scripts/claude-test.ts
// V1/V2 Claude correction test: same IVRIT raw, model = claude-sonnet-4-6.
// V1 = no report. V2 = report in Claude's context. Inserts 2 viewable rows + scores vs gold.
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { correctTranscript, type Profile, type GptChunkFn, type Flag } from '../src/lib/correction'
import { score } from './lib/measure-core'

const ROOT = process.cwd()
function env(k: string): string {
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const m = t.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

const anthropic = new Anthropic({ apiKey: env('CLAUDE_API_KEY') })
const MODEL = 'claude-sonnet-4-6'
const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
const YT_URL = 'https://www.youtube.com/watch?v=hYaQQaDe5CU'

const PROFILE: Profile = { company: 'אמפא', business: 'נדל"ן מניב', quarter: 'Q1 2026', speakers: 'זוהר רדי (מנכ"ל), שירן (קשרי משקיעים)' }

const raw = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.ivrit-raw.json'), 'utf8'))
  return (j.output[0].result.flat() as { text?: string }[]).map(s => s.text ?? '').join('').trim()
})()
const gold = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.gold.txt'), 'utf8')
const reportText = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.report.txt'), 'utf8')

function extractJson(s: string): string {
  const f = s.replace(/```json/gi, '').replace(/```/g, '').trim()
  const i = f.indexOf('{'); const j = f.lastIndexOf('}')
  return i >= 0 && j > i ? f.slice(i, j + 1) : f
}

// Claude as the correction model. reportContext (V2) rides in the system prompt.
function makeClaudeChunk(reportContext?: string): GptChunkFn {
  let system = 'אתה מתקן שגיאות תמלול אוטומטי בעברית. החזר אך ורק JSON תקין — ללא טקסט נוסף, ללא markdown. לעולם אל תשכתב או תקצר את התמלול; הצע רק שינויים נקודתיים.'
  if (reportContext) {
    system += '\n\nלהלן הדוח הרבעוני הרשמי של החברה. השתמש בו כמקור סמכותי לאיות שמות, מונחים ומספרים בעת זיהוי שגיאות:\n<report>\n' + reportContext.slice(0, 200000) + '\n</report>'
  }
  return async (prompt) => {
    const stream = anthropic.messages.stream({ model: MODEL, max_tokens: 32000, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, system, messages: [{ role: 'user', content: prompt }] } as Anthropic.MessageStreamParams)
    const msg = await stream.finalMessage()
    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}'
    return extractJson(text)
  }
}

interface Turn { speaker: string; start_text: string }
interface Structure { company: string; quarter: string; year: string; business: string; speakers: { name: string; role: string }[]; turns: Turn[] }

async function claudeStructure(correctedText: string): Promise<Structure> {
  const prompt = `להלן תמלול שיחת משקיעים בעברית (כבר מתוקן). זהה מטא-דאטה וחלק לפי דוברים.
חוקים: אל תשנה מילים. עבור כל מעבר-דובר החזר את הדובר ואת 6-8 המילים הראשונות של אותו תור — מילה במילה כפי שמופיע בטקסט.
החזר JSON בלבד:
{"company":"שם","quarter":"Q1 2026","year":"2026","business":"תחום","speakers":[{"name":"שם","role":"ceo|cfo|moderator|analyst"}],"turns":[{"speaker":"שם","start_text":"שש המילים הראשונות של התור"}]}

התמלול:
${correctedText}`
  const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 8000, system: 'החזר אך ורק JSON תקין.', messages: [{ role: 'user', content: prompt }] })
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}'
  try { return JSON.parse(extractJson(text)) } catch { return { company: PROFILE.company, quarter: PROFILE.quarter, year: '2026', business: PROFILE.business, speakers: [], turns: [] } }
}

type Line = { id: string; speakerId: string; timestamp: string; text: string; flags?: Flag[] }

function buildFormatted(id: string, corrected: string, applied: { original: string; corrected?: string; kind: string; certainty: string; reason: string }[], flags: Flag[], st: Structure) {
  // speakers
  const speakers = (st.speakers.length ? st.speakers : [{ name: 'מנחה', role: 'moderator' }]).map((s, i) => ({ id: `sp${i + 1}`, name: s.name, role: s.role, title: s.name, affiliation: '' }))
  const findSp = (name: string) => speakers.find(s => name && (s.name === name || name.includes(s.name.split(' ')[0]) || s.name.includes(name.split(' ')[0])))?.id ?? speakers[0].id
  // split corrected text into lines by the turn anchors (verbatim slices)
  const anchors = st.turns.map(t => ({ speaker: t.speaker, idx: corrected.indexOf((t.start_text || '').trim()) })).filter(a => a.idx >= 0).sort((a, b) => a.idx - b.idx)
  const lines: Line[] = []
  if (anchors.length === 0) {
    lines.push({ id: 'L1', speakerId: speakers[0].id, timestamp: '00:00:00', text: corrected })
  } else {
    for (let i = 0; i < anchors.length; i++) {
      const start = i === 0 ? 0 : anchors[i].idx
      const end = i + 1 < anchors.length ? anchors[i + 1].idx : corrected.length
      const text = corrected.slice(start, end).trim()
      if (text) lines.push({ id: `L${i + 1}`, speakerId: findSp(anchors[i].speaker), timestamp: '00:00:00', text })
    }
  }
  // attach flags to the first line containing each flag's text
  for (const fl of flags) { const ln = lines.find(l => l.text.includes(fl.text)); if (ln) (ln.flags ??= []).push(fl) }
  return {
    id, company: st.company || PROFILE.company, ticker: '', quarter: st.quarter || PROFILE.quarter,
    date: '2026-06-07', duration: '', youtubeUrl: YT_URL, status: 'completed', createdAt: new Date().toISOString(),
    engine: 'ivrit', model: `${MODEL} (correction)`,
    corrections: applied.map(a => ({ original: a.original, corrected: a.corrected, kind: a.kind, certainty: a.certainty, reason: a.reason })),
    speakers,
    sections: [{ id: 'sec_mgmt', title: 'דברי הנהלה', lines }, { id: 'sec_qa', title: 'שאלות ותשובות', lines: [] }],
  }
}

async function runOne(label: string, id: string, chunk: GptChunkFn, userId: string) {
  console.log(`\n=== ${label} (${id}) ===`)
  const r = await correctTranscript(raw, PROFILE, [], chunk, 100000, 0)   // whole transcript, one Claude call
  const s = score(raw, r.text, gold)
  console.log(`applied ${r.applied.length} | flagged ${r.flags.length} | FIXED ${s.fixed}  INTRODUCED ${s.introduced} ${s.introduced === 0 ? '✅' : '❌'}  remaining ${s.remaining} (raw=46)`)
  console.log('flags: [' + r.flags.map(f => f.text).join(' | ') + ']')
  fs.writeFileSync(path.join(ROOT, 'scripts/out', id + '.txt'), r.text)
  const st = await claudeStructure(r.text)
  const formatted = buildFormatted(id, r.text, r.applied, r.flags, st)
  const { error } = await supabase.from('transcripts').upsert({ id, youtube_url: YT_URL, status: 'completed', processing_step: 'completed', user_id: userId, youtube_title: `אמפא Q1 2026 — ${label}`, formatted_data: formatted })
  if (error) console.log('  insert error:', error.message)
  else console.log(`  → http://localhost:3000/transcript/${id}`)
}

const main = async () => {
  fs.mkdirSync(path.join(ROOT, 'scripts/out'), { recursive: true })
  const { data: rows } = await supabase.from('transcripts').select('user_id').not('user_id', 'is', null).limit(1)
  const userId = rows?.[0]?.user_id
  if (!userId) { console.log('No existing user_id found to attach rows to.'); return }
  console.log('using user_id:', userId)
  await runOne('Claude V1 + thinking (no report)', 'ampa-claude-v1t', makeClaudeChunk(), userId)
  await runOne('Claude V2 + thinking (+ report)', 'ampa-claude-v2t', makeClaudeChunk(reportText), userId)
  console.log('\nDone. Open the two links above (logged in as admin).')
}
main().catch(e => { console.error(e); process.exit(1) })
