import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { listFolders, createFolder } from '@/lib/db/quoteFolders'
import { DEMO_USER_ID } from '@/lib/api/types'

// GET /api/quote-folders?companyId=<id> — the user's quote folders for a company.
export async function GET(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const companyId = new URL(req.url).searchParams.get('companyId') ?? undefined
  const folders = await listFolders(userId, companyId)
  return NextResponse.json(folders)
}

// POST /api/quote-folders — create a named folder { companyId, name }.
export async function POST(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const folder = await createFolder(userId, body?.companyId ?? null, name)
  return NextResponse.json(folder, { status: 201 })
}
