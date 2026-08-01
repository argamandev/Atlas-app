import { NextResponse, type NextRequest } from 'next/server'
import { loadCompletedCall } from '@/lib/live/loadCall'
import { getRequestUserId } from '@/lib/auth'

// Returns the finished call as a LiveCall JSON so the client (LiveSession) can inline-render
// LiveTranscriptView after the live→finished swap, without a server navigation.
//
// AUTH REQUIRED: this returns the same full transcript payload that /print/[id] renders. Gating
// the page while leaving this open would have left the exposure one URL away — found at review
// of the login-gate branch, 2026-08-01. Its only caller is the authenticated live viewer.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const call = await loadCompletedCall(params.id)
  if (!call) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(call)
}
