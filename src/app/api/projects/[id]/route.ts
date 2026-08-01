import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { getProjectWithSources, patchProject, listProjectChats } from '@/lib/db/projects'
import { parsePatch } from '@/lib/projects/validate'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const found = await getProjectWithSources(supabase, params.id)
    // Another user's project comes back as NOT THERE rather than "forbidden" —
    // RLS returns no row, and not-found is the correct answer to give.
    if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const chats = await listProjectChats(supabase, params.id, user.id)
    return NextResponse.json(
      { project: found.project, sources: found.sources, chats },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = parsePatch(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const project = await patchProject(supabase, params.id, parsed.value)
    return NextResponse.json({ project })
  } catch (e) {
    // RLS makes another user's row unreachable, so the update matches zero rows
    // and .single() errors. That is a 404, not a 500.
    const msg = (e as Error).message
    if (/multiple|no rows|PGRST116/i.test(msg)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
