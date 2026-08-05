import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import {
  getWorkspaceFull,
  companyNamesByItem,
  patchWorkspace,
  deleteWorkspace,
  countWorkspaceContents,
  RowNotFound,
} from '@/lib/db/workspaces'
import { parseWorkspacePatch } from '@/lib/workspace/validate'

/** RLS makes another account's row NOT THERE, so 404 is the honest rendering. */
function fail(e: unknown) {
  const notFound = e instanceof RowNotFound
  return NextResponse.json(
    { error: notFound ? 'not found' : (e as Error).message },
    { status: notFound ? 404 : 500 }
  )
}

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export async function GET(_req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    // THE WARM READ. One round trip returns the workspace, its items WITH
    // is_open/position, and the document's blocks in order — so the server's
    // first paint is the room as it was left. No second fetch, and no flash of
    // an empty workbench (the ChatHistory defect filed 2026-08-03 was exactly
    // that flash, and this surface must not ship with it).
    const full = await getWorkspaceFull(supabase, params.id)
    // Not "forbidden" — RLS makes another account's workspace NOT THERE, and
    // 404 is the honest rendering of that.
    if (!full) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const companies = await companyNamesByItem(supabase, full.items)
    return NextResponse.json({ ...full, companies }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const parsed = parseWorkspacePatch(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const workspace = await patchWorkspace(supabase, params.id, parsed.value)
    return NextResponse.json({ workspace })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    // Counted BEFORE the delete and returned with the result, so a caller can
    // report what was destroyed. Lane rule 3 goes further and binds the UI: any
    // delete affordance must show this count before it destroys anything.
    // Threads carry inline jsonb messages, so the cascade takes whole
    // conversations with them rather than unlinking.
    const counts = await countWorkspaceContents(supabase, params.id)
    await deleteWorkspace(supabase, params.id)
    return NextResponse.json({ deleted: true, counts })
  } catch (e) {
    return fail(e)
  }
}
