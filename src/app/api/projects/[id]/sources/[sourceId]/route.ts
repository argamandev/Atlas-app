import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { patchSource } from '@/lib/db/projects'
import { parseSourcePatch } from '@/lib/projects/validate'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: { id: string; sourceId: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = parseSourcePatch(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const source = await patchSource(supabase, params.sourceId, parsed.value)
    return NextResponse.json({ source })
  } catch (e) {
    const msg = (e as Error).message
    if (/multiple|no rows|PGRST116/i.test(msg)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
