import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { DashboardTopBar } from '@/components/layout/DashboardTopBar'
import { UrlInputBar } from '@/components/dashboard/UrlInputBar'
import { TranscriptsTable } from '@/components/dashboard/TranscriptsTable'
import { MOCK_RECENT_TRANSCRIPTS } from '@/lib/mock-data'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-bg flex">
      {/* Main content — pushed right by sidebar */}
      <main className="flex-1 mr-60 flex flex-col min-h-screen">
        <DashboardTopBar />

        <div className="flex-1 p-6 max-w-5xl">
          {/* Page header */}
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-4 bg-accent rounded-full" />
              <h1 className="text-lg font-semibold text-text-primary tracking-tight">דשבורד</h1>
            </div>
            <p className="text-sm text-muted mr-3">ניהול ומעקב אחר תמלולים</p>
          </div>

          {/* URL Input card */}
          <div className="bg-card border border-border rounded p-5 mb-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-text-primary mb-1">תמלול חדש</h2>
              <p className="text-xs text-muted">הדביקו קישור YouTube לשיחת משקיעים לקבלת תמלול מקצועי</p>
            </div>
            <UrlInputBar size="hero" />
          </div>

          {/* Recent transcripts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-3.5 bg-border rounded-full" />
                <h2 className="text-sm font-semibold text-text-primary">תמלולים אחרונים</h2>
              </div>
              <span className="text-2xs text-muted font-mono-num">{MOCK_RECENT_TRANSCRIPTS.length} תמלולים</span>
            </div>
            <TranscriptsTable transcripts={MOCK_RECENT_TRANSCRIPTS} />
          </div>

          {/* Stats row */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              { label: 'תמלולים הושלמו', value: '4', unit: 'השבוע' },
              { label: 'זמן עיבוד ממוצע', value: '2.4', unit: 'דקות' },
              { label: 'שיחות נותחו', value: '23', unit: 'סה"כ' },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded px-4 py-3">
                <div className="text-2xl font-bold text-text-primary font-mono-num tracking-tight" dir="ltr">
                  {stat.value}
                </div>
                <div className="text-xs text-muted mt-0.5">{stat.label}</div>
                <div className="text-2xs text-muted/60 mt-0.5">{stat.unit}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Sidebar — fixed right */}
      <DashboardSidebar />
    </div>
  )
}
