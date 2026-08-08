import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { listThreads, addThread, patchThread } from '@/lib/db/workspaces'
import { parseThreadMessages, readThreadMessages, deriveThreadTitle } from '@/lib/workspace/thread'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

/**
 * The workspace's conversation.
 *
 * ONE THREAD, and this route is where that rule is enforced — `workspace_threads`
 * would happily hold many. `listThreads` orders by `updated_at` descending, so
 * "the newest" is the conversation, and any extra row a race managed to create
 * is left alone rather than deleted: this branch has no delete-a-thread UI, and
 * silently destroying a row the user cannot see is not something a save handler
 * gets to do.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    const threads = await listThreads(supabase, params.id)
    const thread = threads[0]
    // No thread is not an error — it is a workspace nobody has asked anything in
    // yet, which is the majority of them.
    return NextResponse.json(
      {
        thread: thread
          ? { id: thread.id, title: thread.title, messages: readThreadMessages(thread.messages) }
          : null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * Replace the conversation with what the browser now holds.
 *
 * A WHOLE-ARRAY PUT rather than an append. The messages live in one jsonb
 * column, so an append would be a read-modify-write with the same lost-update
 * race a replace has, minus the property that makes replace safe: the client is
 * the single writer of its own conversation, and the array it sends is complete.
 * The chat sends these one at a time (single-flight), for the same reason the
 * document's block saves are serialised.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const parsed = parseThreadMessages(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const messages = parsed.value

  try {
    const existing = (await listThreads(supabase, params.id))[0]
    const title = deriveThreadTitle(messages)

    // Creating on someone else's workspace fails in the DATABASE, on the
    // composite (workspace_id, user_id) key — not on a check here. The items
    // route's comment explains why that is the stronger guarantee: referential
    // integrity bypasses RLS, so a single-column key would validate against a
    // row RLS hides.
    const thread = existing
      ? await patchThread(supabase, params.id, existing.id, { messages, title })
      : await addThread(supabase, user.id, params.id, title)

    // The create path inserts an empty `messages` default, so the first save has
    // to write them in a second statement. Skipped when there is nothing to
    // write, which is also the case where `addThread` should not have run.
    const saved =
      existing || messages.length === 0
        ? thread
        : await patchThread(supabase, params.id, thread.id, { messages })

    return NextResponse.json({
      thread: { id: saved.id, title: saved.title, messages: readThreadMessages(saved.messages) },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
