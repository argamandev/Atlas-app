import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { listConversations, createConversation } from '@/lib/db/conversations'
import { resolveConversationScope } from '@/lib/db/conversationScope'

export async function GET(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  try {
    return NextResponse.json(await listConversations(userId))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const realUserId = await getRequestUserId(req)
  const body = await req.json().catch(() => ({}))

  // Owner + project resolution lives in a pure module so it is unit-tested
  // rather than only reachable through a request (see conversationScope.ts).
  const scope = resolveConversationScope(realUserId, body)
  if (!scope.ok) return NextResponse.json({ error: 'unauthorized' }, { status: scope.status })
  const { userId, projectId } = scope

  try {
    const conv = await createConversation(userId, {
      title: body?.title,
      companyId: body?.companyId ?? null,
      transcriptId: body?.transcriptId ?? null,
      projectId,
    })
    return NextResponse.json(conv)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
