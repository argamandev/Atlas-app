import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { patchBlock, deleteBlock, RowNotFound } from '@/lib/db/workspaces'
import { parseBlockPatch } from '@/lib/workspace/validate'

/** RLS makes another account's row NOT THERE, so 404 is the honest rendering. */
function fail(e: unknown) {
  const notFound = e instanceof RowNotFound
  return NextResponse.json(
    { error: notFound ? 'not found' : (e as Error).message },
    { status: notFound ? 404 : 500 }
  )
}

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; blockId: string } }

/**
 * Body and position only. The CITATION is not patchable: a block's anchor and
 * its quoted snapshot are written together, and letting the body move
 * independently of them would let a sentence drift away from the quote it
 * claims to be citing. Re-citing means a new block.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const parsed = parseBlockPatch(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const block = await patchBlock(supabase, params.id, params.blockId, parsed.value)
    return NextResponse.json({ block })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    await deleteBlock(supabase, params.id, params.blockId)
    return NextResponse.json({ deleted: true })
  } catch (e) {
    return fail(e)
  }
}
