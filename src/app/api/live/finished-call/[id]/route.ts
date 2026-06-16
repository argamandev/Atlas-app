import { NextResponse } from 'next/server'
import { loadCompletedCall } from '@/lib/live/loadCall'

// Returns the finished call as a LiveCall JSON so the client (LiveSession) can inline-render
// LiveTranscriptView after the live→finished swap, without a server navigation.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const call = await loadCompletedCall(params.id)
  if (!call) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(call)
}
