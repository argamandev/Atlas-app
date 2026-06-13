import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { LiveTranscriptView } from '@/components/live/LiveTranscriptView'
import { loadDemoCall, loadCompletedCall } from '@/lib/live/loadCall'
import { getCompany } from '@/lib/db/companies'
import { listCompanyCalls } from '@/lib/db/calls'
import { listCompanyTranscripts } from '@/lib/transcripts'
import { getLocale } from '@/lib/i18n/server'
import { companyDisplayName } from '@/lib/api/types'
import { DEMO_LIVE_CALL } from '@/data/demo/liveCall'
import type { CompanyOverviewData } from '@/components/company/CompanyOverview'

export default async function LivePage({ params }: { params: { id: string } }) {
  const call = params.id === 'demo' ? await loadDemoCall() : await loadCompletedCall(params.id)
  if (!call) notFound()

  // Build the company overview (live + latest + upcoming) for the Overview tab.
  let overview: CompanyOverviewData | null = null
  if (call.companyId) {
    const locale = getLocale()
    const [company, calls, transcripts] = await Promise.all([
      getCompany(call.companyId),
      listCompanyCalls(call.companyId),
      listCompanyTranscripts(call.companyId),
    ])
    if (company) {
      const demo = company.ticker === DEMO_LIVE_CALL.companyTicker
      overview = {
        companyName: companyDisplayName(company, locale),
        companyId: company.id,
        logoUrl: company.logoUrl,
        calls,
        transcripts,
        liveHref: demo ? DEMO_LIVE_CALL.href : null,
        liveQuarter: demo ? DEMO_LIVE_CALL.quarter : null,
      }
    }
  }

  return (
    <AppPage>
      <LiveTranscriptView call={call} overview={overview} />
    </AppPage>
  )
}
