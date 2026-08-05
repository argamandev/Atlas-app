import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { patchItem, deleteItem, RowNotFound } from '@/lib/db/workspaces'
import { parseItemPatch } from '@/lib/workspace/validate'

/** RLS makes another account's row NOT THERE, so 404 is the honest rendering. */
function fail(e: unknown) {
  const notFound = e instanceof RowNotFound
  return NextResponse.json(
    { error: notFound ? 'not found' : (e as Error).message },
    { status: notFound ? 404 : 500 }
  )
}

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; itemId: string } }

/**
 * LAYOUT ONLY, and deliberately small: opening a source, closing it, or
 * dragging one before another is a PATCH of ONE row, debounced by the client —
 * never a save of the whole workspace. It also does not touch the workspace's
 * updated_at, so "edited 2h ago" keeps meaning edited rather than looked at.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const parsed = parseItemPatch(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const item = await patchItem(supabase, params.id, params.itemId, parsed.value)
    return NextResponse.json({ item })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    // Blocks citing this item are NOT deleted with it. The key releases the
    // source instead, so the user's sentence survives with a visibly broken
    // citation still carrying the label and quote it was written against.
    await deleteItem(supabase, params.id, params.itemId)
    return NextResponse.json({ deleted: true })
  } catch (e) {
    return fail(e)
  }
}
