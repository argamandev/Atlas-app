import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { LiveTranscriptView } from '@/components/live/LiveTranscriptView'
import { loadDemoCall, loadCompletedCall } from '@/lib/live/loadCall'

export default async function LivePage({ params }: { params: { id: string } }) {
  const call = params.id === 'demo' ? await loadDemoCall() : await loadCompletedCall(params.id)
  if (!call) notFound()

  return (
    <AppPage>
      <LiveTranscriptView call={call} />
    </AppPage>
  )
}
