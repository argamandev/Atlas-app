'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { useDemoState } from '@/lib/demo/DemoStateProvider'
import { DemoBanner } from '@/components/ds/DemoBanner'
import { CommandDeck } from './CommandDeck'
import { CreateAgent } from './CreateAgent'
import { AgentDock, type DockTab } from './AgentDock'
import {
  SearchIcon,
  CloseIcon,
  PlusIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  ProfileIcon,
  SparkleIcon,
} from '@/components/ds/icons'
import type { AgentScopeKind, FinishedTask, ScheduledAgent } from '@/lib/agents/data'

// Agents page (design lines 2085-2210): command deck, My Agents grid with a
// per-card menu, Finished tasks, Scheduled agents — plus the create modal
// (2211) and the dock (2263). Agents created here live for the session only.

export function AgentsPage({
  scheduled,
  finished,
  targets,
}: {
  scheduled: ScheduledAgent[]
  finished: FinishedTask[]
  targets: Record<AgentScopeKind, { label: string; meta: string }[]>
}) {
  const { dict } = useI18n()
  const { agents, addAgent } = useDemoState()
  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [dock, setDock] = useState<{ id: string; tab: DockTab } | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return agents
    return agents.filter((a) => `${a.name} ${a.domain} ${a.description}`.toLowerCase().includes(q))
  }, [agents, query])

  const dockAgent = dock ? (agents.find((a) => a.id === dock.id) ?? null) : null
  const sectionLabel = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CommandDeck />
      <DemoBanner />

      <div className="flex min-h-0 flex-1">
        <div className="atscroll min-h-0 flex-1 overflow-auto" onMouseDown={() => setMenuFor(null)}>
          <div className="mx-auto w-full max-w-[1160px] px-10 pb-32 pt-9">
            <div className="flex flex-wrap items-start justify-center gap-11">
              {/* My agents */}
              <div className="min-w-[300px] flex-[1_1_460px]">
                <div className="mb-3.5 flex items-center gap-3.5">
                  <span className={`${sectionLabel} flex-none`}>{dict.agents.myAgents}</span>
                  <div className="flex min-w-0 max-w-[260px] flex-1 items-center gap-2 rounded-[9px] border border-hairline bg-paper px-[11px] py-1.5">
                    <SearchIcon size={14} strokeWidth={1.8} className="flex-none text-ink-ghost" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={dict.agents.searchPlaceholder}
                      className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-ghost"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="flex flex-none text-ink-ghost hover:text-ink"
                        aria-label={dict.common.close}
                      >
                        <CloseIcon size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
                  {shown.map((a) => (
                    <div
                      key={a.id}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="relative rounded-[10px] border border-hairline bg-paper"
                    >
                      <button
                        type="button"
                        onClick={() => setMenuFor(menuFor === a.id ? null : a.id)}
                        className="block w-full px-4 py-[15px] text-start"
                      >
                        <span className="mb-2.5 flex items-center gap-2">
                          <span dir="ltr" className="font-mono-num text-[13px] text-ink-ghost">
                            &gt;
                          </span>
                          <span
                            dir="ltr"
                            className="min-w-0 truncate font-mono-num text-[14px] font-semibold tracking-[-0.01em] text-ink"
                          >
                            {a.name}
                          </span>
                          <span className="ms-auto flex flex-none items-center gap-1.5">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${a.status === 'running' ? 'bg-live' : 'bg-hairline'}`}
                            />
                            <span
                              dir="ltr"
                              className={`font-mono-num text-[11px] ${a.status === 'running' ? 'text-live' : 'text-ink-ghost'}`}
                            >
                              {a.status === 'running' ? dict.agents.working : dict.agents.idle}
                            </span>
                          </span>
                        </span>
                        {a.domain && (
                          <span className="mb-[9px] block truncate font-mono-num text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
                            {a.domain}
                          </span>
                        )}
                        <span className="block text-[12.5px] leading-[1.55] text-ink-muted">
                          {a.description}
                        </span>
                      </button>

                      {menuFor === a.id && (
                        <div className="absolute inset-x-2.5 top-[calc(100%-6px)] z-30 rounded-[11px] border border-hairline bg-canvas p-[5px] shadow-[0_16px_36px_-18px_rgba(28,24,14,.42),0_1px_3px_rgba(28,24,14,.06)]">
                          <button
                            type="button"
                            onClick={() => {
                              setDock({ id: a.id, tab: 'profile' })
                              setMenuFor(null)
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-start hover:bg-subtle"
                          >
                            <ProfileIcon size={15} strokeWidth={1.7} className="flex-none text-ink-muted" />
                            <span className="flex min-w-0 flex-1 flex-col gap-px">
                              <span className="text-[12.5px] font-semibold text-ink">
                                {dict.agents.agentProfile}
                              </span>
                              <span className="text-[11px] text-ink-ghost">{dict.agents.viewAndEdit}</span>
                            </span>
                          </button>
                          {a.findings.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDock({ id: a.id, tab: 'chat' })
                                setMenuFor(null)
                              }}
                              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-start hover:bg-subtle"
                            >
                              <SparkleIcon size={15} className="flex-none text-ink" />
                              <span className="flex min-w-0 flex-1 flex-col gap-px">
                                <span className="text-[12.5px] font-semibold text-ink">
                                  {dict.agents.chatWithAgent}
                                </span>
                                <span className="text-[11px] text-ink-ghost">{a.out}</span>
                              </span>
                            </button>
                          ) : (
                            <div className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2.5 opacity-40">
                              <SparkleIcon size={15} className="flex-none text-ink" />
                              <span className="flex min-w-0 flex-1 flex-col gap-px">
                                <span className="text-[12.5px] font-semibold text-ink">
                                  {dict.agents.chatWithAgent}
                                </span>
                                <span className="text-[11px] text-ink-ghost">
                                  {dict.agents.nothingToDiscuss}
                                </span>
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {shown.length === 0 && (
                    <div className="col-span-full rounded-[10px] border border-dashed border-hairline p-6 text-center text-[12.5px] text-ink-ghost">
                      {dict.agents.noMatch.replace('{q}', query)}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-[10px] border border-dashed border-hairline p-4 hover:bg-subtle/50"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper">
                      <PlusIcon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="font-mono-num text-[12.5px] font-semibold text-ink">
                      {dict.agents.createAgent}
                    </span>
                  </button>
                </div>

                {/* Finished tasks */}
                <div className={`${sectionLabel} mb-3 mt-[30px]`}>{dict.agents.finishedTasks}</div>
                <div className="flex flex-col overflow-hidden rounded-[10px] border border-hairline bg-paper">
                  {finished.map((f, i) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setDock({ id: f.agentId, tab: 'chat' })}
                      className={`flex w-full items-center gap-3 px-[15px] py-[13px] text-start hover:bg-subtle/60 ${
                        i < finished.length - 1 ? 'border-b border-hairline' : ''
                      }`}
                    >
                      <span className="flex-none text-[#4F7A52]">
                        <CheckIcon size={16} strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink">{f.title}</div>
                        <div
                          dir="ltr"
                          className="mt-px font-mono-num text-[11.5px] text-ink-faint rtl:text-right"
                        >
                          {f.meta}
                        </div>
                      </div>
                      <span className="flex-none text-ink-ghost rtl:rotate-180">
                        <ChevronRightIcon size={16} strokeWidth={1.7} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scheduled */}
              <div className="min-w-[280px] max-w-[340px] flex-[1_1_300px]">
                <div className={`${sectionLabel} mb-3.5`}>{dict.agents.scheduledAgents}</div>
                <div className="flex flex-col gap-2.5">
                  {scheduled.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center gap-[11px] rounded-[10px] border border-hairline bg-paper px-3.5 py-[13px]"
                    >
                      <span className="flex-none text-ink-faint">
                        <ClockIcon size={17} strokeWidth={1.6} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-ink">{q.name}</div>
                      </div>
                      <span
                        dir="ltr"
                        className="whitespace-nowrap rounded-md bg-panel px-2 py-[3px] font-mono-num text-[11px] text-ink-muted"
                      >
                        {q.scheduleLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {dockAgent && (
          <AgentDock
            agent={dockAgent}
            tab={dock!.tab}
            onTab={(t) => setDock((d) => (d ? { ...d, tab: t } : d))}
            onClose={() => setDock(null)}
          />
        )}
      </div>

      {creating && (
        <CreateAgent
          targets={targets}
          onCancel={() => setCreating(false)}
          onCreate={(a) => {
            const id = addAgent(a)
            setCreating(false)
            setDock({ id, tab: 'profile' })
          }}
        />
      )}
    </div>
  )
}
