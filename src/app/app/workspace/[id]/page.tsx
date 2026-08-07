import { cookies } from 'next/headers'
import { AppPage } from '@/components/app/AppPage'
import { WorkspaceRoute } from '@/components/workspace/WorkspaceRoute'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { getWorkspaceFull, companyNamesByItem, listThreads } from '@/lib/db/workspaces'
import { readThreadMessages, type StoredMsg } from '@/lib/workspace/thread'
import type { WorkspaceBlockRow, WorkspaceItemRow, WorkspaceRow } from '@/lib/workspace/data'

export const dynamic = 'force-dynamic'

// A single workspace, read on the SERVER — this is the warm read.
//
// One query returns the row, its items WITH is_open/position, and the working
// document's blocks in order, so the first paint is already the room as it was
// left. Founder, 2026-08-03: "the workspace should remember how i left it. it
// must not open cold every time." A client-side fetch would reintroduce exactly
// the cold frame that instruction rules out.
//
// Only PLAIN DATA crosses into the client component. A Server Component may not
// pass a FUNCTION to a Client Component and neither tsc nor `next build` will
// say so — it fails at render time, which is how every project page shipped
// broken on 2026-08-02 (.claude/rules/app.md).
export default async function WorkspaceByIdRoute({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)

  let workspace: WorkspaceRow | null = null
  let items: WorkspaceItemRow[] = []
  let blocks: WorkspaceBlockRow[] = []
  let companies: Record<string, string> = {}
  let conversation: StoredMsg[] = []
  let loadError: string | null = null

  if (user) {
    try {
      const full = await getWorkspaceFull(supabase, params.id)
      if (full) {
        workspace = full.workspace
        items = full.items
        // THE DOCUMENT, ON THE FIRST PAINT. Forwarded since 2026-08-05: the
        // working document is real blocks now, so the warm read finally means
        // the writing too and not only the shelf. Until then it stopped at the
        // route, which is why a reload lost everything the analyst had written.
        blocks = full.blocks
        companies = await companyNamesByItem(supabase, full.items)
        // AND THE CONVERSATION, for the same reason. Until 2026-08-07 the chat
        // was the one part of this room that did not come back: the shelf, the
        // panes, the document and its citations all reopened warm while the
        // questions that produced them were gone. `listThreads` orders newest
        // first and v1 keeps exactly one (see lib/workspace/thread.ts).
        conversation = readThreadMessages((await listThreads(supabase, params.id))[0]?.messages)
      }
      // full === null means RLS made it NOT THERE — either it never existed or
      // it belongs to someone else. Both are "not found"; the component says so
      // rather than rendering a blank.
    } catch (e) {
      loadError = (e as Error).message
    }
  }

  return (
    <AppPage contentClassName="bg-shell">
      <WorkspaceRoute
        workspace={workspace}
        items={items}
        blocks={blocks}
        conversation={conversation}
        companies={companies}
        loadError={loadError}
        nowIso={new Date().toISOString()}
      />
    </AppPage>
  )
}
