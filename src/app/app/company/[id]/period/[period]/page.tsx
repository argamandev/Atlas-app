import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { LiveTranscriptView } from '@/components/live/LiveTranscriptView'
import { getCompany } from '@/lib/db/companies'
import { listCompanyTranscripts } from '@/lib/transcripts'
import { loadCompletedCall, type LiveCall } from '@/lib/live/loadCall'
import { listDisclosures } from '@/lib/maya/disclosures'
import { toRemoteSources, type RemoteSource } from '@/lib/maya/filings'
import { cacheGet, cacheSet, catalogKey } from '@/lib/maya/catalogCache'
import { buildPeriods } from '@/lib/company/documentCatalog'
import type { Facet } from '@/components/live/FacetPanes'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// A PERIOD, NOT A CALL — the second door into the reader, and the thing that
// closes the loop.
//
// `/app/live/[id]` keys on a TRANSCRIPT id (`loadCompletedCall(params.id)`), and
// a 2024 quarter holding a report and a deck has no transcript id to key on. So
// a period gets its own route, rendering the SAME LiveTranscriptView — not a
// lookalike — with Ask Atlas, snipping, Multi/Single and a way back.
// ─────────────────────────────────────────────────────────────────────────────

export default async function PeriodPage({
  params,
  searchParams,
}: {
  params: { id: string; period: string }
  searchParams: { doc?: string; year?: string }
}) {
  const period = decodeURIComponent(params.period)
  const year = period.match(/((?:19|20)\d{2})$/)?.[1]
  if (!year) notFound()

  const company = await getCompany(params.id)
  if (!company) notFound()

  const transcripts = await listCompanyTranscripts(params.id)
  const held = transcripts.find((t) => t.quarter === period)

  // BOTH artifacts are resolved here, not just the one that was clicked: opening
  // the report should fill the deck pane too, which is the whole point of
  // arriving in Multi. A listing failure leaves both unset and each pane states
  // its own condition — there is no stub behind them.
  let sources: RemoteSource[] | null = null
  if (company.taseIssuerId) {
    const key = catalogKey(company.taseIssuerId, Number(year))
    sources = cacheGet<RemoteSource[]>(key)
    if (!sources) {
      const res = await listDisclosures({
        issuerId: Number(company.taseIssuerId),
        fromYear: Number(year),
        toYear: Number(year),
      })
      if (res.ok) {
        sources = toRemoteSources(res.data)
        cacheSet(key, sources)
      }
    }
  }
  const entry = sources
    ? buildPeriods(
        sources,
        transcripts.map((t) => ({ id: t.id, quarter: t.quarter }))
      ).find((p) => p.period === period)
    : undefined

  const yearNum = Number(year)
  const documentSources = {
    report: entry?.report ? { mayaReportId: entry.report.mayaReportId, year: yearNum } : null,
    slides: entry?.slides ? { mayaReportId: entry.slides.mayaReportId, year: yearNum } : null,
  }

  // With a transcript this IS the existing finished-call page, opened in Multi.
  // Without one the viewer opens on the documents alone — TWO panes, and no
  // third pane apologising for a recording that does not exist.
  const call: LiveCall | null = held
    ? await loadCompletedCall(held.id)
    : {
        id: `period:${params.id}:${period}`,
        title: `${company.displayName} — ${period}`,
        companyName: company.displayName,
        companyNameEn: company.nameEn,
        logoUrl: company.logoUrl,
        quarter: period,
        date: '',
        isLive: false,
        audioUrl: null,
        companyId: company.id,
        transcript: { segments: [], durationSec: 0, hasWordTimings: false },
      }
  if (!call) notFound()

  const availableFacets: Facet[] = held ? ['transcript', 'slides', 'report'] : ['slides', 'report']

  return (
    <AppPage>
      <LiveTranscriptView
        call={call}
        initialView="multi"
        availableFacets={availableFacets}
        backHref={`/app/company/${params.id}?tab=reports&year=${year}&period=${encodeURIComponent(period)}`}
        documentSources={documentSources}
      />
    </AppPage>
  )
}
