import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { deleteQuote, updateQuote } from '@/lib/db/quotes'
import { DEMO_USER_ID } from '@/lib/api/types'

// PATCH /api/quotes/:id — edit a saved quote (text) and/or file it into a folder
// ({ folderId } — a folder id to file, or null to unfile). DELETE /api/quotes/:id — remove it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => null)
  const fields: { text?: string; folderId?: string | null } = {}
  if (typeof body?.text === 'string') fields.text = body.text
  if (body && 'folderId' in body) fields.folderId = body.folderId ?? null
  const quote = await updateQuote(userId, params.id, fields)
  return NextResponse.json(quote ?? { ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  await deleteQuote(userId, params.id)
  return NextResponse.json({ ok: true })
}
