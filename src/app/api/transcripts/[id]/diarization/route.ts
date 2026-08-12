import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { loadCompletedCall } from '@/lib/live/loadCall'
import { saveSpeakerEdits } from '@/lib/db/transcripts'
import { flattenWords, type SpeakerEdits } from '@/lib/live/syncEngine'

// PATCH /api/transcripts/:id/diarization — reassign a run of words [fromWord..toWord] to a
// speaker (Feature 1). Recomputes the FULL boundary overlay from the current segmentation
// (which already reflects any prior edits), so the result is idempotent and self-consistent.
//
// ADMIN-ONLY: diarization is corpus CURATION (docs/DATA-MODEL.md, founder decision 2026-08-13)
// — because this handler REBUILDS the complete boundary list, one call rewrites the speaker
// attribution of the whole transcript for every user, not just the requested range. Until
// 2026-08-13 any signed-in user could do that to any transcript; until 2026-08-03 it had no
// auth at all (`saveSpeakerEdits` writes through supabaseAdmin, bypassing RLS).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const fromWord = Number(body?.fromWord)
  const toWord = Number(body?.toWord)
  const speakerId: string | undefined = body?.speakerId
  if (
    !Number.isInteger(fromWord) ||
    !Number.isInteger(toWord) ||
    !speakerId ||
    fromWord < 0 ||
    toWord < fromWord
  ) {
    return NextResponse.json({ error: 'fromWord, toWord and speakerId required' }, { status: 400 })
  }

  const call = await loadCompletedCall(params.id)
  if (!call) return NextResponse.json({ error: 'transcript not found' }, { status: 404 })

  const flat = flattenWords(call.transcript)
  if (!flat.length) return NextResponse.json({ error: 'empty transcript' }, { status: 400 })
  if (!call.transcript.segments.some((s) => s.speakerId === speakerId)) {
    return NextResponse.json({ error: 'unknown speaker' }, { status: 400 })
  }

  // per-word speaker → apply the reassignment → rebuild the complete boundary list
  const spk = flat.map((w) => w.speakerId)
  const end = Math.min(toWord, spk.length - 1)
  for (let i = fromWord; i <= end; i++) spk[i] = speakerId
  const boundaries: SpeakerEdits['boundaries'] = []
  for (let i = 0; i < spk.length; i++)
    if (i === 0 || spk[i] !== spk[i - 1]) boundaries.push({ atWordIndex: i, speakerId: spk[i] })

  try {
    await saveSpeakerEdits(params.id, { boundaries })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
