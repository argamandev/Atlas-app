import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { listProjects, createProject } from '@/lib/db/projects'
import { parseCreate } from '@/lib/projects/validate'

export const dynamic = 'force-dynamic'

// Queries go through the USER'S client, not supabaseAdmin: RLS is what makes a
// project invisible to another account, and the service-role key bypasses it.

export async function GET() {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const projects = await listProjects(supabase)
    return NextResponse.json({ projects }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = parseCreate(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const project = await createProject(supabase, user.id, parsed.value.name)
    return NextResponse.json({ project }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
