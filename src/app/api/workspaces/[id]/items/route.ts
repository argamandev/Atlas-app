import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { addItem } from '@/lib/db/workspaces'
import { parseItemCreate } from '@/lib/workspace/validate'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const parsed = parseItemCreate(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    // Attaching to someone else's workspace fails in the DATABASE, on the
    // composite key — not on a check here. Referential-integrity checks bypass
    // RLS, so a single-column key would have validated against a row RLS hides.
    const item = await addItem(supabase, user.id, params.id, parsed.value)
    return NextResponse.json({ item }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
