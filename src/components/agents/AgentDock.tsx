'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { DemoInline } from '@/components/ds/DemoBanner'
import {
  CloseIcon,
  ExpandIcon,
  CollapseIcon,
  ArrowUpIcon,
  SparkleIcon,
  ScissorsIcon,
  MicIcon,
  LevelsIcon,
} from '@/components/ds/icons'
import { AGENT_SCOPE_KINDS, type AgentCard, type AgentScopeKind } from '@/lib/agents/data'

// Agent panel — rebuilt to the founder's 2026-08-01 design round.
//
// What changed from the first import: the two tabs became a segmented control
// ("Findings & chat" | "Profile") with the active half filled solid ink; the
// 34px initials tile became a small sparkle; the composer grew a snip / tools /
// mic row and a helper line; and "Widen" now takes the panel over the WHOLE
// main area rather than stretching it to 560px.
//
// Everything the agent "says" is fabricated — this chapter has no agent runtime.
// Findings and the canned reply therefore carry inline demo markers, and the
// input is inert with a stated reason (rules/app.md: degradation must be VISIBLE).

export type DockTab = 'profile' | 'chat'

type Exchange = { question: string; answer: string }

export function AgentDock({
  agent,
  tab,
  onTab,
  onClose,
  wide,
  onWide,
  seedQuestion,
}: {
  agent: AgentCard
  tab: DockTab
  onTab: (t: DockTab) => void
  onClose: () => void
  wide: boolean
  onWide: (w: boolean) => void
  /** opening from "Recent agent chats" replays that question */
  seedQuestion?: string | null
}) {
  const { dict } = useI18n()
  const [scope, setScope] = useState<AgentScopeKind>(agent.scopeKind)
  const [thread, setThread] = useState<Exchange[]>([])

  useEffect(() => setScope(agent.scopeKind), [agent.scopeKind])

  // A new agent, or a different recent chat, starts its own thread.
  useEffect(() => {
    setThread(seedQuestion ? [{ question: seedQuestion, answer: dict.agents.cannedReply }] : [])
  }, [agent.id, seedQuestion, dict.agents.cannedReply])

  // Esc closes the panel — a panel with no keyboard exit is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const suggestions = useMemo(
    () => [dict.agents.chipFound, dict.agents.chipReasoning, dict.agents.chipChangeMind],
    [dict.agents]
  )

  const scopeLabel: Record<AgentScopeKind, string> = {
    Call: dict.agents.scopeCall,
    Workspace: dict.agents.scopeWorkspace,
    Sector: dict.agents.scopeSector,
    Report: dict.agents.scopeReport,
  }
  const label = 'mb-[7px] text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-ghost'
  const field =
    'w-full rounded-[10px] border border-hairline bg-canvas px-3 py-2.5 text-[13px] leading-[1.6] text-ink outline-none'
  const iconBtn =
    'flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-subtle hover:text-ink'

  // Docked: a 380px rail. Wide: the panel owns the main area and centres its
  // content in the same 720px column the rest of the app reads in.
  const column = wide ? 'mx-auto w-full max-w-[720px]' : 'w-full'

  return (
    <aside
      className={`flex min-w-0 flex-col bg-paper ${
        wide ? 'min-h-0 flex-1' : 'w-[380px] flex-none border-s border-hairline'
      }`}
    >
      <div className="flex-none">
        <div className={`${column} flex items-center gap-[11px] px-[18px] py-3.5`}>
          <span className="flex-none text-ink">
            <SparkleIcon size={16} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              dir="ltr"
              className="truncate font-mono-num text-[13.5px] font-semibold text-ink rtl:text-right"
            >
              {agent.name}
            </span>
            <span dir="auto" className="truncate text-[11px] text-ink-ghost">
              {agent.role || agent.scopeTarget || dict.agents.noTarget}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onWide(!wide)}
            title={wide ? dict.agents.collapseDock : dict.agents.expandDock}
            aria-label={wide ? dict.agents.collapseDock : dict.agents.expandDock}
            className={iconBtn}
          >
            {wide ? <CollapseIcon size={17} strokeWidth={1.7} /> : <ExpandIcon size={17} strokeWidth={1.7} />}
          </button>
          <button type="button" onClick={onClose} title={dict.common.close} className={iconBtn}>
            <CloseIcon size={17} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Segmented control: the active half is filled solid, not tinted. */}
      <div className="flex-none px-[18px] pb-2.5">
        <div className={`${column} flex gap-1.5`}>
          {(['chat', 'profile'] as const).map((t) => {
            const on = tab === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTab(t)}
                aria-pressed={on}
                className={`flex-1 rounded-lg px-2.5 py-[7px] text-[12.5px] transition-colors ${
                  on ? 'bg-ink font-semibold text-paper' : 'font-medium text-ink-muted hover:bg-subtle/60'
                }`}
              >
                {t === 'chat' ? dict.agents.findingsAndChat : dict.agents.profileTab}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'profile' ? (
        <div className="atscroll min-h-0 flex-1 overflow-auto px-[18px] pb-[18px]">
          <div className={column}>
            <div className={label}>{dict.agents.agentName}</div>
            <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-hairline bg-canvas px-[11px] py-2.5">
              <span dir="ltr" className="flex-none font-mono-num text-[13px] text-ink-ghost">
                &gt;
              </span>
              <input
                key={agent.id}
                dir="ltr"
                defaultValue={agent.name}
                className="min-w-0 flex-1 bg-transparent font-mono-num text-[13.5px] font-semibold text-ink outline-none"
              />
            </div>

            <div className={label}>{dict.agents.task}</div>
            <textarea
              key={`${agent.id}-task`}
              defaultValue={agent.description}
              className={`${field} mb-4 min-h-[86px] resize-y`}
            />

            <div className={label}>{dict.agents.assignedTo}</div>
            <div className="mb-2.5 flex gap-1.5">
              {AGENT_SCOPE_KINDS.map((k) => {
                const on = scope === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setScope(k)}
                    className={`flex-1 rounded-lg border px-1 py-1.5 text-[11.5px] ${
                      on
                        ? 'border-ink bg-ink font-semibold text-paper'
                        : 'border-hairline bg-canvas font-medium text-ink-muted hover:bg-subtle'
                    }`}
                  >
                    {scopeLabel[k]}
                  </button>
                )
              })}
            </div>
            <div className="mb-[18px] rounded-[10px] border border-hairline bg-canvas p-1.5">
              <div className="flex items-center gap-2.5 rounded-[7px] px-2.5 py-2">
                <span className="flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border-[1.5px] border-ink">
                  <span className="h-[7px] w-[7px] rounded-full bg-ink" />
                </span>
                <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                  {agent.scopeTarget || dict.agents.noTarget}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2.5 pt-0.5">
              <button
                type="button"
                className="rounded-lg px-0.5 py-2 text-[12.5px] font-medium text-[#B0533E] hover:bg-subtle"
              >
                {dict.agents.deleteAgent}
              </button>
              <button
                type="button"
                className="rounded-[9px] bg-ink px-4 py-2.5 text-[12.5px] font-semibold text-paper"
              >
                {dict.agents.saveChanges}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="atscroll min-h-0 flex-1 overflow-auto px-[18px] pb-2">
            <div className={`${column} flex flex-col gap-[15px]`}>
              <div dir="auto" className="text-[13.5px] leading-[1.7] text-ink">
                {agent.lead}
              </div>

              <div className="flex flex-col gap-[9px]">
                {agent.findings.map((f) => (
                  <div key={f.src} className="rounded-[11px] border border-hairline bg-canvas px-[13px] py-3">
                    <div dir="auto" className="text-[13px] leading-[1.6] text-ink">
                      {f.text}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span dir="ltr" className="font-mono-num text-[11px] text-ink-ghost">
                        {f.src}
                      </span>
                      {/* invented finding wearing a citation — always marked */}
                      <DemoInline />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setThread((t) => [...t, { question: s, answer: dict.agents.cannedReply }])}
                    // sized so two chips share the first row at the docked
                    // width, as they do in the design
                    className="rounded-full border border-hairline bg-paper px-[11px] py-1.5 text-[12px] text-ink transition-colors hover:bg-subtle"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {thread.map((x, i) => (
                <div key={i} className="flex flex-col gap-[15px]">
                  <div
                    dir="auto"
                    className="max-w-[85%] self-end rounded-[10px] bg-ink px-[13px] py-2.5 text-[13px] leading-[1.55] text-paper"
                  >
                    {x.question}
                  </div>
                  <div dir="auto" className="text-[13.5px] leading-[1.7] text-ink">
                    {x.answer}
                    {/* the agent has no runtime — this reply is scripted */}
                    <span className="ms-2 inline-flex align-middle">
                      <DemoInline />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-none px-[18px] pb-4 pt-2">
            <div className={column}>
              <div className="rounded-xl border border-hairline bg-canvas px-3 pb-2 pt-2.5">
                <input
                  disabled
                  aria-disabled="true"
                  title={dict.agents.chatDisabled}
                  placeholder={dict.agents.askAgent.replace('{name}', agent.name)}
                  className="mb-1.5 w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-ghost disabled:cursor-not-allowed"
                />
                <div className="flex items-center gap-3 text-ink-faint">
                  <ScissorsIcon size={15} strokeWidth={1.6} />
                  <span className="ms-auto flex items-center gap-3">
                    <LevelsIcon size={15} strokeWidth={1.6} />
                    <MicIcon size={15} strokeWidth={1.6} />
                  </span>
                  {/* The design draws this solid; it stays inert until the agent
                      runtime exists, which the helper line and the page banner
                      both say out loud. */}
                  <span
                    aria-hidden
                    className="flex h-[27px] w-[27px] flex-none cursor-not-allowed items-center justify-center rounded-full bg-ink text-paper"
                  >
                    <ArrowUpIcon size={14} strokeWidth={2} />
                  </span>
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] leading-[1.5] text-ink-ghost">
                {dict.agents.answersFrom.replace('{name}', agent.name)}
              </p>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
