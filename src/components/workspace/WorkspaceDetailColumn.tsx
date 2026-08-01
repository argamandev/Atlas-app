'use client'

import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ChevronLeftIcon, PlusIcon, CloseIcon } from '@/components/ds/icons'
import {
  WS_AGENT_PROFILES,
  workspaceSessions,
  WS_THREADS,
  WS_THREAD_GROUPS,
  type Workspace,
  type WsFileKind,
} from '@/lib/workspace/data'

// Detail column (design lines 1566-1702): slides out inside the panel with one of
// four bodies — Files (1578) · Agents (1609) · Chats (1637) · Actions (1666).

export type DetailKey = 'files' | 'agents' | 'chats' | 'actions'

const KIND: Record<WsFileKind, { label: string; cls: string; meta: string }> = {
  pdf: { label: 'PDF', cls: 'text-[#9C6B4E] bg-[rgba(156,107,78,.12)]', meta: '68 pages' },
  xlsx: { label: 'XLS', cls: 'text-[#4F7A52] bg-[rgba(79,122,82,.11)]', meta: '4 sheets' },
  slide: { label: 'DECK', cls: 'text-[#6A5F8C] bg-[rgba(106,95,140,.12)]', meta: '24 slides' },
}

export function WorkspaceDetailColumn({
  workspace,
  which,
  openTabs,
  onBack,
  onOpenFile,
  onCloseFile,
}: {
  workspace: Workspace
  which: DetailKey
  openTabs: string[]
  onBack: () => void
  onOpenFile: (id: string) => void
  onCloseFile: (id: string) => void
}) {
  const { dict } = useI18n()

  const titles: Record<DetailKey, string> = {
    files: dict.workspace.sectionFiles,
    agents: dict.workspace.sectionAgents,
    chats: dict.workspace.sectionChats,
    actions: dict.workspace.sectionActions,
  }
  const counts: Record<DetailKey, number> = {
    files: workspace.files.length,
    agents: workspace.agents.length,
    chats: WS_THREADS.length,
    actions: workspaceSessions(workspace).reduce((n, s) => n + s.items.length, 0),
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2.5 pb-[13px] pe-3.5 ps-3 pt-3.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-ink-faint hover:bg-subtle hover:text-ink"
          aria-label={dict.common.back}
        >
          <ChevronLeftIcon size={16} strokeWidth={1.8} className="rtl:rotate-180" />
        </button>
        <span className="flex-1 text-[13px] font-semibold text-ink">{titles[which]}</span>
        <span dir="ltr" className="font-mono-num text-[11px] text-ink-ghost">
          {counts[which]}
        </span>
      </div>

      <div className="atscroll min-h-0 flex-1 overflow-auto px-3.5 pb-4">
        {which === 'files' && (
          <div className="flex flex-col gap-1">
            {workspace.files.map((f) => {
              const k = KIND[f.kind]
              const isOpen = openTabs.includes(f.id)
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2.5 rounded-[9px] px-2 py-2 hover:bg-subtle/60"
                >
                  <span
                    dir="ltr"
                    className={`flex-none rounded-[5px] px-1.5 py-[3px] font-mono-num text-[9.5px] tracking-[0.06em] ${k.cls}`}
                  >
                    {k.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenFile(f.id)}
                    className="min-w-0 flex-1 text-start"
                  >
                    <div dir="ltr" className="truncate text-[12.5px] text-ink rtl:text-right">
                      {f.name}
                    </div>
                    <div dir="ltr" className="truncate text-[11px] text-ink-ghost rtl:text-right">
                      {f.year ? `${f.year} · ` : ''}
                      {k.meta}
                    </div>
                  </button>
                  {isOpen ? (
                    <button
                      type="button"
                      onClick={() => onCloseFile(f.id)}
                      title={dict.common.close}
                      className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink-ghost hover:bg-subtle hover:text-ink"
                    >
                      <CloseIcon size={13} strokeWidth={2} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenFile(f.id)}
                      title={dict.common.add}
                      className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink-ghost hover:bg-subtle hover:text-ink"
                    >
                      <PlusIcon size={13} strokeWidth={2} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {which === 'agents' && (
          <div className="flex flex-col gap-2.5">
            {workspace.agents.map((name) => {
              const p = WS_AGENT_PROFILES[name]
              if (!p) return null
              return (
                <div key={name} className="rounded-[10px] border border-hairline bg-paper p-3">
                  <div className="mb-2 flex items-center gap-2.5">
                    <span
                      dir="ltr"
                      className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-ink font-mono-num text-[10px] font-bold text-paper"
                    >
                      {p.ini}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">{name}</span>
                      <span className="block truncate text-[11px] text-ink-ghost">{p.role}</span>
                    </span>
                    <span dir="ltr" className="flex-none font-mono-num text-[10.5px] text-ink-ghost">
                      {p.when}
                    </span>
                  </div>
                  <div dir="ltr" className="mb-1.5 font-mono-num text-[10.5px] text-ink-faint rtl:text-right">
                    {p.read}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {p.findings.map((f) => (
                      <li key={f} className="flex gap-1.5 text-[11.5px] leading-[1.5] text-ink-muted">
                        <span aria-hidden className="text-ink-ghost">
                          ·
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}

        {which === 'chats' && (
          <div className="flex flex-col gap-3">
            {WS_THREAD_GROUPS.map((g) => {
              const items = WS_THREADS.filter((t) => t.group === g)
              if (!items.length) return null
              return (
                <div key={g}>
                  <div className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-ghost">
                    {g}
                  </div>
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-col gap-0.5 rounded-[9px] px-2 py-2 hover:bg-subtle/60"
                    >
                      <div className="flex items-baseline gap-2">
                        <span
                          dir="auto"
                          className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink"
                        >
                          {t.title}
                        </span>
                        <span dir="ltr" className="flex-none font-mono-num text-[10.5px] text-ink-ghost">
                          {t.when}
                        </span>
                      </div>
                      <span dir="auto" className="truncate text-[11px] text-ink-ghost">
                        {t.snippet}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {which === 'actions' && (
          <div className="flex flex-col gap-3.5">
            {workspaceSessions(workspace).map((s) => (
              <div key={s.label}>
                <div className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-ghost">
                  {s.label}
                </div>
                <div className="flex flex-col">
                  {s.items.map((a, i) => (
                    <div key={`${a.text}-${i}`} className="flex items-start gap-2.5 px-1 py-1.5">
                      <span
                        className={`mt-[3px] flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] ${
                          a.kind === 'agent' ? 'bg-ink text-paper' : 'bg-subtle text-ink-faint'
                        }`}
                        aria-hidden
                      >
                        {a.kind === 'agent' ? '◆' : a.kind === 'build' ? '▣' : a.kind === 'doc' ? '✎' : '›'}
                      </span>
                      <span dir="auto" className="min-w-0 flex-1 text-[12px] leading-[1.5] text-ink-muted">
                        {a.text}
                      </span>
                      <span dir="ltr" className="flex-none font-mono-num text-[10.5px] text-ink-ghost">
                        {a.when}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
