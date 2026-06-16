import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { LiveTranscriptView } from '@/components/live/LiveTranscriptView'
import { LiveSession } from '@/components/live/LiveSession'
import { loadDemoCall, loadCompletedCall } from '@/lib/live/loadCall'
import { getCompanyByTicker } from '@/lib/db/companies'
import { LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'

export const dynamic = 'force-dynamic'

export default async function LivePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { t?: string; seg?: string; delay?: string }
}) {
  // Live broadcast (Core 1 on the platform) — streams from the live engine via /api/live/*.
  if (params.id === 'live') {
    const company = await getCompanyByTicker('1097229').catch(() => null) // תמיס
    const d = searchParams.delay ? Number(searchParams.delay) : LIVE_BUFFER_SEC
    return (
      <AppPage>
        <LiveSession
          companyName={company?.displayName ?? 'תמיס'}
          companyId={company?.id ?? null}
          quarter="Q2 2026"
          logoUrl={company?.logoUrl ?? null}
          delaySec={Number.isFinite(d) && d > 0 ? d : LIVE_BUFFER_SEC}
        />
      </AppPage>
    )
  }

  const call = params.id === 'demo' ? await loadDemoCall() : await loadCompletedCall(params.id)
  if (!call) notFound()

  const t = searchParams.t ? Number(searchParams.t) : undefined
  const initialSeek = typeof t === 'number' && Number.isFinite(t) ? t : undefined

  return (
    <AppPage>
      <LiveTranscriptView call={call} initialSeek={initialSeek} initialSegmentId={searchParams.seg} />
    </AppPage>
  )
}
