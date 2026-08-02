import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { listConversations, createConversation } from '@/lib/db/conversations'

// NOTE — POST below still carries the `?? DEMO_USER_ID` fallback, deliberately and
// temporarily. Lane M's in-flight branch `fix/projects-honesty` rewrites exactly those lines
// (it moves the decision into `src/lib/db/conversationScope.ts`), so changing them here would
// be a merge conflict for no gain. It is listed as a KNOWN EXCEPTION in
// `src/lib/apiAuthBoundary.test.ts` and closes the moment that branch lands.

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
  const realUserId = await getRequestUserId(req)
  const userId = realUserId ?? DEMO_USER_ID
  const body = await req.json().catch(() => ({}))
  const projectId = typeof body?.projectId === 'string' && body.projectId ? body.projectId : null

  // A project chat needs a REAL user: projects are owner-scoped, and the
  // DEMO_USER_ID fallback owns nothing. The composite key would refuse the
  // insert anyway — this just fails with a useful status instead of a 500.
  if (projectId && !realUserId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

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
