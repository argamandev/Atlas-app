// Phase 1 demo runner: feed the recorded live תמיס (Or Yam) session through the finish pipeline to
// create a finished `transcripts` row renderable at /app/live/<id>. Idempotent; reuses the same
// runDemoFinish() the POST /api/live/finish endpoint uses.
//   node --env-file=.env.local --import tsx scripts/finish-live-call.ts [optional-user-uuid]
import { runDemoFinish } from '../src/lib/live/finishLiveCall'

async function main() {
  const res = await runDemoFinish()
  console.log(`[finish] DONE -> ${res.url}`)
  console.log(`[finish] audio=${res.audioUrl}  dur=${Math.round(res.durationSec)}s  words=${res.wordCount}`)
}

main().catch((e) => {
  console.error('[finish] FAILED:', e)
  process.exit(1)
})
