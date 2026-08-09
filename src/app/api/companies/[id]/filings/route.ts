import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { getCompany } from '@/lib/db/companies'
import { listCompanyTranscripts } from '@/lib/transcripts'
import { listDisclosures } from '@/lib/maya/disclosures'
import { toRemoteSources, type RemoteSource } from '@/lib/maya/filings'
import { describeFailure } from '@/lib/maya/types'
import { cacheGet, cacheSet, catalogKey } from '@/lib/maya/catalogCache'
import { buildPeriods, periodsForYear } from '@/lib/company/documentCatalog'

// GET /api/companies/[id]/filings?year=2025 — one FISCAL year of a company's
// MAYA catalog, shaped as the drill-down's periods.
//
// NOTHING IS STORED BY THIS ROUTE. The list is live; a PDF is kept only when a
// user opens one (POST /api/documents/open). That is what makes the catalog
// need no table of its own.
//
// ONE YEAR PER REQUEST because MAYA refuses a wider window — verified four ways
// on 2026-08-09, including with an EventId filter: two years, five, sixteen and
// twenty-six all answer `"The date range cannot exceed 1 year."`. So a year's
// coverage cannot be discovered cheaply, and the drill-down asks only for the
// year the user opened.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const year = Number(req.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return NextResponse.json({ error: 'year required' }, { status: 400 })
  }

  const company = await getCompany(params.id)
  if (!company) return NextResponse.json({ error: 'unknown company' }, { status: 404 })
  if (!company.taseIssuerId) {
    // Not an error the user caused, and not something to render as "no filings":
    // one of our 234 companies has no issuer id, so it has no MAYA catalog.
    return NextResponse.json({ error: 'company has no MAYA issuer id' }, { status: 404 })
  }

  const key = catalogKey(company.taseIssuerId, year)
  let sources = cacheGet<RemoteSource[]>(key)
  if (!sources) {
    const res = await listDisclosures({
      issuerId: Number(company.taseIssuerId),
      fromYear: year,
      toYear: year,
    })
    if (!res.ok) {
      // A PARTIAL CATALOG PRESENTED AS COMPLETE is what this refuses. Returning
      // the windows that happened to succeed would let "this issuer filed
      // nothing in 2024" be produced out of a network blip, with total
      // confidence and no way for the screen to know.
      return NextResponse.json({ error: describeFailure(res.failure) }, { status: 502 })
    }
    sources = toRemoteSources(res.data)
    cacheSet(key, sources)
  }

  const transcripts = await listCompanyTranscripts(params.id)
  const periods = buildPeriods(
    sources,
    transcripts.map((t) => ({ id: t.id, quarter: t.quarter }))
  )

  return NextResponse.json({ year: String(year), periods: periodsForYear(periods, String(year)) })
}
