import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runDemoFinish, DEMO_CALL_ID } from '@/lib/live/finishLiveCall'

// Idempotent finish trigger for the live demo. If the finished transcript is already done, returns it;
// otherwise marks a `processing` stub and fires the Gemini finish pipeline fire-and-forget (mirrors
// POST /api/transcripts → runPipeline). The client polls GET /api/transcripts/[id] for completion.
// Demo source = the recorded session; production would feed the live engine's captured buffer.
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
  if (data?.status === 'completed') {
    return NextResponse.json({ id: DEMO_CALL_ID, status: 'completed' })
  }

  setImmediate(() => {
    runDemoFinish({ markProcessing: true }).catch(async (err: Error) => {
      console.error('[live/finish] FAILED:', err.message)
      await supabaseAdmin
        .from('transcripts').update({ status: 'failed', error_message: err.message }).eq('id', DEMO_CALL_ID)
    })
  })
  return NextResponse.json({ id: DEMO_CALL_ID, status: 'processing' })
}
