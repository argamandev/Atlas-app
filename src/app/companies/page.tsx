// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md
import { getCurrentUser } from '@/lib/auth'
import { getUserTranscripts } from '@/lib/transcripts'
import { AppNav } from '@/components/layout/AppNav'
import { CompaniesView } from '@/components/companies/CompaniesView'
import { DottedSurface } from '@/components/ui/dotted-surface'

export const revalidate = 0

export default async function CompaniesPage() {
  const { userId, userName, isAdmin } = await getCurrentUser()
  const transcripts = await getUserTranscripts(userId, isAdmin)

  return (
    <div className="relative min-h-screen bg-bg flex flex-col overflow-hidden" dir="rtl">
      <DottedSurface className="opacity-20" />
      <div className="scan-line pointer-events-none fixed inset-0 z-10" />

      <AppNav userName={userName} isAdmin={isAdmin} />

      <main className="relative z-20 flex-1 flex flex-col overflow-hidden">
        <CompaniesView transcripts={transcripts} />
      </main>
    </div>
  )
}
