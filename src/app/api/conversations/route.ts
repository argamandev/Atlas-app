import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { listConversations, createConversation } from '@/lib/db/conversations'

export async function GET(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()
  try {
    return NextResponse.json(await listConversations(userId))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Creating a conversation requires a REAL user, with no fallback. The previous shape resolved
  // the user, discarded a null, and wrote the row as DEMO_USER_ID — so every anonymous caller's
  // chats landed in one shared identity that owns real rows. It also read as authenticated to
  // any reviewer skimming for `getRequestUserId`, which is exactly how it survived this branch's
  // first pass: the guard test matched the CALL and never checked that the result was used.
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const projectId = typeof body?.projectId === 'string' && body.projectId ? body.projectId : null

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
