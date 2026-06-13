import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { followCall, listFollowedCallIds } from '@/lib/db/quotes'
import { DEMO_USER_ID } from '@/lib/api/types'

// GET → the ids of calls the user follows; POST { callId, follow } → toggle ("My Calendar").
export async function GET(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const ids = await listFollowedCallIds(userId)
  return NextResponse.json(ids)
}

export async function POST(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => null)
  if (!body?.callId) return NextResponse.json({ error: 'callId required' }, { status: 400 })
  await followCall(userId, String(body.callId), body.follow !== false)
  return NextResponse.json({ ok: true })
}
