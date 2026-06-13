import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { listConversations, createConversation } from '@/lib/db/conversations'

export async function GET(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  try {
    return NextResponse.json(await listConversations(userId))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => ({}))
  try {
    const conv = await createConversation(userId, {
      title: body?.title,
      companyId: body?.companyId ?? null,
      transcriptId: body?.transcriptId ?? null,
    })
    return NextResponse.json(conv)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
