import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { deleteQuote, updateQuote } from '@/lib/db/quotes'

// PATCH /api/quotes/:id — edit a saved quote (text) and/or file it into a folder
// ({ folderId } — a folder id to file, or null to unfile). DELETE /api/quotes/:id — remove it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()
  const body = await req.json().catch(() => null)
  const fields: { text?: string; folderId?: string | null } = {}
  if (typeof body?.text === 'string') fields.text = body.text
  if (body && 'folderId' in body) fields.folderId = body.folderId ?? null
  const quote = await updateQuote(userId, params.id, fields)
  return NextResponse.json(quote ?? { ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()
  await deleteQuote(userId, params.id)
  return NextResponse.json({ ok: true })
}
