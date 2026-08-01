'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { DemoInline } from '@/components/ds/DemoBanner'
import { CloseIcon, PlusIcon, SlidesIcon } from '@/components/ds/icons'
import type { Workspace, WsFile } from '@/lib/workspace/data'

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
  const fileTabs = openTabs.filter((id) => !isSpecial(id))
  const docsShown = split
    ? fileTabs.filter((id) => multi.includes(id))
    : activeTab && !isSpecial(activeTab)
      ? [activeTab]
      : []

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
                {split && f && (
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
        <button
          type="button"
          onClick={onToggleSplit}
          title={dict.workspace.splitToggle}
          className={`flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors ${
            split ? 'bg-ink text-paper' : 'text-ink-faint hover:bg-subtle hover:text-ink'
          }`}
        >
          <SlidesIcon size={15} strokeWidth={1.7} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1" onPointerMove={onGutterMove} onPointerUp={endDrag}>
        {isSpecial(activeTab) ? (
          <div className="min-h-0 flex-1">{renderSpecial(activeTab)}</div>
        ) : docsShown.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
            <div className="text-[15px] font-medium text-ink">{dict.workspace.noTabsHead}</div>
            <p className="max-w-[320px] text-[13px] leading-[1.6] text-ink-muted">
              {dict.workspace.noTabsBody}
            </p>
          </div>
        ) : (
          docsShown.map((id, i) => {
            const f = fileById(id)
            if (!f) return null
            const notLast = i < docsShown.length - 1
            const nextId = notLast ? docsShown[i + 1] : ''
            const active = hoverGutter === id || dragging.current?.id === id
            return (
              <div key={id} className="flex min-w-0" style={{ flex: flex[id] ?? 1 }}>
                <div className="min-w-0 flex-1">
                  <FilePreview file={f} />
                </div>
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

// The design fakes a document preview with markup rather than rendering a real
// PDF (there is no document backend in this chapter) — so it is demo-marked.
function FilePreview({ file }: { file: WsFile }) {
  const { dict } = useI18n()
  return (
    <div className="atscroll h-full min-h-0 overflow-auto bg-paper px-8 py-7">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-3 flex items-center gap-2">
          <span dir="ltr" className="font-mono-num text-[12px] text-ink-faint">
            {file.name}
          </span>
          <DemoInline />
        </div>
        <div className="rounded-xl border border-hairline bg-canvas px-9 py-8" dir="rtl">
          <div className="mb-1.5 font-display text-[21px] text-ink">דוח שנתי {file.year ?? ''}</div>
          <div className="mb-[18px] text-[12.5px] text-ink-ghost">קבוצת תיגבור · מסחר ושירותים</div>
          <p className="mb-3 text-[14px] leading-[1.95] text-ink">
            בשנת {file.year ?? '2024'} המשיכה הקבוצה לצמוח. ההכנסות חצו את רף המיליארד וחצי שקל, והרווח
            התפעולי השתפר בהתאם ליעדים שהציבה ההנהלה בתחילת השנה.
          </p>
          <p className="text-[14px] leading-[1.95] text-ink-muted">
            סמנו טקסט כדי לצטט, לשתף, או לשאול את אטלס.
          </p>
        </div>
      </div>
    </div>
  )
}
