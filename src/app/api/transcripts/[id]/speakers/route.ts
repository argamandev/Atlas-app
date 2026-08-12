import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { renameSpeaker } from '@/lib/db/transcripts'

// PATCH /api/transcripts/:id/speakers — rename a speaker on a stored transcript.
//
// ADMIN-ONLY: speaker attribution is corpus CURATION (docs/DATA-MODEL.md, founder decision
// 2026-08-13) — it changes what every user sees, and `renameSpeaker` also propagates the
// corrected name into every user's saved quotes on this call. Until 2026-08-13 this route
// accepted ANY signed-in user, which let one user relabel any transcript and rewrite other
// users' quotes; until 2026-08-03 it had no auth at all (`renameSpeaker` writes through
// supabaseAdmin, bypassing RLS). The page gate does not cover it — the editor calls this
// endpoint directly.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const speakerId: string | undefined = body?.speakerId
  const name: string | undefined = body?.name?.trim()
  const oldName: string = body?.oldName ?? ''
  if (!speakerId || !name) return NextResponse.json({ error: 'speakerId and name required' }, { status: 400 })
  try {
    await renameSpeaker(params.id, speakerId, name, oldName)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
