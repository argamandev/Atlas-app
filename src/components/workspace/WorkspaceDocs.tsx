'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { CloseIcon, PlusIcon, ColumnsIcon, SinglePaneIcon } from '@/components/ds/icons'
import { SourceDocument } from './SourceDocument'
import type { Workspace } from '@/lib/workspace/data'

// The workspace main card: tab bar (design 1726-1756), single or split documents
// with hairline drag gutters (1942-2008), and the no-tabs empty state (1934).

const SPECIAL = ['__doc', '__legal', '__chat']
const isSpecial = (id: string) => SPECIAL.includes(id)

export function WorkspaceDocs({
  workspace,
  openTabs,
  activeTab,
  split,
  multi,
  onSelect,
  onClose,
  onToggleSplit,
  onToggleMulti,
  renderSpecial,
  specialLabel,
}: {
  workspace: Workspace
  openTabs: string[]
  activeTab: string
  split: boolean
  multi: string[]
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onToggleSplit: () => void
  onToggleMulti: (id: string) => void
  renderSpecial: (id: string) => ReactNode
  specialLabel: (id: string) => string
}) {
  const { dict } = useI18n()
  const [flex, setFlex] = useState<Record<string, number>>({})
  const [hoverGutter, setHoverGutter] = useState<string | null>(null)
  const dragging = useRef<{ id: string; nextId: string; startX: number; a: number; b: number } | null>(null)

  const fileById = (id: string) => workspace.files.find((f) => f.id === id)

  // WHAT IS ON SCREEN.
  //
  // In multi-view every tab the user kept in `multi` gets a pane — INCLUDING the
  // working document and the legal panel, which used to be filtered out here.
  // Founder decision, 2026-08-04, asked directly: reading a source on one side
  // and writing about it on the other is "the main point", so a special tab is a
  // pane like any other.
  //
  // The fallback to the active tab is a guard, not a feature. This list going
  // empty is what produced the reported bug: the toggle turned split on with
  // `multi` still empty, every pane vanished, and the user got "Nothing open" —
  // so multi-view looked like it did not exist. The screen must never blank as a
  // RESULT of a view control.
  const paneTabs = split ? openTabs.filter((id) => multi.includes(id)) : activeTab ? [activeTab] : []
  const docsShown = paneTabs.length > 0 ? paneTabs : activeTab ? [activeTab] : []

  function onGutterDown(e: React.PointerEvent, id: string, nextId: string) {
    // Guard the capture call — an unguarded setPointerCapture was a real bug in
    // the Pinge work when the pointer left the element mid-drag.
    const el = e.currentTarget as HTMLElement
    if (el.setPointerCapture && e.pointerId !== undefined) {
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* capture is an optimisation, not a requirement */
      }
    }
    dragging.current = {
      id,
      nextId,
      startX: e.clientX,
      a: flex[id] ?? 1,
      b: flex[nextId] ?? 1,
    }
  }

  function onGutterMove(e: React.PointerEvent) {
    const d = dragging.current
    if (!d) return
    const delta = (e.clientX - d.startX) / 400
    const a = Math.max(0.25, d.a + delta)
    const b = Math.max(0.25, d.b - delta)
    setFlex((f) => ({ ...f, [d.id]: a, [d.nextId]: b }))
  }

  function endDrag() {
    dragging.current = null
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-win border border-float-line bg-canvas shadow-pane">
      {/* tab bar — fixed height so the seam aligns with the side-chat header */}
      <div className="flex h-[46px] flex-none items-center gap-1 border-b border-hairline px-2">
        <div className="atscroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {openTabs.map((id) => {
            const f = fileById(id)
            const label = f ? f.name : specialLabel(id)
            const on = activeTab === id
            const inSplit = multi.includes(id)
            return (
              <div
                key={id}
                className={`group flex h-[34px] flex-none items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] ${
                  on
                    ? 'border-float-line bg-canvas font-medium text-ink'
                    : 'border-transparent text-ink-faint hover:bg-subtle/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  dir={f ? 'ltr' : 'auto'}
                  className="max-w-[190px] truncate"
                >
                  {label}
                </button>
                {/* No `&& f`: the working document may join multi-view too. */}
                {split && (
                  <button
                    type="button"
                    onClick={() => onToggleMulti(id)}
                    title={inSplit ? dict.workspace.removeFromSplit : dict.workspace.addToSplit}
                    className="flex h-4 w-4 items-center justify-center rounded text-ink-ghost hover:text-ink"
                  >
                    {inSplit ? (
                      <CloseIcon size={11} strokeWidth={2.2} />
                    ) : (
                      <PlusIcon size={11} strokeWidth={2.2} />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onClose(id)}
                  aria-label={dict.common.close}
                  className="flex h-4 w-4 items-center justify-center rounded text-ink-ghost opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                >
                  <CloseIcon size={11} strokeWidth={2.2} />
                </button>
              </div>
            )
          })}
        </div>
        {/* The control the founder could not read. It now shows the state it
            will PUT YOU IN — two panes when you are in one, one pane when you
            are in several — and says so in words on hover. */}
        <button
          type="button"
          onClick={onToggleSplit}
          title={split ? dict.workspace.singleView : dict.workspace.multiView}
          aria-pressed={split}
          className={`flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors ${
            split ? 'bg-ink text-paper' : 'text-ink-faint hover:bg-subtle hover:text-ink'
          }`}
        >
          {split ? (
            <SinglePaneIcon size={15} strokeWidth={1.7} />
          ) : (
            <ColumnsIcon size={15} strokeWidth={1.7} />
          )}
        </button>
      </div>

      <div className="flex min-h-0 flex-1" onPointerMove={onGutterMove} onPointerUp={endDrag}>
        {docsShown.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
            <div className="text-[15px] font-medium text-ink">{dict.workspace.noTabsHead}</div>
            <p className="max-w-[320px] text-[13px] leading-[1.6] text-ink-muted">
              {dict.workspace.noTabsBody}
            </p>
          </div>
        ) : (
          // ONE PANE RENDERER FOR EVERY TAB KIND. Single view is just this list
          // with one entry in it — the special tabs used to take a separate
          // full-width branch above, which is precisely why the working document
          // could never sit beside a source.
          docsShown.map((id, i) => {
            const f = fileById(id)
            const body = isSpecial(id) ? (
              renderSpecial(id)
            ) : f ? (
              <SourceDocument workspaceId={workspace.id} file={f} />
            ) : null
            if (!body) return null
            const notLast = i < docsShown.length - 1
            const nextId = notLast ? docsShown[i + 1] : ''
            const active = hoverGutter === id || dragging.current?.id === id
            return (
              <div key={id} className="flex min-w-0" style={{ flex: flex[id] ?? 1 }}>
                <div className="min-w-0 flex-1">{body}</div>
                {notLast && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    onPointerDown={(e) => onGutterDown(e, id, nextId)}
                    onPointerEnter={() => setHoverGutter(id)}
                    onPointerLeave={() => setHoverGutter(null)}
                    onDoubleClick={() => setFlex((s) => ({ ...s, [id]: 1, [nextId]: 1 }))}
                    title={dict.workspace.resetSplit}
                    className="flex w-2 flex-none cursor-col-resize items-stretch justify-center"
                  >
                    <span
                      className="my-0 block transition-all"
                      style={{
                        width: active ? 2 : 1,
                        background: active ? '#ADADAD' : '#DEDEDE',
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// FilePreview lived here until 2026-08-04: a hardcoded Hebrew "דוח שנתי" about
// Tigbur, with invented revenue and margin, rendered for EVERY file whatever it
// actually was. It is now components/workspace/SourceDocument.tsx, which reads
// the row. Nothing about the old one is worth keeping — not even as a fallback,
// which is exactly how fabricated figures end up on screen when a fetch fails.
