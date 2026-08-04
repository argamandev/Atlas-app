'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { DemoBanner } from '@/components/ds/DemoBanner'
import {
  ChevronLeftIcon,
  PencilIcon,
  PlusIcon,
  CloseIcon,
  SparkleIcon,
  CollapseIcon,
  ChevronRightIcon,
} from '@/components/ds/icons'
import { WorkspaceDetailColumn, type DetailKey } from './WorkspaceDetailColumn'
import { WorkingDocument } from './WorkingDocument'
import { LegalPanelRow, LegalAgentChat, type LegalStage } from './LegalDueDiligence'
import { WorkspaceDocs } from './WorkspaceDocs'
import { LEGAL_STEPS, WS_THREADS, workspaceSessions, type Workspace } from '@/lib/workspace/data'
import { documentTitle } from '@/lib/workspace/present'
import { patchItemReq, patchWorkspaceReq } from '@/lib/workspace/client'
import { WorkspaceIntake } from './WorkspaceIntake'
import { WorkspaceChat, type AskContext } from './WorkspaceChat'
import { ErrorLine } from '@/components/projects/ErrorLine'

// The populated control layout (design lines 1433-2084): a floating workspace
// panel beside a floating main card with a tab bar. Special tabs __doc / __legal
// / __chat sit alongside file tabs, exactly as the design's tab model does.

const DOC_TAB = '__doc'
const LEGAL_TAB = '__legal'
// The chat is a SIDE PANEL as of 2026-08-04, so nothing opens this tab any more.
// The id survives only so `persistOpen` still refuses to PATCH it if an older
// session's layout ever hands one back — it is not a row and has nothing to save.
const CHAT_TAB = '__chat'

export function WorkspaceShell({ workspace }: { workspace: Workspace }) {
  const { dict } = useI18n()
  const router = useRouter()

  const [panelOpen, setPanelOpen] = useState(true)
  const [detail, setDetail] = useState<DetailKey | null>(null)
  // THE WORKSPACE REOPENS WARM. `live` is workspace_items.is_open, persisted —
  // founder, 2026-08-03: "the workspace should remember how i left it. it must
  // not open cold every time." This used to be `[files[0].id]`, i.e. it threw
  // away what the user had open and reopened the first source, every time.
  // The rows arrive already ordered by `position`, so the tab order is the
  // order they were left in rather than the order they were attached.
  const openFromLastTime = workspace.files.filter((f) => f.live).map((f) => f.id)
  // NOTHING RECORDED AS OPEN MEANS THE ROOM WAS NEVER ARRANGED, so show the
  // whole shelf rather than picking one file out of it. This used to open
  // `files[0]` — an invented choice either way, and the wrong one: it is what
  // made a workspace holding three agreed sources present exactly one of them
  // (founder, 2026-08-04), and what would leave every workspace built before
  // `is_open` was set on attach still opening with a single tab.
  const allFiles = workspace.files.map((f) => f.id)
  const [openTabs, setOpenTabs] = useState<string[]>(
    openFromLastTime.length > 0 ? openFromLastTime : allFiles.length > 0 ? allFiles : [DOC_TAB]
  )
  const [activeTab, setActiveTab] = useState<string>(openFromLastTime[0] ?? workspace.files[0]?.id ?? DOC_TAB)
  const [split, setSplit] = useState(false)
  const [multi, setMulti] = useState<string[]>([])
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(workspace.name)
  // THE DOCUMENT'S TITLE LIVES HERE, not inside WorkingDocument, because three
  // places show it: the document's own header, its tab chip, and the panel row.
  // Held raw ('' is a real value) and given a display name only at each of those.
  const [docTitleRaw, setDocTitleRaw] = useState(workspace.docTitle)
  const [docTitleError, setDocTitleError] = useState<unknown>(null)
  const docTitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [legalStage, setLegalStage] = useState<LegalStage>('idle')
  const [legalStep, setLegalStep] = useState(0)
  const [legalAreas, setLegalAreas] = useState<string[]>([])

  // ASK ATLAS. A passage marked in any source pane opens the chat carrying it.
  // The chat is a TAB, not a separate surface, so it can also sit beside the
  // document it is about in multi-view — which is the point of asking about a
  // passage rather than about a workspace.
  //
  // A SIDE PANEL, not a tab. Founder, 2026-08-04: *"when we mark text we need to
  // be able to ask atlas about it and let it open from the side pannel and be
  // able to communicate with us."* As a tab it REPLACED the document — you asked
  // about a paragraph and the paragraph disappeared, which defeats the point of
  // asking about it. The design already anticipated this: the tab bar's height
  // is fixed so its seam lines up with a side-chat header.
  const [chatOpen, setChatOpen] = useState(false)
  const [askSeed, setAskSeed] = useState<AskContext | null>(null)
  /** a request the chat could not act on itself — handed to the intake flow */
  const [addRequest, setAddRequest] = useState<string | null>(null)

  const [layoutError, setLayoutError] = useState<unknown>(null)
  const [renameError, setRenameError] = useState<unknown>(null)
  const [addOpen, setAddOpen] = useState(false)

  // Escape must DISCARD, and the only reliable way to leave the field is to
  // blur it — so the cancel intent has to survive the trip to onBlur. A ref, not
  // state: setting state here would re-render before the blur handler reads it.
  const renameCancelled = useRef(false)

  /**
   * Rename, PERSISTED. Until 2026-08-04 this set local state and nothing else:
   * the header showed the new name, no error appeared, and the old name came
   * back on the next load. Nothing on screen was false in the moment, which is
   * what made it the bad kind of bug — the lie only arrived later, at reload.
   *
   * Optimistic, then REVERTED if the server refuses, because a name left on
   * screen after a rejected write is the same lie one step further along.
   */
  const commitRename = useCallback(
    async (raw: string) => {
      const next = raw.trim()
      setRenaming(false)
      // An empty name is not a rename, it is a mistake — `parseName` rejects it
      // server-side too, so sending it would only produce a needless error.
      if (!next || next === name) return

      const previous = name
      setName(next)
      setRenameError(null)
      try {
        await patchWorkspaceReq(workspace.id, { name: next })
        // The picker is a Server Component; without this, going back can render
        // the router cache's copy and show the OLD name after a real rename.
        router.refresh()
      } catch (e: unknown) {
        setName(previous)
        setRenameError(e)
      }
    },
    [name, workspace.id, router]
  )

  /**
   * Rename the working document, debounced.
   *
   * DEBOUNCED-AND-KEPT rather than optimistic-and-reverted, which is the
   * opposite of `commitRename` above and deliberately so. That one is a discrete
   * act the user has finished, so putting the old name back on refusal is
   * honest. This one fires while they are still typing, and yanking a title out
   * from under a caret mid-word would destroy work to report a failure. So the
   * text stays and the BANNER carries the bad news — which keeps the rule the
   * rename comment states (nothing on screen may quietly become untrue) without
   * paying for it in the user's own characters.
   */
  const renameDocument = useCallback(
    (next: string) => {
      setDocTitleRaw(next)
      setDocTitleError(null)
      if (docTitleTimer.current) clearTimeout(docTitleTimer.current)
      docTitleTimer.current = setTimeout(() => {
        patchWorkspaceReq(workspace.id, { doc_title: next }).catch((e: unknown) => {
          setDocTitleError(e)
        })
      }, 600)
    },
    [workspace.id]
  )

  // A title typed and then navigated away from within the debounce window would
  // otherwise never be sent at all.
  useEffect(() => {
    const timer = docTitleTimer
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  /**
   * Persist one tab's open/closed state — the write half of "remember how I
   * left it". ONE row, not the whole workspace, and it deliberately does not
   * move `workspaces.updated_at`: opening a pane is not an edit.
   *
   * The synthetic tabs (__doc, __legal, __chat) are not shelf items and have no
   * row to patch, so they are skipped rather than sent and 404'd.
   */
  const persistOpen = useCallback(
    (id: string, isOpen: boolean) => {
      if (id === DOC_TAB || id === LEGAL_TAB || id === CHAT_TAB) return
      patchItemReq(workspace.id, id, { is_open: isOpen }).catch((e: unknown) => {
        // Surfaced, not swallowed. If this fails the pane still moved on screen
        // but WILL NOT survive a reload, and the user has to be told — a layout
        // that silently forgets is precisely what this chapter set out to fix.
        setLayoutError(e)
      })
    },
    [workspace.id]
  )

  const openTab = useCallback(
    (id: string) => {
      setOpenTabs((t) => (t.includes(id) ? t : [...t, id]))
      setActiveTab(id)
      // In multi-view a newly opened file must APPEAR. Without this it lands as
      // a tab whose pane is not shown, so clicking a file in the panel would
      // look like it did nothing.
      if (split) setMulti((m) => (m.includes(id) ? m : [...m, id]))
      persistOpen(id, true)
    },
    [persistOpen, split]
  )

  /**
   * Multi-view, ON: every open tab becomes a pane.
   *
   * THE BUG THIS FIXES, in the founder's words (2026-08-04): *"there isn't any
   * multi view function at the pulled files and on the top right there is a
   * screen icon — what does he represent?"* The control was the split toggle,
   * and clicking it set `split` while `multi` was still empty — so the pane list
   * resolved to nothing, the file being read disappeared, and the workspace
   * showed "Nothing open". Multi-view was not missing; it was unreachable,
   * because the only way in was a per-tab `+` that appears ONLY after the toggle
   * has already blanked the screen.
   *
   * Founder decision, asked directly the same day: one click shows ALL open
   * files side by side, and you close what you do not want.
   */
  const toggleSplit = useCallback(() => {
    const next = !split
    if (next) setMulti(openTabs)
    setSplit(next)
  }, [split, openTabs])

  const closeTab = useCallback(
    (id: string) => {
      setOpenTabs((t) => {
        const next = t.filter((x) => x !== id)
        setActiveTab((a) => (a === id ? (next[next.length - 1] ?? '') : a))
        return next
      })
      setMulti((m) => m.filter((x) => x !== id))
      persistOpen(id, false)
    },
    [persistOpen]
  )

  // '' is a real stored title — a document nobody has named yet — so the label
  // is derived at every display site rather than substituted into the fact.
  const shownDocTitle = documentTitle(docTitleRaw, dict)

  const sections: { key: DetailKey; label: string; count: number }[] = [
    { key: 'files', label: dict.workspace.sectionFiles, count: workspace.files.length },
    { key: 'agents', label: dict.workspace.sectionAgents, count: workspace.agents.length },
    {
      key: 'actions',
      label: dict.workspace.sectionActions,
      count: workspaceSessions(workspace).reduce((n, s) => n + s.items.length, 0),
    },
    { key: 'chats', label: dict.workspace.sectionChats, count: WS_THREADS.length },
  ]

  const iconBtn =
    'flex h-6 w-6 flex-none items-center justify-center rounded-md text-ink-ghost transition-colors hover:bg-subtle hover:text-ink'

  return (
    // `relative` so the add-sources overlay's `absolute inset-0` is bounded by
    // the workspace surface rather than escaping to the viewport.
    <div className="relative flex h-full min-h-0 flex-col">
      {/* The workspace and its shelf are real rows now; the AGENT and legal
          surfaces inside this shell are still demo, which is what the banner
          still speaks for. */}
      <DemoBanner />
      {/* A layout change that failed to persist still moved on screen, so
          without this the workspace would silently forget on the next reload —
          the very thing this chapter set out to fix. */}
      {(layoutError !== null || renameError !== null || docTitleError !== null) && (
        <div
          role="alert"
          className="mx-3 mt-3 flex flex-col gap-1 rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-[13px] text-ink"
        >
          {layoutError !== null && (
            <ErrorLine
              template={dict.workspace.layoutFailed}
              error={layoutError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          )}
          {/* BOTH render, never one instead of the other — same reasoning as the
              picker's banner. A rename that failed while a pane also failed to
              persist would otherwise be invisible. */}
          {renameError !== null && (
            <ErrorLine
              template={dict.workspace.renameFailed}
              error={renameError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          )}
          {/* The typed title is deliberately LEFT on screen when this fires, so
              this line is the only thing standing between the user and a title
              they believe is saved. It renders alongside the others, never
              instead of one. */}
          {docTitleError !== null && (
            <ErrorLine
              template={dict.workspace.docTitleFailed}
              error={docTitleError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {panelOpen ? (
          <div className="flex w-[290px] flex-none flex-col overflow-hidden rounded-win border border-float-line bg-canvas shadow-pane">
            {detail ? (
              <WorkspaceDetailColumn
                workspace={workspace}
                which={detail}
                openTabs={openTabs}
                onBack={() => setDetail(null)}
                onOpenFile={openTab}
                onCloseFile={closeTab}
              />
            ) : (
              <>
                <div className="flex-none px-4 pb-[15px] pt-3.5">
                  <div className="mb-[15px] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => router.push('/app/workspace')}
                      className="flex items-center gap-1.5 text-[11.5px] text-ink-ghost hover:text-ink"
                    >
                      <ChevronLeftIcon size={13} strokeWidth={1.8} className="rtl:rotate-180" />
                      {dict.workspace.allWorkspaces}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanelOpen(false)}
                      title={dict.workspace.collapsePanel}
                      className={iconBtn}
                    >
                      <CollapseIcon size={16} strokeWidth={1.6} />
                    </button>
                  </div>
                  <div className="flex items-center gap-[11px]">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-panel text-[16px] text-ink">
                      {workspace.initial}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {renaming ? (
                        <input
                          autoFocus
                          defaultValue={name}
                          onBlur={(e) => {
                            if (renameCancelled.current) {
                              renameCancelled.current = false
                              setRenaming(false)
                              return
                            }
                            void commitRename(e.currentTarget.value)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            // Blur rather than unmount, so ONE path commits or
                            // discards. Unmounting straight from here raced the
                            // blur handler and could save what Escape refused.
                            if (e.key === 'Escape') {
                              renameCancelled.current = true
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-full rounded-[7px] border border-hairline bg-canvas px-2 py-1 text-[14px] font-semibold text-ink outline-none"
                        />
                      ) : (
                        <div className="flex min-w-0 items-center gap-1.5">
                          {/* A workspace name is USER INPUT and can itself mix
                              scripts ("Tigbur — הפרטה"). <bdi> rather than
                              dir="auto" so the flip point is the run, not the
                              line — and so this cannot become the 5th occurrence
                              when someone puts a ticker in a Hebrew name. */}
                          <span className="min-w-0 flex-1 truncate font-display text-[16.5px] font-medium leading-[1.2] tracking-[-0.01em] text-ink">
                            <bdi>{name}</bdi>
                          </span>
                          <button
                            type="button"
                            onClick={() => setRenaming(true)}
                            title={dict.workspace.renameWorkspace}
                            className="flex flex-none text-ink-ghost hover:text-ink"
                          >
                            <PencilIcon size={13} strokeWidth={1.7} />
                          </button>
                        </div>
                      )}
                      {/* Same defect as WorkspacePicker's card line, same fix.
                          The review flagged the picker; this copy in the panel
                          header was missed, which is the lesson app.md already
                          files — one flagged occurrence is not the whole set,
                          so this was found by grepping the SHAPE ("} · {"). */}
                      <span className="truncate text-[11.5px] text-ink-ghost">
                        <bdi>{workspace.company}</bdi> · <bdi>{workspace.sub}</bdi>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="atscroll min-h-0 flex-1 overflow-auto px-3.5 pb-4">
                  <button
                    type="button"
                    onClick={() => setChatOpen(true)}
                    className="flex w-full items-center gap-2.5 rounded-[11px] bg-ink px-3 py-[11px] text-start text-paper"
                  >
                    <SparkleIcon size={21} className="flex-none" />
                    {/* "Workspace chat", not "New workspace chat" — founder,
                        2026-08-04. There is one conversation about this
                        workspace, so a "+" promising a fresh one was offering
                        something that does not exist. */}
                    <span className="flex-1 text-[13px] font-semibold">{dict.workspace.workspaceChat}</span>
                  </button>

                  {/* The shelf had no add affordance before migration 016,
                      because nothing could be added. */}
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="mt-2 flex w-full items-center gap-2.5 rounded-[11px] border border-hairline px-3 py-[10px] text-start text-ink transition-colors hover:bg-subtle"
                  >
                    <PlusIcon size={15} strokeWidth={1.9} className="flex-none opacity-60" />
                    <span className="flex-1 text-[13px] font-medium">{dict.workspace.addDocument}</span>
                  </button>

                  <div className="mb-2 ms-0.5 mt-5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-ghost">
                    {dict.workspace.yourWork}
                  </div>

                  <button
                    type="button"
                    onClick={() => openTab(DOC_TAB)}
                    className={`flex w-full items-center gap-[11px] rounded-xl border px-3 py-[11px] text-start transition-colors ${
                      activeTab === DOC_TAB
                        ? 'border-hairline bg-subtle'
                        : 'border-hairline bg-paper hover:bg-subtle/60'
                    }`}
                  >
                    <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border border-hairline bg-canvas text-ink-muted">
                      <DocGlyph />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {/* Also user input — same reasoning as the workspace name. */}
                      <span className="truncate text-[13px] font-semibold text-ink">
                        <bdi>{shownDocTitle}</bdi>
                      </span>
                      {/* "Draft", not "saved just now" — nothing saves, and the
                          timestamp was static anyway. */}
                      <span className="text-[11px] text-ink-ghost">{dict.workspace.docDraftMeta}</span>
                    </span>
                  </button>

                  <LegalPanelRow
                    stage={legalStage}
                    step={legalStep}
                    areas={legalAreas}
                    onToggleArea={(a) =>
                      setLegalAreas((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]))
                    }
                    onOpenScoping={() => setLegalStage('scoping')}
                    onCancel={() => setLegalStage('idle')}
                    onRun={() => {
                      setLegalStage('running')
                      setLegalStep(0)
                    }}
                    onAdvance={() => {
                      if (legalStep < LEGAL_STEPS.length - 1) setLegalStep((s) => s + 1)
                      else {
                        setLegalStage('done')
                        openTab(LEGAL_TAB)
                      }
                    }}
                    onOpenFindings={() => openTab(LEGAL_TAB)}
                  />

                  <div className="mb-2 ms-0.5 mt-[22px] text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-ghost">
                    {dict.workspace.workspaceSection}
                  </div>
                  <div className="flex flex-col gap-[3px]">
                    {sections.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setDetail(s.key)}
                        className="flex w-full items-center gap-[11px] rounded-[10px] px-2.5 py-2 text-start hover:bg-subtle/60"
                      >
                        <span className="flex-1 text-[13px] font-medium text-ink">{s.label}</span>
                        <span dir="ltr" className="flex-none font-mono-num text-[11px] text-ink-ghost">
                          {s.count}
                        </span>
                        <ChevronRightIcon
                          size={13}
                          strokeWidth={1.8}
                          className="flex-none text-ink-ghost rtl:rotate-180"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            title={dict.workspace.expandPanel}
            className="flex w-9 flex-none items-center justify-center rounded-win border border-float-line bg-canvas text-ink-ghost shadow-pane hover:text-ink"
          >
            <ChevronRightIcon size={16} strokeWidth={1.8} className="rtl:rotate-180" />
          </button>
        )}

        <WorkspaceDocs
          workspace={workspace}
          openTabs={openTabs}
          activeTab={activeTab}
          split={split}
          multi={multi}
          onSelect={setActiveTab}
          onClose={closeTab}
          onToggleSplit={toggleSplit}
          onToggleMulti={(id) => setMulti((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))}
          renderSpecial={(id) =>
            id === DOC_TAB ? (
              <WorkingDocument
                workspaceId={workspace.id}
                title={docTitleRaw}
                onRenameDocument={renameDocument}
              />
            ) : id === LEGAL_TAB ? (
              <LegalAgentChat areas={legalAreas} />
            ) : null
          }
          specialLabel={(id) =>
            id === DOC_TAB
              ? shownDocTitle
              : id === LEGAL_TAB
                ? dict.workspace.legalReviewTab
                : dict.workspace.workspaceChat
          }
          onAskAtlas={(passage) => {
            setAskSeed(passage)
            setChatOpen(true)
          }}
        />

        {chatOpen && (
          <div className="flex w-[340px] flex-none flex-col overflow-hidden rounded-win border border-float-line bg-canvas shadow-pane">
            <div className="flex h-[46px] flex-none items-center justify-between gap-2 border-b border-hairline px-3.5">
              <span className="truncate text-[13px] font-semibold text-ink">
                {dict.workspace.workspaceChat}
              </span>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label={dict.common.close}
                className={iconBtn}
              >
                <CloseIcon size={14} strokeWidth={2} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <WorkspaceChat
                workspaceId={workspace.id}
                seed={askSeed}
                onClearSeed={() => setAskSeed(null)}
                // The chat never attaches a file. It hands the request to the
                // add-a-document conversation — the one path that names files
                // and waits for a yes — with the request already typed in.
                onRequestDocuments={(request) => {
                  setAddRequest(request)
                  setAddOpen(true)
                }}
              />
            </div>
          </div>
        )}
      </div>

      {addOpen && (
        <div
          className="absolute inset-0 z-30 flex items-start justify-center bg-ink/20 p-8"
          role="dialog"
          aria-modal="true"
          aria-label={dict.workspace.addDocument}
          onMouseDown={(e) => {
            // Backdrop only — a mousedown that started inside the panel must not
            // close it when the pointer is released over the backdrop.
            if (e.target === e.currentTarget) setAddOpen(false)
          }}
        >
          <div className="flex h-[520px] max-h-full w-full max-w-[560px] flex-col gap-2 overflow-hidden rounded-win border border-float-line bg-canvas p-5 shadow-pane">
            <div className="flex flex-none items-start justify-between gap-4">
              <div className="text-[15px] font-semibold text-ink">{dict.workspace.addDocument}</div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label={dict.common.close}
                className="flex-none rounded-[7px] px-2 py-1 text-ink-ghost hover:bg-subtle hover:text-ink"
              >
                <CloseIcon size={14} strokeWidth={2} />
              </button>
            </div>
            {/* THE SAME CONVERSATION THAT FILLED THE WORKSPACE, not a grid of
                checkboxes. WorkspaceSourcePicker used to live here and is gone
                — see WorkspaceRoute for why it was deleted rather than kept
                around unreachable. */}
            <div className="min-h-0 flex-1">
              <WorkspaceIntake
                workspaceId={workspace.id}
                workspaceName={name}
                variant="panel"
                initialRequest={addRequest}
                onDone={() => {
                  setAddOpen(false)
                  setAddRequest(null)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DocGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden
    >
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}
