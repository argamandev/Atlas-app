import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { getDocumentsFor } from '@/lib/documents'

// GET /api/documents?companyId=<uuid>&quarter=<Q2 2026> — a call view asks which real
// documents exist for its company+quarter (Report pane: doc_type 'report').
export async function GET(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('companyId')
  const quarter = req.nextUrl.searchParams.get('quarter')
  if (!companyId || !quarter) {
    return NextResponse.json({ error: 'companyId and quarter required' }, { status: 400 })
  }
  const docs = await getDocumentsFor(companyId, quarter)
  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      title: d.title,
      quarter: d.quarter,
      pageCount: d.pageCount,
      lang: d.lang,
    })),
  })
}
