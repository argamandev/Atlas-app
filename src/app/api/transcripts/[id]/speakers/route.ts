import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { renameSpeaker } from '@/lib/db/transcripts'

// PATCH /api/transcripts/:id/speakers — rename a speaker on a stored transcript.
//
// Had NO auth of any kind until 2026-08-03: `renameSpeaker` writes through supabaseAdmin, which
// bypasses RLS, so an anonymous request could rewrite speaker labels on any transcript by id.
// The page gate does not cover it — the editor calls this endpoint directly.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

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
