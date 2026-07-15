import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { getDocumentMeta, DOCUMENTS_BUCKET } from '@/lib/documents'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/documents/[id]/file — auth-gated PDF bytes from the PRIVATE bucket (files are
// never publicly addressable; this route is the only door).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const meta = await getDocumentMeta(params.id)
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { data, error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).download(meta.storagePath)
  if (error || !data) {
    console.error('[GET /api/documents/:id/file] download failed', error?.message)
    return NextResponse.json({ error: 'file unavailable' }, { status: 502 })
  }
  return new Response(data.stream(), {
    headers: {
      'content-type': 'application/pdf',
      // no-store: the storage path is stable per (company, quarter, type), so a re-ingest
      // MUST invalidate viewers — an hour-long cache once pinned a bad upload in the browser.
      'cache-control': 'private, no-store',
    },
  })
}
