// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md
import { getCurrentUser } from '@/lib/auth'
import { getUserTranscripts } from '@/lib/transcripts'
import { AppNav } from '@/components/layout/AppNav'
import { DashboardHome } from '@/components/dashboard/DashboardHome'
import { AdminView } from '@/components/platform/AdminView'
import { DottedSurface } from '@/components/ui/dotted-surface'

export const revalidate = 0

interface Props {
  searchParams: { view?: string }
}

export default async function DashboardPage({ searchParams }: Props) {
  const { userId, userName, isAdmin } = await getCurrentUser()
  const transcripts = await getUserTranscripts(userId, isAdmin)
  const showAdmin = isAdmin && searchParams.view === 'admin'

  return (
    <div className="relative min-h-screen bg-bg flex flex-col overflow-hidden" dir="rtl">
      <DottedSurface className="opacity-20" />
      <div className="scan-line pointer-events-none fixed inset-0 z-10" />

      <AppNav userName={userName} isAdmin={isAdmin} />

      <main className="relative z-20 flex-1 flex flex-col overflow-hidden">
        {showAdmin ? <AdminView /> : <DashboardHome transcripts={transcripts} userName={userName} />}
      </main>
    </div>
  )
}
