'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { useViewingCalls } from '@/lib/player/PlayerProvider'
import { CloseIcon, ColumnsIcon, SinglePaneIcon, SparkleIcon } from '@/components/ds/icons'
import { SourceDocument } from './SourceDocument'
import { tabLabel } from '@/lib/workspace/tabLabel'
import { shownPanes } from '@/lib/workspace/panes'
import type { ChatSnip } from '@/lib/chat/grounding'
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
  onAskAtlas,
  onConnect,
  onStar,
  snipArm,
  onSnip,
  onSnipEnd,
  onSnippable,
  maxPanes,
  askOpen = false,
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
  /** `paneCtl.onHidePane` is present only while several panes are on screen */
  renderSpecial: (id: string, paneCtl: { onHidePane?: () => void }) => ReactNode
  specialLabel: (id: string) => string
  onAskAtlas: (passage: { itemId: string; title: string; text: string }) => void
  onConnect: (passage: { itemId: string; title: string; text: string }) => void
  /** the star at the tab bar's right edge — opens Ask Atlas with nothing marked */
  onStar: () => void
  snipArm: number
  onSnip: (snip: ChatSnip, source: { itemId: string; title: string }) => void
  onSnipEnd: () => void
  onSnippable: (itemId: string, can: boolean) => void
  /** how many panes fit at once — lib/workspace/panes.MAX_PANES */
  maxPanes: number
  /** the Ask Atlas side panel is open, so a marked passage goes straight to it */
  askOpen?: boolean
}) {
  const { dict } = useI18n()
  const [flex, setFlex] = useState<Record<string, number>>({})
  const [hoverGutter, setHoverGutter] = useState<string | null>(null)
  const dragging = useRef<{ id: string; nextId: string; startX: number; a: number; b: number } | null>(null)

  const fileById = (id: string) => workspace.files.find((f) => f.id === id)

  // THE CALLS THIS WORKSPACE ALREADY HOLDS.
  //
  // Founder, 2026-08-05: *"if we hear a transcript in sync in a workspace, we
  // don't need to have a return to transcript button."* The shell's floating
  // "Return to transcript" chip exists for someone who wandered away from a call
  // — but here the call is a labelled tab at the top of the screen, so the chip
  // is not a shortcut back, it is a door OUT of the workspace, and it takes the
  // arranged panes with it. Declaring the tabs suppresses it for exactly the
  // calls that are reachable here, and leaves it working for every other call.
  const openTranscriptIds = useMemo(
    () =>
      openTabs
        .map((id) => fileById(id)?.transcriptId)
        .filter((t): t is string => typeof t === 'string' && t.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openTabs, workspace.files]
  )
  useViewingCalls(openTranscriptIds)

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
  // lib/workspace/panes — the shell asks the SAME function whether the working
  // document is on screen, because it now composes into it either way and has to
  // know whether there is a live DOM to splice into.
  const docsShown = shownPanes({ split, openTabs, multi, activeTab })

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
    // NEGATED, because the pane row is RTL: pane `d.id` sits to the RIGHT of the
    // gutter and `d.nextId` to its left, so dragging right must SHRINK the first
    // one. Without the sign flip the divider ran away from the cursor.
    const delta = -(e.clientX - d.startX) / 400
    const a = Math.max(0.25, d.a + delta)
    const b = Math.max(0.25, d.b - delta)
    setFlex((f) => ({ ...f, [d.id]: a, [d.nextId]: b }))
  }

  function endDrag() {
    dragging.current = null
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-win border border-float-line bg-canvas shadow-pane">
      {/* tab bar — fixed height so the seam aligns with the side-chat header.
          RTL, per the founder 2026-08-04: tabs start at the right edge and head
          left, which is also what moves the view toggle to the top LEFT. The
          workspace holds Hebrew filings and calls, so this is the direction the
          shelf reads in even when the interface language is English. */}
      <div dir="rtl" className="flex h-[46px] flex-none items-center gap-1 border-b border-hairline px-2">
        {/* THE STAR, at the physical top RIGHT — founder, 2026-08-05: *"we need
            to open a star icon on the top right … when we press on it, it opens
            Ask Atlas."* It is the first child of an RTL row, which is the right
            edge, and it is deliberately the same SparkleIcon the panel button
            and the side-chat header carry: one feature, one mark. Ask Atlas was
            reachable only by marking text or crossing to the panel, so with the
            panel collapsed there was no way in at all. */}
        <button
          type="button"
          onClick={onStar}
          title={dict.live.askAtlas}
          aria-label={dict.live.askAtlas}
          className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
        >
          <SparkleIcon size={17} />
        </button>
        <span className="h-4 w-px flex-none bg-hairline" aria-hidden />
        <div className="atscroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {openTabs.map((id) => {
            const f = fileById(id)
            // WHAT DISTINGUISHES THE FILE, not what it is filed under. See
            // lib/workspace/tabLabel.ts: three calls from one company share a
            // forty-character prefix and differ only at the end, which is the
            // part a tab chip truncates away. The stored name stays whole in the
            // tooltip, the pane header and the file list.
            const label = f ? tabLabel(f.name, f.kind, dict.workspace.tabKinds) : specialLabel(id)
            const full = f ? f.name : specialLabel(id)
            const on = activeTab === id
            const inSplit = multi.includes(id)
            return (
              <div
                key={id}
                title={full}
                className={`group flex h-[34px] flex-none items-center gap-1 rounded-lg border ps-2.5 pe-1.5 text-[12.5px] ${
                  on
                    ? 'border-float-line bg-canvas font-medium text-ink'
                    : 'border-transparent text-ink-faint hover:bg-subtle/60'
                }`}
              >
                <button type="button" onClick={() => onSelect(id)} className="max-w-[190px] truncate">
                  {/* <bdi>, not dir="ltr". A file name is user-visible content
                      that can be Hebrew, Latin, or both ("תיגבור Q1 2026"), and
                      forcing LTR put the truncation ellipsis on the wrong end of
                      every Hebrew title — the name was clipped at its BEGINNING,
                      which is why the tabs read as gibberish. <bdi> resolves each
                      name on its own without leaking direction into the bar. */}
                  <bdi>{label}</bdi>
                </button>

                {/* ── TWO REMOVALS THAT ARE NOT THE SAME REMOVAL ──────────────
                    Founder, 2026-08-05: *"I've got two x's one by one … one x is
                    pulling it off the tab, second x is pulling it off the multi
                    view. It's too confusing right now."*

                    He is describing two identical ✕ glyphs sitting side by side
                    doing different things, which is unreadable however you label
                    the tooltips. So only ONE of them stays a ✕ — the one that
                    means "gone from here". The other stops being a removal
                    control at all and becomes a STATE you can see without
                    clicking: a pane glyph that is filled when this file has a
                    pane and hollow when it does not. Same click, same effect,
                    but now the tab tells you which files are on screen.

                    Filled/hollow rather than present/absent because a control
                    that disappears when it is off cannot be turned back on from
                    the same place — which is how the split toggle became
                    unreachable in the first place (see toggleSplit). */}
                {split && (
                  <button
                    type="button"
                    onClick={() => onToggleMulti(id)}
                    // AT THE CAP THE TOOLTIP SAYS WHAT THE CLICK WILL COST.
                    // The button stays live — panes.addPane evicts the oldest
                    // rather than refusing, so this never becomes a control
                    // that does nothing — but "show it" is only half the truth
                    // once something has to leave to make room for it.
                    title={
                      inSplit
                        ? dict.workspace.removeFromSplit
                        : multi.length >= maxPanes
                          ? dict.workspace.addToSplitFull.replace('{n}', String(maxPanes))
                          : dict.workspace.addToSplit
                    }
                    aria-pressed={inSplit}
                    className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md transition-colors ${
                      inSplit ? 'bg-ink text-paper' : 'text-ink-ghost hover:bg-subtle hover:text-ink'
                    }`}
                  >
                    <ColumnsIcon size={12} strokeWidth={1.9} />
                  </button>
                )}
                {/* The ✕ keeps ONE meaning — off the tab bar. The file stays on
                    the shelf and reopens from Workspace files, which is what
                    makes this safe to do on a single click. Always visible while
                    the split toggle is beside it: a control that only appears on
                    hover, next to one that is always there, reads as a glitch. */}
                <button
                  type="button"
                  onClick={() => onClose(id)}
                  aria-label={dict.common.close}
                  title={dict.workspace.closeTab}
                  className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md text-ink-ghost transition-all hover:bg-subtle hover:text-ink ${
                    split || on ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <CloseIcon size={12} strokeWidth={2.2} />
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

      {/* THE PANES RUN THE SAME WAY THE TABS DO.
          Founder, 2026-08-05: *"on the top right, if we have the Q1 2026 report,
          then under it we're gonna see that same report in Multiview. Currently
          it is on the opposite side."* Exactly so: the tab bar was made RTL
          yesterday (tab 1 at the right edge) while this row stayed LTR (pane 1
          at the left edge), so the two lists ran in OPPOSITE directions and the
          first tab sat above the LAST pane. Two panes hid it — you had to open
          three before the mismatch was visible. Both rows are RTL now, so tab N
          is always above pane N. */}
      <div dir="rtl" className="flex min-h-0 flex-1" onPointerMove={onGutterMove} onPointerUp={endDrag}>
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
            // THE PANE'S OWN ✕ — founder, 2026-08-05: *"we can add an x button on
            // the top left of each header of a document that is open in Multiview
            // … it will make that specific document not shown in the multiview,
            // but it will still be in the tab section."*
            //
            // Offered only while there is more than one pane, and only in
            // multi-view. Removing the LAST pane cannot take the screen down to
            // nothing — `docsShown` falls back to the active tab, so the ✕ would
            // have looked broken rather than dangerous, which is worse: a control
            // that appears to do nothing teaches you to distrust the ones that
            // work. With one pane there is no multi-view to remove it from.
            const onHidePane = split && docsShown.length > 1 ? () => onToggleMulti(id) : undefined
            const body = isSpecial(id) ? (
              renderSpecial(id, { onHidePane })
            ) : f ? (
              <SourceDocument
                workspaceId={workspace.id}
                file={f}
                onAskAtlas={onAskAtlas}
                askOpen={askOpen}
                onConnect={onConnect}
                snipArm={snipArm}
                onSnip={onSnip}
                onSnipEnd={onSnipEnd}
                onSnippable={onSnippable}
                onHidePane={onHidePane}
              />
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
