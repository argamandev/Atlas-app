import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { getConversation, saveMessages, deleteConversation, titleFromMessages } from '@/lib/db/conversations'
import type { ChatMsg } from '@/lib/api/types'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const conv = await getConversation(userId, params.id)
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(conv)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => null)
  const messages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : []
  try {
    await saveMessages(userId, params.id, messages, body?.title ?? titleFromMessages(messages))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  await deleteConversation(userId, params.id)
  return NextResponse.json({ ok: true })
}
