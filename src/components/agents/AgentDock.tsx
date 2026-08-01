'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { DemoInline } from '@/components/ds/DemoBanner'
import { CloseIcon, ExpandIcon, ArrowUpIcon } from '@/components/ds/icons'
import { AGENT_SCOPE_KINDS, type AgentCard, type AgentScopeKind } from '@/lib/agents/data'

// Agent dock (design lines 2263-2365): a right-hand dock with two tabs.
// PROFILE (2290) edits name / task / assignment; CHAT (2329) opens on the
// agent's findings. Findings carry an inline demo marker — they are invented
// content wearing citation clothes (spec §2.1).

export type DockTab = 'profile' | 'chat'

export function AgentDock({
  agent,
  tab,
  onTab,
  onClose,
}: {
  agent: AgentCard
  tab: DockTab
  onTab: (t: DockTab) => void
  onClose: () => void
}) {
  const { dict } = useI18n()
  const [wide, setWide] = useState(false)
  const [scope, setScope] = useState<AgentScopeKind>(agent.scopeKind)

  useEffect(() => setScope(agent.scopeKind), [agent.scopeKind])

  // Esc closes the dock — a dock with no keyboard exit is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const scopeLabel: Record<AgentScopeKind, string> = {
    Workspace: dict.agents.scopeWorkspace,
    Company: dict.agents.scopeCompany,
    Call: dict.agents.scopeCall,
    Report: dict.agents.scopeReport,
  }
  const label = 'mb-[7px] text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-ghost'
  const field =
    'w-full rounded-[10px] border border-hairline bg-canvas px-3 py-2.5 text-[13px] leading-[1.6] text-ink outline-none'
  const iconBtn =
    'flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-subtle hover:text-ink'

  return (
    <aside
      className={`flex min-w-0 flex-col border-s border-hairline bg-paper ${wide ? 'w-[560px]' : 'w-[380px]'}`}
    >
      <div className="flex-none border-b border-hairline">
        <div className="flex items-center gap-[11px] py-3.5 pe-3.5 ps-[18px]">
          <span
            dir="ltr"
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-ink font-mono-num text-[11px] font-bold text-paper"
          >
            {agent.ini}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              dir="ltr"
              className="truncate font-mono-num text-[13.5px] font-semibold text-ink rtl:text-right"
            >
              {agent.name}
            </span>
            <span className="truncate text-[11px] text-ink-ghost">
              {agent.scopeTarget || dict.agents.noTarget}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setWide((w) => !w)}
            title={wide ? dict.agents.collapseDock : dict.agents.expandDock}
            className={iconBtn}
          >
            <ExpandIcon size={17} strokeWidth={1.7} />
          </button>
          <button type="button" onClick={onClose} title={dict.common.close} className={iconBtn}>
            <CloseIcon size={17} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="flex flex-none gap-1 px-3.5 pt-2.5">
        {(['profile', 'chat'] as const).map((t) => {
          const on = tab === t
          const canChat = t === 'chat' && agent.findings.length > 0
          if (t === 'chat' && !canChat) return null
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              className={`flex-1 rounded-lg px-2.5 py-[7px] text-[12.5px] ${
                on ? 'bg-subtle font-semibold text-ink' : 'font-medium text-ink-muted hover:bg-subtle/60'
              }`}
            >
              {t === 'profile' ? dict.agents.agentProfile : dict.agents.chatWithAgent}
            </button>
          )
        })}
      </div>

      {tab === 'profile' ? (
        <div className="atscroll min-h-0 flex-1 overflow-auto p-[18px]">
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
      ) : (
        <>
          <div className="atscroll min-h-0 flex-1 overflow-auto p-[18px]">
            <div className="flex flex-col gap-[15px]">
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
            </div>
          </div>
          <div className="flex-none border-t border-hairline px-3.5 pb-4 pt-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-hairline bg-canvas px-3 py-2.5">
              <input
                disabled
                aria-disabled="true"
                title={dict.agents.chatDisabled}
                placeholder={dict.agents.askPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-ghost disabled:cursor-not-allowed"
              />
              <span
                aria-hidden
                className="flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full bg-send-idle text-canvas"
              >
                <ArrowUpIcon size={14} strokeWidth={2} />
              </span>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
