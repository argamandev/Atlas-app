import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { LiveTranscriptView } from '@/components/live/LiveTranscriptView'
import { loadDemoCall, loadCompletedCall } from '@/lib/live/loadCall'

export default async function LivePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { t?: string }
}) {
  const call = params.id === 'demo' ? await loadDemoCall() : await loadCompletedCall(params.id)
  if (!call) notFound()

  const t = searchParams.t ? Number(searchParams.t) : undefined
  const initialSeek = typeof t === 'number' && Number.isFinite(t) ? t : undefined

  return (
    <AppPage>
      <LiveTranscriptView call={call} initialSeek={initialSeek} />
    </AppPage>
  )
}
