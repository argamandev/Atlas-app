import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runLiveBroadcastFinish, DEMO_CALL_ID } from '@/lib/live/finishLiveCall'

// Finish trigger for the live call. Marks a `processing` stub and fires the Gemini finish pipeline
// fire-and-forget over THIS airing's captured broadcast buffer (mirrors POST /api/transcripts →
// runPipeline). The client polls GET /api/live/finish for completion. A `completed` row may be from a
// PRIOR airing (the id is reused), so we re-finish unless one is already in flight.
export const dynamic = 'force-dynamic'

// Status-only (no trigger) — lets the client re-derive finish state after a refresh.
export async function GET() {
  const { data } = await supabaseAdmin
    .from('transcripts').select('status').eq('id', DEMO_CALL_ID).maybeSingle()
  return NextResponse.json({ id: DEMO_CALL_ID, status: data?.status ?? 'none' })
}

export async function POST() {
  const { data } = await supabaseAdmin
    .from('transcripts').select('status').eq('id', DEMO_CALL_ID).maybeSingle()
  // Already running → don't fire a second pipeline; the poll will see completion.
  if (data?.status === 'processing') {
    return NextResponse.json({ id: DEMO_CALL_ID, status: 'processing' })
  }

  // Flip to processing synchronously so the poll/banner reflects it immediately (the row exists from a
  // prior airing; runLiveBroadcastFinish also upserts it for the first-ever case).
  await supabaseAdmin
    .from('transcripts').update({ status: 'processing', processing_step: 'formatting' }).eq('id', DEMO_CALL_ID)
  setImmediate(() => {
    runLiveBroadcastFinish({ markProcessing: true }).catch(async (err: Error) => {
      console.error('[live/finish] FAILED:', err.message)
      await supabaseAdmin
        .from('transcripts').update({ status: 'failed', error_message: err.message }).eq('id', DEMO_CALL_ID)
    })
  })
  return NextResponse.json({ id: DEMO_CALL_ID, status: 'processing' })
}
