import { notFound } from 'next/navigation'
import { getCompany } from '@/lib/db/companies'
import { listCompanyCalls } from '@/lib/db/calls'
import { listQuotes } from '@/lib/db/quotes'
import { listFolders } from '@/lib/db/quoteFolders'
import { listCompanyTranscripts } from '@/lib/transcripts'
import { getCurrentUser } from '@/lib/auth'
import { AppPage } from '@/components/app/AppPage'
import { CompanyView } from '@/components/company/CompanyView'

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string; year?: string; period?: string }
}) {
  const company = await getCompany(params.id)
  if (!company) notFound()

  const [calls, transcripts, user] = await Promise.all([
    listCompanyCalls(params.id),
    listCompanyTranscripts(params.id),
    getCurrentUser(),
  ])
  // No `?? DEMO_USER_ID`. This page is behind the login gate so `userId` should always be
  // present — but `getCurrentUser()` returns null on ANY failure (`resolveUser` swallows every
  // exception), and the fallback then rendered ANOTHER identity's saved quotes and folders as
  // if they were yours. "We could not establish who you are" must show nothing, never someone
  // else's data. The API guard test does not reach here: it scans `src/app/api` only.
  const [quotes, folders] = user.userId
    ? await Promise.all([listQuotes(user.userId, params.id), listFolders(user.userId, params.id)])
    : [[], []]

  // 'reports' was NOT in this list, so ?tab=reports — the tab the documents
  // catalog lives in — fell silently back to Overview. That made the tab
  // unreachable by URL and lost the user's place on every return from a
  // document. ('calls' is kept although CompanyView has no such tab; removing it
  // is a separate question from the one this branch is answering.)
  const TABS = ['quotes', 'calls', 'reports']
  const initialTab = TABS.includes(searchParams.tab ?? '') ? searchParams.tab! : 'overview'

  return (
    <AppPage>
      <CompanyView
        company={company}
        calls={calls}
        transcripts={transcripts}
        quotes={quotes}
        folders={folders}
        initialTab={initialTab}
        initialYear={searchParams.year}
        initialPeriod={searchParams.period}
        isAdmin={user.isAdmin}
      />
    </AppPage>
  )
}
