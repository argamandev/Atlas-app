import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { listConversations, createConversation } from '@/lib/db/conversations'
import { resolveProjectId } from '@/lib/db/conversationScope'

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
  // Creating a conversation requires a REAL user, with no fallback. The previous
  // shape resolved the user, discarded a null, and wrote the row as DEMO_USER_ID
  // — so every anonymous caller's chats landed in one shared identity that owns
  // real rows. It also read as authenticated to any reviewer skimming for
  // `getRequestUserId`, which is exactly how it survived a first pass: the guard
  // test matched the CALL and never checked that the result was used.
  //
  // These two lines stay HERE, in the handler, rather than inside a helper. A
  // merge resolution that moved them into `resolveConversationScope` was rejected
  // at the gate for two reasons worth keeping written down: the helper is
  // synchronous, so `apiAuthBoundary.test.ts` could not bind its refusal to an
  // auth call and reported the handler as ungated no matter what the allowlist
  // said — and `src/lib/db` is outside the scan that looks for shared-identity
  // fallbacks, so the hole would have moved somewhere nothing was watching.
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => ({}))

  // Project resolution is the only decision left to make, so it is the only
  // thing the pure module still owns (see conversationScope.ts).
  const projectId = resolveProjectId(body)

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
