import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getAgentsPageData } from '@/lib/agents/data'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { AppPage } from '@/components/app/AppPage'

// Agents page — FRONTEND-ONLY stub (Milestone 1). Terminal-flavored per the design
// (design-import lines 1197–1316): black ticker strip, mono agent cards with status
// dots, scheduled rows with mono chips, finished tasks with check marks. All data
// flows through lib/agents/data.ts so the real agent runtime is a swap there.
export default async function AgentsPage() {
  const locale = getLocale()
  const dict = getDictionary(locale)
  const { agents, scheduled, finished } = await getAgentsPageData()

  return (
    <AppPage contentClassName="bg-shell">
      <div className="atscroll flex-1 overflow-y-auto">
        {/* command-deck ticker strip */}
        <div className="bg-rail px-6 py-4">
          <div className="font-mono-num text-[13px] font-semibold text-[#F5F3EE]" dir="ltr">
            {'>'} {dict.agents.ready}
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-8 pt-8 lg:grid-cols-[1fr_320px]">
          <div>
            <SectionHeader label={dict.agents.myAgents} />
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {agents.map((a) => (
                <div key={a.id} className="rounded-card bg-canvas p-4 shadow-card ring-1 ring-hairline">
                  <div className="flex items-center justify-between" dir="ltr">
                    <span className="font-mono-num text-sm font-semibold text-ink">
                      {'>'} {a.name}
                    </span>
                    <span className="flex items-center gap-1.5 font-mono-num text-2xs text-ink-faint">
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
                      {a.status === 'idle' ? dict.agents.idle : dict.agents.running}
                    </span>
                  </div>
                  <div className="mt-2 font-mono-num text-2xs tracking-wider text-ink-faint" dir="ltr">
                    {a.domain}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">{a.description}</p>
                </div>
              ))}

              <button
                type="button"
                className="flex min-h-[120px] flex-col items-center justify-center rounded-card border border-dashed border-ink-faint/40 p-4 transition-colors hover:border-ink-faint/70 hover:bg-canvas/60"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-base leading-none text-white">
                  +
                </span>
                <span className="mt-2 font-mono-num text-xs font-semibold text-ink">
                  {dict.agents.createAgent}
                </span>
              </button>
            </div>

            <div className="mt-10">
              <SectionHeader label={dict.agents.finishedTasks} />
              <div className="mt-3 flex flex-col gap-2">
                {finished.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-card bg-canvas px-4 py-3 shadow-card ring-1 ring-hairline"
                  >
                    <span className="text-sm text-ink-muted">✓</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink" dir="auto">
                        {t.title}
                      </div>
                      <div className="font-mono-num text-2xs text-ink-faint" dir="ltr">
                        {t.meta}
                      </div>
                    </div>
                    <span className="text-ink-faint rtl:rotate-180">›</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <SectionHeader label={dict.agents.scheduledAgents} />
            <div className="mt-3 flex flex-col gap-2">
              {scheduled.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-card bg-canvas px-4 py-3 shadow-card ring-1 ring-hairline"
                >
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <span className="text-ink-faint">◷</span>
                    {s.name}
                  </span>
                  <span
                    className="rounded-md bg-subtle px-2 py-0.5 font-mono-num text-2xs text-ink-muted"
                    dir="ltr"
                  >
                    {s.scheduleLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppPage>
  )
}
