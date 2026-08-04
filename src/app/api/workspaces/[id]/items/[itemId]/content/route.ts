import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { loadItemContent, ItemNotFound } from '@/lib/workspace/content'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; itemId: string } }

/**
 * What one shelf item actually says.
 *
 * `no-store`: this is a private read whose underlying transcript is REGENERATED
 * when a call is re-processed (see citationState in lib/workspace/present) — a
 * cached copy would go on showing the previous run's words. .claude/rules/app.md
 * files the case where a long max-age pinned a bad response past its own fix.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    const content = await loadItemContent(supabase, params.id, params.itemId)
    return NextResponse.json({ content }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof ItemNotFound) {
      return NextResponse.json({ error: 'item not found' }, { status: 404 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
