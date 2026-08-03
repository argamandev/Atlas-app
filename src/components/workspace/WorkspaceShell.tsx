'use client'

import { useCallback, useRef, useState } from 'react'
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
import { patchItemReq } from '@/lib/workspace/client'
import { WorkspaceSourcePicker } from './WorkspaceSourcePicker'
import { ErrorLine } from '@/components/projects/ErrorLine'

// The populated control layout (design lines 1433-2084): a floating workspace
// panel beside a floating main card with a tab bar. Special tabs __doc / __legal
// / __chat sit alongside file tabs, exactly as the design's tab model does.

const DOC_TAB = '__doc'
const LEGAL_TAB = '__legal'
const CHAT_TAB = '__chat'

export function WorkspaceShell({
  workspace,
  attachedSourceIds,
}: {
  workspace: Workspace
  /** corpus ids already on the shelf, so the picker offers no duplicate Add */
  attachedSourceIds: string[]
}) {
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
  const [openTabs, setOpenTabs] = useState<string[]>(
    openFromLastTime.length > 0 ? openFromLastTime : [workspace.files[0]?.id ?? DOC_TAB]
  )
  const [activeTab, setActiveTab] = useState<string>(openFromLastTime[0] ?? workspace.files[0]?.id ?? DOC_TAB)
  const [split, setSplit] = useState(false)
  const [multi, setMulti] = useState<string[]>([])
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(workspace.name)

  const [legalStage, setLegalStage] = useState<LegalStage>('idle')
  const [legalStep, setLegalStep] = useState(0)
  const [legalAreas, setLegalAreas] = useState<string[]>([])

  const [layoutError, setLayoutError] = useState<unknown>(null)
  const [addOpen, setAddOpen] = useState(false)

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
      persistOpen(id, true)
    },
    [persistOpen]
  )

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
      {layoutError !== null && (
        <div
          role="alert"
          className="mx-3 mt-3 rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-[13px] text-ink"
        >
          <ErrorLine
            template={dict.workspace.layoutFailed}
            error={layoutError}
            auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
          />
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
                            const v = e.currentTarget.value.trim()
                            if (v) setName(v)
                            setRenaming(false)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') setRenaming(false)
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
                    onClick={() => openTab(CHAT_TAB)}
                    className="flex w-full items-center gap-2.5 rounded-[11px] bg-ink px-3 py-[11px] text-start text-paper"
                  >
                    <SparkleIcon size={21} className="flex-none" />
                    <span className="flex-1 text-[13px] font-semibold">
                      {dict.workspace.newWorkspaceChat}
                    </span>
                    <PlusIcon size={14} strokeWidth={2} className="flex-none opacity-50" />
                  </button>

                  {/* The shelf had no add affordance before migration 016,
                      because nothing could be added. */}
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="mt-2 flex w-full items-center gap-2.5 rounded-[11px] border border-hairline px-3 py-[10px] text-start text-ink transition-colors hover:bg-subtle"
                  >
                    <PlusIcon size={15} strokeWidth={1.9} className="flex-none opacity-60" />
                    <span className="flex-1 text-[13px] font-medium">{dict.workspace.addSources}</span>
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
                        <bdi>{docTitle(workspace)}</bdi>
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
          onToggleSplit={() => setSplit((s) => !s)}
          onToggleMulti={(id) => setMulti((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))}
          renderSpecial={(id) =>
            id === DOC_TAB ? (
              <WorkingDocument workspaceId={workspace.id} title={docTitle(workspace)} />
            ) : id === LEGAL_TAB ? (
              <LegalAgentChat areas={legalAreas} />
            ) : null
          }
          specialLabel={(id) =>
            id === DOC_TAB
              ? docTitle(workspace)
              : id === LEGAL_TAB
                ? dict.workspace.legalReviewTab
                : dict.workspace.workspaceChat
          }
        />
      </div>

      {addOpen && (
        <div
          className="absolute inset-0 z-30 flex items-start justify-center bg-ink/20 p-8"
          role="dialog"
          aria-modal="true"
          aria-label={dict.workspace.addSources}
          onMouseDown={(e) => {
            // Backdrop only — a mousedown that started inside the panel must not
            // close it when the pointer is released over the backdrop.
            if (e.target === e.currentTarget) setAddOpen(false)
          }}
        >
          <div className="flex max-h-full w-full max-w-[560px] flex-col gap-3 overflow-hidden rounded-win border border-float-line bg-canvas p-5 shadow-pane">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[15px] font-semibold text-ink">{dict.workspace.addSources}</div>
                <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-muted">
                  {dict.workspace.addSourcesHint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="flex-none rounded-[7px] bg-ink px-3 py-1.5 text-[12.5px] text-paper"
              >
                {dict.workspace.doneAdding}
              </button>
            </div>
            <WorkspaceSourcePicker workspaceId={workspace.id} attachedSourceIds={attachedSourceIds} />
          </div>
        </div>
      )}
    </div>
  )
}

function docTitle(w: Workspace) {
  return w.docTitle
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
