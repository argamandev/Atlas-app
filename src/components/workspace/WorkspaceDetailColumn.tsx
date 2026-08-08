'use client'

import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ChevronLeftIcon, PlusIcon, CloseIcon, TrashIcon } from '@/components/ds/icons'
import { type Workspace, type WsFileKind } from '@/lib/workspace/data'

// Detail column (design lines 1566-1702): slides out inside the panel with one of
// four bodies — Files (1578) · Agents (1609) · Chats (1637) · Actions (1666).
//
// THREE OF THE FOUR ARE EMPTY, AND SAY SO (2026-08-06). Agents, chats and
// actions used to render invented content — three agent profiles with invented
// findings, five invented threads, eight invented activity lines — inside a
// workspace whose shelf holds real filings. Founder: *"remove the … 'demo
// content'"*. What replaced them is not a thinner stub: it is the truth, which
// is that no agent has run here, no thread has been saved, and nothing keeps an
// activity log yet.

export type DetailKey = 'files' | 'agents' | 'chats' | 'actions'

// The three REAL provenances carry NO `meta`: a persisted item's page or line
// count is not known here. The legacy display kinds below kept theirs from the
// design's demo content, and they are blank now for the same reason everything
// else on this screen is — "68 pages" under a row read out of the database is a
// real page showing a made-up fact.
const KIND: Record<WsFileKind, { label: string; cls: string; meta: string }> = {
  transcript: { label: 'CALL', cls: 'text-[#4A6E8A] bg-[rgba(74,110,138,.12)]', meta: '' },
  document: { label: 'DOC', cls: 'text-[#9C6B4E] bg-[rgba(156,107,78,.12)]', meta: '' },
  file: { label: 'FILE', cls: 'text-ink-ghost bg-[rgba(0,0,0,.05)]', meta: '' },
  pdf: { label: 'PDF', cls: 'text-[#9C6B4E] bg-[rgba(156,107,78,.12)]', meta: '' },
  xlsx: { label: 'XLS', cls: 'text-[#4F7A52] bg-[rgba(79,122,82,.11)]', meta: '' },
  slide: { label: 'DECK', cls: 'text-[#6A5F8C] bg-[rgba(106,95,140,.12)]', meta: '' },
}

/** Nothing here yet, said in words rather than shown as a blank column. */
function NothingYet({ text }: { text: string }) {
  return (
    <p dir="auto" className="px-1 py-6 text-center text-[12.5px] leading-[1.65] text-ink-ghost">
      {text}
    </p>
  )
}

export function WorkspaceDetailColumn({
  workspace,
  which,
  openTabs,
  onBack,
  onOpenFile,
  onCloseFile,
  onRemoveFile,
  chat,
  onOpenChat,
}: {
  workspace: Workspace
  which: DetailKey
  openTabs: string[]
  onBack: () => void
  onOpenFile: (id: string) => void
  onCloseFile: (id: string) => void
  /**
   * Take the source OFF THE SHELF — a different verb from `onCloseFile`, which
   * only closes its tab. Reporting intent rather than doing it: the shell owns
   * the confirmation, because the sentence it has to show first ("N citations
   * lose their source") is counted from the document's blocks, which live there.
   */
  onRemoveFile: (id: string) => void
  /** the workspace's one saved conversation — `count: 0` means none yet */
  chat: { count: number; title: string }
  /** open the chat panel on the saved conversation */
  onOpenChat: () => void
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
    chats: chat.count > 0 ? 1 : 0,
    actions: workspace.actions.length,
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
                  className="group flex items-center gap-2.5 rounded-[9px] px-2 py-2 hover:bg-subtle/60"
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
                    {/* NOT dir="ltr": a persisted item's name is usually Hebrew
                        (transcript titles are), and dir on the line resolves the
                        WHOLE line from its first strong character — the exact
                        damage .claude/rules/app.md files. <bdi> lets each run
                        resolve on its own; the container keeps the direction. */}
                    <div className="truncate text-[12.5px] text-ink">
                      <bdi>{f.name}</bdi>
                    </div>
                    {[f.year, k.meta].some(Boolean) && (
                      <div className="truncate text-[11px] text-ink-ghost">
                        {[f.year, k.meta].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                  {/* REMOVE, beside CLOSE, and they are not the same act: this
                      one takes the source off the shelf for good, the ✕ next to
                      it only closes its tab. Hidden until the row is hovered so
                      the list stays calm, and always present where there is no
                      hover — an invisible-but-tappable delete would be worse
                      than a visible one. */}
                  <button
                    type="button"
                    onClick={() => onRemoveFile(f.id)}
                    title={dict.workspace.removeFile}
                    aria-label={`${dict.workspace.removeFile} — ${f.name}`}
                    className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink-ghost opacity-0 transition-opacity hover:bg-subtle hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <TrashIcon size={13} strokeWidth={1.9} />
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

        {/* NO AGENT HAS EVER RUN IN A WORKSPACE. `workspace.agents` is [] for
            every real row (present.ts), so this used to render nothing at all —
            except when the demo workspaces were on screen, where it rendered
            three profiles with invented findings. Empty either way; now it says
            so instead of showing a blank column. */}
        {which === 'agents' && <NothingYet text={dict.workspace.agentsEmpty} />}

        {/* Five invented threads stood here, then an empty state saying nothing
            was kept. Since 2026-08-07 `workspace_threads` is actually written,
            and v1 keeps exactly ONE conversation per workspace — so this is a
            list of one or of none, never a thread switcher. */}
        {which === 'chats' &&
          (chat.count === 0 ? (
            <NothingYet text={dict.workspace.chatsEmpty} />
          ) : (
            <button
              type="button"
              onClick={onOpenChat}
              className="flex w-full flex-col gap-0.5 rounded-[9px] px-2 py-2 text-start hover:bg-subtle/60"
            >
              {/* <bdi>, not dir: the title is the user's opening question and
                  the count beside it is Latin digits — the mixed line
                  .claude/rules/app.md keeps filing. An untitled conversation
                  falls back to the section's own name rather than rendering an
                  empty row. */}
              <span className="truncate text-[12.5px] text-ink">
                <bdi>{chat.title || dict.workspace.sectionChats}</bdi>
              </span>
              <span className="text-[11px] text-ink-ghost">
                <bdi>
                  {chat.count === 1
                    ? dict.workspace.chatMessageOne
                    : dict.workspace.chatMessages.replace('{n}', String(chat.count))}
                </bdi>
              </span>
            </button>
          ))}

        {/* The invented sessions are gone with their timestamps. A workspace
            carries `actions` in its shape and nothing fills it, so this is
            written to render the real list the moment something does. */}
        {which === 'actions' &&
          (workspace.actions.length === 0 ? (
            <NothingYet text={dict.workspace.actionsEmpty} />
          ) : (
            <div className="flex flex-col">
              {workspace.actions.map((text, i) => (
                <div key={`${i}-${text}`} className="flex items-start gap-2.5 px-1 py-1.5">
                  <span
                    className="mt-[3px] flex h-4 w-4 flex-none items-center justify-center rounded-full bg-subtle text-[9px] text-ink-faint"
                    aria-hidden
                  >
                    ›
                  </span>
                  <span dir="auto" className="min-w-0 flex-1 text-[12px] leading-[1.5] text-ink-muted">
                    <bdi>{text}</bdi>
                  </span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}
