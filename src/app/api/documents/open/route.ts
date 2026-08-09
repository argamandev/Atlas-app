import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { getCompany } from '@/lib/db/companies'
import { getDocumentsFor, getDocumentByMayaReportId } from '@/lib/documents'
import { listDisclosures } from '@/lib/maya/disclosures'
import { toRemoteSources, type RemoteSource } from '@/lib/maya/filings'
import { ingestFiling } from '@/lib/maya/ingestFiling'
import { describeFailure } from '@/lib/maya/types'
import { cacheGet, cacheSet, catalogKey } from '@/lib/maya/catalogCache'
import { needsIngest } from '@/lib/documents/openFiling'

// POST /api/documents/open — a user clicked a filing. Store it unless we already
// hold exactly it, then hand back the document id the viewer renders.
//
// THIS ROUTE IS ATLAS'S INGESTION PATH. `ingestFiling` writes company_documents
// with a company_id, so every document a real user opens becomes corpus,
// correctly attributed — aimed at exactly the filings people want rather than a
// bulk sync of tens of thousands nobody reads.
//
// THE PDF URL IS NEVER TAKEN FROM THE REQUEST. The client sends a mayaReportId;
// the URL is re-derived here from MAYA's own listing for that company. Accepting
// a url would turn this into a fetch-anything proxy running with the service
// role, and the "is it in this company's catalog" check below is what keeps a
// caller from attributing an arbitrary filing to a company it does not belong to.
export async function POST(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const body = (await req.json().catch(() => null)) as {
    companyId?: string
    mayaReportId?: number
    year?: number
  } | null
  const companyId = body?.companyId
  const mayaReportId = Number(body?.mayaReportId)
  const year = Number(body?.year)
  if (!companyId || !Number.isInteger(mayaReportId) || !Number.isInteger(year)) {
    return NextResponse.json({ error: 'companyId, mayaReportId and year required' }, { status: 400 })
  }

  const company = await getCompany(companyId)
  if (!company?.taseIssuerId) return NextResponse.json({ error: 'unknown company' }, { status: 404 })

  // Already held, and it is this exact filing → nothing to fetch. Checked by
  // filing identity FIRST because that index is unique table-wide, so this also
  // catches a filing stored under a period label we would not have guessed.
  const held = await getDocumentByMayaReportId(mayaReportId)
  if (held && held.companyId === companyId) {
    return NextResponse.json({ documentId: held.id, pageCount: held.pageCount })
  }

  const key = catalogKey(company.taseIssuerId, year)
  let sources = cacheGet<RemoteSource[]>(key)
  if (!sources) {
    const res = await listDisclosures({
      issuerId: Number(company.taseIssuerId),
      fromYear: year,
      toYear: year,
    })
    if (!res.ok) return NextResponse.json({ error: describeFailure(res.failure) }, { status: 502 })
    sources = toRemoteSources(res.data)
    cacheSet(key, sources)
  }

  const source = sources.find((s) => s.mayaReportId === mayaReportId)
  if (!source) {
    return NextResponse.json({ error: 'filing is not in this company’s catalog' }, { status: 404 })
  }

  // The period's row may exist and point at a DIFFERENT filing — a Hebrew and an
  // English edition share one (company, quarter, doc_type). Serving it would show
  // a document nobody clicked. See lib/documents/openFiling.ts.
  const existing = (await getDocumentsFor(companyId, source.period)).find((d) => d.docType === source.docType)
  if (existing && !needsIngest(existing, mayaReportId)) {
    return NextResponse.json({ documentId: existing.id, pageCount: existing.pageCount })
  }

  try {
    const { documentId, pageCount } = await ingestFiling({
      source,
      companyId,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    })
    return NextResponse.json({ documentId, pageCount })
  } catch (e) {
    // The pane renders a stated failure. There is no stub behind this any more.
    console.error('[POST /api/documents/open] ingest failed', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
