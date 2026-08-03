import { cookies } from 'next/headers'
import { AppPage } from '@/components/app/AppPage'
import { WorkspacePicker } from '@/components/workspace/WorkspacePicker'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { listWorkspaces, listAllItems, companyNamesByItem } from '@/lib/db/workspaces'

export const dynamic = 'force-dynamic'

// Workspace picker — REAL since migration 016. Rows are read on the server so
// the first paint already carries them; there is no client fetch and therefore
// no window in which the page can claim "nothing here yet" while a request is
// still in flight. (That flash is the ChatHistory defect filed 2026-08-03, and
// it is worth not building twice.)
//
// Presentation happens on the CLIENT rather than here: every label is derived,
// and derivation needs the dictionary and locale, which live in LocaleProvider.
// `nowIso` is passed down so the server and client agree on what "2 hours ago"
// means and hydration does not mismatch on a clock difference.
//
// /app/* is gated by src/middleware.ts, so an unauthenticated visitor never
// reaches this. The check is repeated anyway — the page must not render one
// user's shelf to a request it could not identify.
export default async function WorkspaceRoute() {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)

  let workspaces = null
  let items = null
  let companies = {}
  let loadError: string | null = null

  if (user) {
    try {
      workspaces = await listWorkspaces(supabase)
      items = await listAllItems(supabase)
      companies = await companyNamesByItem(supabase, items)
    } catch (e) {
      // Surfaced, never swallowed: an empty grid and a failed query must not
      // look the same.
      loadError = (e as Error).message
    }
  }

  return (
    <AppPage contentClassName="bg-shell">
      <WorkspacePicker
        rows={workspaces ?? []}
        items={items ?? []}
        companies={companies}
        loadError={loadError}
        nowIso={new Date().toISOString()}
      />
    </AppPage>
  )
}
