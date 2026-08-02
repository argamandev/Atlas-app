import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { addSource } from '@/lib/db/projects'
import { parseSourceCreate } from '@/lib/projects/validate'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = parseSourceCreate(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    // Attaching a note to someone else's project fails on the composite key in
    // the DATABASE — not on a check we remembered to write here.
    const source = await addSource(supabase, user.id, params.id, parsed.value.name)
    return NextResponse.json({ source }, { status: 201 })
  } catch (e) {
    const msg = (e as Error).message
    if (/foreign key|violates|not present/i.test(msg)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
