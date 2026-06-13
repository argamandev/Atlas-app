import { NextRequest, NextResponse } from 'next/server'
import { renameSpeaker } from '@/lib/db/transcripts'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
