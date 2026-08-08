import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { listWorkspaces, listAllItems, createWorkspace } from '@/lib/db/workspaces'
import { parseWorkspaceCreate } from '@/lib/workspace/validate'

export const dynamic = 'force-dynamic'

// Queries go through the USER'S client, not supabaseAdmin: RLS is what makes a
// workspace invisible to another account, and the service-role key bypasses it.

export async function GET() {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    // Items come back too: the picker's subtitle is "{company} · {n} sources",
    // and both halves are DERIVED rather than stored. RLS scopes this to the
    // caller's own rows, so it is one query rather than one per workspace.
    const [workspaces, items] = await Promise.all([listWorkspaces(supabase), listAllItems(supabase)])
    return NextResponse.json({ workspaces, items }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const parsed = parseWorkspaceCreate(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    // Empty, per founder decision 2026-08-03 — a new workspace seeds nothing.
    const workspace = await createWorkspace(supabase, user.id, parsed.value.name)
    return NextResponse.json({ workspace }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
