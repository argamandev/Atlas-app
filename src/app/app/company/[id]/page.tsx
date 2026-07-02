import { notFound } from 'next/navigation'
import { getCompany } from '@/lib/db/companies'
import { listCompanyCalls } from '@/lib/db/calls'
import { listQuotes } from '@/lib/db/quotes'
import { listFolders } from '@/lib/db/quoteFolders'
import { listCompanyTranscripts } from '@/lib/transcripts'
import { getCurrentUser } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { AppPage } from '@/components/app/AppPage'
import { CompanyView } from '@/components/company/CompanyView'

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const company = await getCompany(params.id)
  if (!company) notFound()

  const [calls, transcripts, user] = await Promise.all([
    listCompanyCalls(params.id),
    listCompanyTranscripts(params.id),
    getCurrentUser(),
  ])
  const userId = user.userId ?? DEMO_USER_ID
  const [quotes, folders] = await Promise.all([listQuotes(userId, params.id), listFolders(userId, params.id)])

  const initialTab =
    searchParams.tab === 'quotes' || searchParams.tab === 'calls' ? searchParams.tab : 'overview'

  return (
    <AppPage>
      <CompanyView
        company={company}
        calls={calls}
        transcripts={transcripts}
        quotes={quotes}
        folders={folders}
        initialTab={initialTab}
        isAdmin={user.isAdmin}
      />
    </AppPage>
  )
}
