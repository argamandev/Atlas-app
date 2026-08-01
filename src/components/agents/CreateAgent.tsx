'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { CloseIcon, PlusIcon } from '@/components/ds/icons'
import { AGENT_SCOPE_KINDS, type AgentCard, type AgentScopeKind, type AgentTarget } from '@/lib/agents/data'

// Create agent (design lines 2211-2261). Name · what it should do · assignment.
// The brief asks the UI to encourage detail, so the task field carries a hint.
// Submit is gated on name + description; nothing else is invented as a rule.

export function CreateAgent({
  targets,
  onCancel,
  onCreate,
}: {
  /** selectable assignment targets per scope kind, from the stub feeds */
  targets: Record<AgentScopeKind, AgentTarget[]>
  onCancel: () => void
  onCreate: (agent: Omit<AgentCard, 'id'>) => void
}) {
  const { dict } = useI18n()
  const [name, setName] = useState('')
  const [task, setTask] = useState('')
  const [scope, setScope] = useState<AgentScopeKind>('Workspace')
  // the SELECTED id; the label is looked up from it at submit time
  const [targetId, setTargetId] = useState<string>('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const scopeLabel: Record<AgentScopeKind, string> = {
    Call: dict.agents.scopeCall,
    Workspace: dict.agents.scopeWorkspace,
    Company: dict.agents.scopeCompany,
    Sector: dict.agents.scopeSector,
    Report: dict.agents.scopeReport,
  }
  const canSubmit = name.trim().length > 0 && task.trim().length > 0
  const label = 'mb-[7px] text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-ghost'

  function submit() {
    if (!canSubmit) return
    onCreate({
      name: name.trim(),
      ini: name.trim().slice(0, 2).toUpperCase(),
      domain: '',
      role: '',
      description: task.trim(),
      status: 'idle',
      scopeKind: scope,
      // the agent stores the human label; the id only ever drove selection
      scopeTarget: (targets[scope] ?? []).find((t) => t.id === targetId)?.label ?? '',
      done: false,
      task: '',
      out: '',
      when: 'just now',
      lead: '',
      findings: [],
    })
  }

  return (
    <div
      onMouseDown={onCancel}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(28,24,14,.28)] p-8"
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="atscroll max-h-full w-full max-w-[520px] overflow-auto rounded-[18px] border border-hairline bg-canvas px-7 pb-[22px] pt-[26px] shadow-modal"
      >
        <div className="mb-5 flex items-start justify-between gap-3.5">
          <div className="min-w-0">
            <div className="font-display text-[24px] font-medium tracking-[-0.018em] text-ink">
              {dict.agents.createAgent}
            </div>
            <div className="mt-[3px] text-[12.5px] text-ink-ghost">{dict.agents.createSubtitle}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            title={dict.common.close}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-faint hover:bg-subtle hover:text-ink"
          >
            <CloseIcon size={17} strokeWidth={1.8} />
          </button>
        </div>

        <div className={label}>{dict.agents.agentName}</div>
        <div className="mb-[18px] flex items-center gap-2 rounded-[10px] border border-hairline bg-paper px-3 py-2.5">
          <span dir="ltr" className="flex-none font-mono-num text-[13px] text-ink-ghost">
            &gt;
          </span>
          <input
            autoFocus
            dir="ltr"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={dict.agents.namePlaceholder}
            className="min-w-0 flex-1 bg-transparent font-mono-num text-[13.5px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-ghost"
          />
        </div>

        <div className={label}>{dict.agents.whatShouldItDo}</div>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={dict.agents.taskPlaceholder}
          className="mb-1.5 min-h-[88px] w-full resize-y rounded-[10px] border border-hairline bg-paper px-3 py-[11px] text-[13.5px] leading-[1.6] text-ink outline-none placeholder:text-ink-ghost"
        />
        <div className="mb-[18px] text-[11.5px] text-ink-ghost">{dict.agents.taskHint}</div>

        <div className="mb-[9px] flex items-baseline gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-ghost">
            {dict.agents.assignTo}
          </span>
          <span className="text-[11.5px] text-ink-ghost">{dict.agents.optional}</span>
        </div>
        <div className="mb-[11px] flex gap-1.5">
          {AGENT_SCOPE_KINDS.map((k) => {
            const on = scope === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setScope(k)
                  setTargetId('')
                }}
                className={`flex-1 rounded-[9px] border px-1.5 py-2 text-[12.5px] ${
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

        <div className="atscroll mb-[22px] flex max-h-[168px] flex-col gap-0.5 overflow-auto rounded-[10px] border border-hairline bg-paper p-1.5">
          {(targets[scope] ?? []).map((t) => {
            // keyed and selected by id, never by label — two workspaces can hold
            // a report of the same name, and label-keying selected both at once
            const on = targetId === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTargetId(on ? '' : t.id)}
                className={`flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-start ${on ? 'bg-subtle' : 'hover:bg-subtle/60'}`}
              >
                <span
                  className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border-[1.5px] ${on ? 'border-ink' : 'border-hairline'}`}
                >
                  {on && <span className="h-[7px] w-[7px] rounded-full bg-ink" />}
                </span>
                <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                  {t.label}
                </span>
                <span dir="ltr" className="flex-none font-mono-num text-[10.5px] text-ink-ghost">
                  {t.meta}
                </span>
              </button>
            )
          })}
          {(targets[scope] ?? []).length === 0 && (
            <div className="px-2.5 py-3 text-[12px] text-ink-ghost">{dict.common.empty}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[9px] px-3.5 py-2.5 text-[13px] font-medium text-ink-muted hover:bg-subtle"
          >
            {dict.common.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex items-center gap-[7px] rounded-[9px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon size={15} strokeWidth={1.9} />
            {dict.agents.createCta}
          </button>
        </div>
      </div>
    </div>
  )
}
