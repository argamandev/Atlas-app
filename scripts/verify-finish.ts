// Headless verification that a finished live-call row satisfies every render precondition the
// existing finished page (loadCompletedCall -> LiveTranscriptView) needs for word-timed karaoke
// with Gemini speaker turns. (loadCall.ts can't be imported here — it pulls `server-only`, a
// Next-bundler shim unresolvable under plain tsx — so we assert the same conditions on the row.)
//   node --env-file=.env.local --import tsx scripts/verify-finish.ts [id]
import { supabaseAdmin } from '../src/lib/supabase'
import type { IvritSegment } from '../src/lib/live/syncEngine'
import type { Transcript } from '../src/lib/types'

const ID = process.argv[2] ?? 'live-finish-demo-tamis-2026-06-14'

async function main() {
  const { data, error } = await supabaseAdmin
    .from('transcripts')
    .select('id, status, processing_step, audio_url, duration, company_id, formatted_data, word_segments')
    .eq('id', ID)
    .maybeSingle()
  if (error) throw error
  if (!data) { console.error('row not found:', ID); process.exit(1) }

  const fd = data.formatted_data as Transcript | null
  const segs = (data.word_segments as IvritSegment[] | null) ?? []
  const wordCount = segs.reduce((n, s) => n + (s.words?.length ?? 0), 0)
  const lines = fd?.sections?.flatMap((s) => s.lines) ?? []
  const speakerNames = (fd?.speakers ?? []).map((s) => s.name)

  console.log(`row: status=${data.status} step=${data.processing_step} company_id=${data.company_id} duration=${data.duration}`)
  console.log(`formatted_data: company="${fd?.company}" quarter="${fd?.quarter}" speakers=${(fd?.speakers ?? []).length} lines=${lines.length}`)
  console.log(`word_segments: ${segs.length} segment(s), ${wordCount} timed words`)
  console.log(`gemini speakers: ${speakerNames.slice(0, 8).join(' | ')}`)

  const res = await fetch(data.audio_url as string, { headers: { Range: 'bytes=0-1' } })
  const ct = res.headers.get('content-type')
  console.log(`audio: HTTP ${res.status} content-type=${ct}`)
  console.log(`audio url: ${data.audio_url}`)

  // loadCompletedCall's word-timed branch fires on (audio_url && word_segments.length) and uses
  // Gemini speaker names when formatted_data has lines. Assert all those preconditions.
  const checks = {
    completed: data.status === 'completed',
    audioReachable: res.ok,
    audioIsAudio: (ct ?? '').includes('audio'),
    hasWordSegments: segs.length > 0 && wordCount > 0,
    hasGeminiLines: lines.length > 0,
  }
  console.log('checks:', JSON.stringify(checks))
  const ok = Object.values(checks).every(Boolean)
  console.log(ok ? 'VERIFY OK — renders as word-timed karaoke with Gemini speaker turns' : 'VERIFY FAILED')
  process.exit(ok ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
