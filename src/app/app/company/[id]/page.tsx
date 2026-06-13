import { notFound } from 'next/navigation'
import { getCompany } from '@/lib/db/companies'
import { listCompanyCalls } from '@/lib/db/calls'
import { listQuotes } from '@/lib/db/quotes'
import { getCurrentUser } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { AppPage } from '@/components/app/AppPage'
import { CompanyView } from '@/components/company/CompanyView'

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id)
  if (!company) notFound()

  const [calls, user] = await Promise.all([listCompanyCalls(params.id), getCurrentUser()])
  const quotes = await listQuotes(user.userId ?? DEMO_USER_ID, params.id)

  return (
    <AppPage>
      <CompanyView company={company} calls={calls} quotes={quotes} />
    </AppPage>
  )
}
