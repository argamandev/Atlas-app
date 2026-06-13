import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getCompany } from '@/lib/db/companies'
import { companyDisplayName } from '@/lib/api/types'
import { AppPage } from '@/components/app/AppPage'
import { ChatView } from '@/components/chat/ChatView'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { SparkleIcon, PlusIcon } from '@/components/ds/icons'

export default async function ChatPage({ searchParams }: { searchParams: { company?: string } }) {
  const locale = getLocale()
  const dict = getDictionary(locale)

  let initialCompany: { id: string; name: string; logoUrl: string | null } | null = null
  if (searchParams.company) {
    const c = await getCompany(searchParams.company)
    if (c) initialCompany = { id: c.id, name: companyDisplayName(c, locale), logoUrl: c.logoUrl }
  }

  const panel = (
    <div className="flex h-full flex-col gap-4">
      <button className="flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink">
        <PlusIcon size={15} />
        {dict.chat.newChat}
      </button>

      <div>
        <SectionHeader label={dict.chat.history} className="mb-1.5" />
        <div className="flex items-center gap-2 rounded-md px-2.5 py-4 text-sm text-ink-faint">
          <SparkleIcon size={15} />
          {dict.common.empty}
        </div>
      </div>

      <div className="mt-auto space-y-4">
        <div>
          <SectionHeader label={dict.chat.myAgents} className="mb-1" />
          <p className="px-2.5 text-xs text-ink-faint">{dict.chat.agentsComingSoon}</p>
        </div>
        <div>
          <SectionHeader label={dict.chat.mySkills} className="mb-1" />
          <p className="px-2.5 text-xs text-ink-faint">{dict.common.comingSoon}</p>
        </div>
      </div>
    </div>
  )

  return (
    <AppPage panel={panel}>
      <ChatView initialCompany={initialCompany} />
    </AppPage>
  )
}
