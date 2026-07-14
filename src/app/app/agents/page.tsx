import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getAgentsPageData } from '@/lib/agents/data'
import { AppPage } from '@/components/app/AppPage'
import { ClockIcon, ChevronRightIcon, PlusIcon, CheckIcon } from '@/components/ds/icons'

// Agents page — FRONTEND-ONLY stub, EXACT design anatomy (design lines 1565-1652):
// full-width black command deck ("> …" mono rows), My agents 2-col cards with mono
// "> name" headers + status dots, thin-dash create card with a black + circle,
// Finished tasks list card (green checks), Scheduled column (300px, clock + mono chip).
// Data flows through lib/agents/data.ts so the real agent runtime is a swap there.
export default async function AgentsPage() {
  const locale = getLocale()
  const dict = getDictionary(locale)
  const { agents, scheduled, finished } = await getAgentsPageData()
  const label = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A867C]'

  return (
    <AppPage contentClassName="bg-shell">
      <div className="atscroll flex-1 overflow-y-auto">
        {/* command deck (design lines 1569-1580): tight black strip hugging the > lines */}
        <div
          className="flex-none bg-[#0A0A0A] px-[30px] py-3.5 font-mono-num text-[13.5px] font-medium leading-[1.62] tracking-[0.01em] text-white antialiased"
          dir="ltr"
        >
          <div className="text-[#8F8B82]">&gt; {dict.agents.ready}</div>
        </div>

        {/* body (design lines 1582-1650) */}
        <div className="max-w-[1080px] px-9 pb-[120px] pt-[30px]">
          <div className="flex flex-col items-start gap-9 lg:flex-row">
            {/* My agents + Finished tasks */}
            <div className="min-w-0 flex-1">
              <div className={`${label} mb-3.5`}>{dict.agents.myAgents}</div>
              <div className="grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-2">
                {agents.map((a) => (
                  <div key={a.id} className="rounded-[10px] border border-[#E6E2DA] bg-paper px-4 py-[15px]">
                    <div className="mb-2.5 flex items-center gap-2" dir="ltr">
                      <span className="font-mono-num text-[13px] text-[#B8B3A8]">&gt;</span>
                      <span className="font-mono-num text-[14px] font-semibold tracking-[-0.01em] text-ink">
                        {a.name}
                      </span>
                      <span className="ms-auto flex items-center gap-1.5">
                        {a.status === 'running' ? (
                          <>
                            <span
                              className="h-[6px] w-[6px] rounded-full bg-live"
                              style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                            />
                            <span className="font-mono-num text-[11px] text-live">{dict.agents.running}</span>
                          </>
                        ) : (
                          <>
                            <span className="h-[6px] w-[6px] rounded-full bg-[#C4BFB4]" />
                            <span className="font-mono-num text-[11px] text-[#9A968C]">
                              {dict.agents.idle}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div
                      className="mb-[9px] font-mono-num text-[10.5px] uppercase tracking-[0.08em] text-[#8A867C]"
                      dir="ltr"
                    >
                      {a.domain}
                    </div>
                    <p className="text-[12.5px] leading-[1.55] text-[#6B6862]">{a.description}</p>
                  </div>
                ))}

                {/* create card (design lines 1610-1615): THIN dash #CBC5B8 + black circle */}
                <button
                  type="button"
                  className="flex min-h-[104px] flex-col items-center justify-center gap-[9px] rounded-[10px] border border-dashed border-[#CBC5B8] p-4 text-[#6B6862]"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0A0A0A] text-white">
                    <PlusIcon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="font-mono-num text-[12.5px] font-semibold text-ink">
                    {dict.agents.createAgent}
                  </span>
                </button>
              </div>

              <div className={`${label} mb-3 mt-[30px]`}>{dict.agents.finishedTasks}</div>
              <div className="flex flex-col overflow-hidden rounded-[10px] border border-[#E6E2DA] bg-paper">
                {finished.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="hov-fill flex w-full items-center gap-3 border-b border-[#ECE7DD] px-[15px] py-[13px] text-start last:border-b-0"
                  >
                    <CheckIcon size={16} strokeWidth={1.9} className="flex-none text-[#4F7A52]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink" dir="auto">
                        {t.title}
                      </div>
                      <div className="mt-px font-mono-num text-[11.5px] text-[#8A867C]" dir="ltr">
                        {t.meta}
                      </div>
                    </div>
                    <ChevronRightIcon
                      size={16}
                      strokeWidth={1.7}
                      className="flex-none text-[#B8B3A8] rtl:rotate-180"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Scheduled agents (design lines 1634-1648) */}
            <div className="w-full flex-none lg:w-[300px]">
              <div className={`${label} mb-3.5`}>{dict.agents.scheduledAgents}</div>
              <div className="flex flex-col gap-2.5">
                {scheduled.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-[11px] rounded-[10px] border border-[#E6E2DA] bg-paper px-3.5 py-[13px]"
                  >
                    <ClockIcon size={17} strokeWidth={1.6} className="flex-none text-[#8A867C]" />
                    <div className="min-w-0 flex-1 text-[13px] font-semibold text-ink" dir="auto">
                      {s.name}
                    </div>
                    <span
                      className="flex-none whitespace-nowrap rounded-md bg-[#ECE9E2] px-2 py-[3px] font-mono-num text-[11px] text-[#6B6862]"
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
      </div>
    </AppPage>
  )
}
