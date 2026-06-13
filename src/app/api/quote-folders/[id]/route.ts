import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { renameFolder, deleteFolder } from '@/lib/db/quoteFolders'
import { DEMO_USER_ID } from '@/lib/api/types'

// PATCH /api/quote-folders/:id — rename a folder { name }.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const folder = await renameFolder(userId, params.id, name)
  return NextResponse.json(folder ?? { ok: true })
}

// DELETE /api/quote-folders/:id — remove a folder (its quotes stay, just unfiled).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  await deleteFolder(userId, params.id)
  return NextResponse.json({ ok: true })
}
