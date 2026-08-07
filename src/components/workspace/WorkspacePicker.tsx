'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Monogram } from '@/components/ds/Monogram'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { SearchIcon, PlusIcon, ChevronDownIcon, CheckIcon, TrashIcon } from '@/components/ds/icons'
import { WS_SORTS, type WsSortKey, type WorkspaceRow, type WorkspaceItemRow } from '@/lib/workspace/data'
import { presentWorkspace, deleteWorkspaceLines } from '@/lib/workspace/present'
import {
  createWorkspaceReq,
  deleteWorkspaceReq,
  fetchWorkspaceCounts,
  type WorkspaceCounts,
} from '@/lib/workspace/client'
import { ConfirmDialog } from './ConfirmDialog'

// Workspace picker (design lines 1263-1333): header + sort menu + black
// "New workspace", explainer, 44px search, 3-column grid, and the two empty
// states (searching vs genuinely empty).
//
// HEADLINE: serif, like Projects and Home. The first import of this surface
// reproduced a hardcoded sans stack the design carried at the time, and this
// lane flagged it as a founder call rather than silently "fixing" it. The
// founder answered on 2026-08-01 by rebuilding the headline in the design as
// serif — so parity and app-wide consistency now agree. Verified against the
// re-rendered design, not against bundle CSS (rules/app.md).
export function WorkspacePicker({
  rows,
  items,
  companies,
  loadError,
  nowIso,
}: {
  rows: WorkspaceRow[]
  items: WorkspaceItemRow[]
  /** itemId -> company name; the workspace's company is derived from these */
  companies: Record<string, string>
  loadError: string | null
  /** the server's clock, so hydration cannot mismatch on "2 hours ago" */
  nowIso: string
}) {
  const { dict, locale } = useI18n()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<WsSortKey>('updated')
  const [sortOpen, setSortOpen] = useState(false)
  const [createError, setCreateError] = useState<unknown>(null)
  const [creating, setCreating] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  /**
   * The delete confirmation, and what it is allowed to say.
   *
   * `counts` starts null and the dialog renders `dict.common.loading` until the
   * numbers arrive — it must not open with zeroes, because "It is empty" over a
   * workspace holding six filings is the confidently-wrong sentence this whole
   * dialog exists to prevent.
   */
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null)
  const [counts, setCounts] = useState<WorkspaceCounts | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<unknown>(null)
  /**
   * Rows deleted in this session. `rows` is a SERVER prop, so it keeps listing a
   * workspace until the route re-renders; `router.refresh()` is fired after a
   * success but it is a round trip, and a card that lingers after a confirmed
   * delete reads as a failure. This is not optimism — the delete already
   * returned — it is the local half of a fact the server has not re-sent yet.
   */
  const [deleted, setDeleted] = useState<string[]>([])

  // Rows -> display shapes here rather than on the server, because every label
  // is DERIVED and derivation needs the dictionary and locale.
  const workspaces = useMemo(() => {
    const now = new Date(nowIso)
    const byWorkspace: Record<string, WorkspaceItemRow[]> = {}
    for (const it of items) {
      if (!byWorkspace[it.workspace_id]) byWorkspace[it.workspace_id] = []
      byWorkspace[it.workspace_id].push(it)
    }
    return rows.map((r) => {
      const own = byWorkspace[r.id] ?? []
      const names = own.map((i) => companies[i.id]).filter(Boolean)
      return presentWorkspace(r, own, names, now, locale, dict)
    })
  }, [rows, items, companies, nowIso, locale, dict])

  useEffect(() => {
    if (!sortOpen) return
    const onDown = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [sortOpen])

  const query = q.trim().toLowerCase()
  const visible = useMemo(() => {
    let list = workspaces
      .filter((w) => !deleted.includes(w.id))
      .filter((w) => `${w.name} ${w.company} ${w.sub}`.toLowerCase().includes(query))
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'files') list = [...list].sort((a, b) => b.fileCount - a.fileCount)
    return list
  }, [workspaces, query, sort, deleted])

  const sortLabels: Record<WsSortKey, string> = {
    updated: dict.workspace.sortUpdated,
    name: dict.workspace.sortName,
    files: dict.workspace.sortFiles,
  }

  async function createWorkspace() {
    if (creating) return
    setCreating(true)
    // Cleared first, so a retry that succeeds does not sit under a stale
    // failure — and a retry that fails again replaces rather than accumulates.
    setCreateError(null)
    try {
      const { workspace } = await createWorkspaceReq(dict.workspace.untitled)
      router.push(`/app/workspace/${workspace.id}`)
    } catch (e) {
      // Rendered, never swallowed. A dead "New workspace" button that silently
      // does nothing is the defect this chapter's predecessor was gated on.
      setCreateError(e)
      setCreating(false)
    }
  }

  /**
   * Open the confirmation, then go and find out what it is about to destroy.
   *
   * The COUNTS ARE FETCHED, not derived from the grid. `w.fileCount` is right
   * here on screen, but it counts only the shelf — the working document and the
   * saved conversation are the two things a user would most regret losing and
   * neither is in this component's props. A dialog that listed the one number it
   * happened to have would read as a complete inventory.
   */
  function askDelete(w: { id: string; name: string }) {
    setConfirm({ id: w.id, name: w.name })
    setCounts(null)
    setDeleteError(null)
    void fetchWorkspaceCounts(w.id)
      .then((r) => {
        // Guarded: the dialog may have been cancelled and REOPENED on another
        // workspace while this was in flight, and arriving late with the first
        // one's numbers would describe the wrong room.
        setConfirm((cur) => {
          if (cur?.id === w.id) setCounts(r.counts)
          return cur
        })
      })
      .catch((e: unknown) => setDeleteError(e))
  }

  async function doDelete() {
    const target = confirm
    if (!target || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteWorkspaceReq(target.id)
      setDeleted((d) => [...d, target.id])
      setConfirm(null)
      // Resync with the server, so a second tab's view and this one agree.
      router.refresh()
    } catch (e) {
      // The dialog STAYS OPEN on failure. Closing it would leave the card in the
      // grid with no explanation, which reads as a dead button.
      setDeleteError(e)
    } finally {
      setDeleting(false)
    }
  }

  const newBtn =
    'flex items-center gap-[7px] rounded-[10px] bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper transition-opacity hover:opacity-90'

  return (
    // No DemoBanner: these workspaces are real rows belonging to the signed-in
    // account. Claiming "demo" over persisted data is untrue in the other
    // direction, and the banner's whole job is to be believed.
    <div className="flex h-full min-h-0 flex-col">
      <div className="atscroll min-h-0 flex-1 overflow-y-auto px-12 pb-[120px] pt-11">
        <div className="mx-auto w-full max-w-[960px]">
          <div className="flex items-start justify-between gap-5">
            <h1 className="font-display text-[34px] font-medium tracking-[-0.02em] text-ink">
              {dict.workspace.title}
            </h1>
            <div className="flex flex-none items-center gap-4 pt-[5px]">
              <div className="relative" ref={sortRef}>
                <button
                  type="button"
                  onClick={() => setSortOpen((o) => !o)}
                  className="flex items-center gap-[5px] text-[14px] text-ink-muted transition-colors hover:text-ink"
                >
                  {sortLabels[sort]}
                  <ChevronDownIcon
                    size={14}
                    strokeWidth={1.7}
                    className={`transition-transform duration-150 ${sortOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {sortOpen && (
                  <div className="absolute top-[calc(100%+8px)] z-20 flex min-w-[152px] flex-col rounded-[10px] border border-hairline bg-canvas p-[5px] shadow-menu ltr:right-0 rtl:left-0">
                    {(Object.keys(WS_SORTS) as WsSortKey[]).map((k) => {
                      const on = sort === k
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setSort(k)
                            setSortOpen(false)
                          }}
                          className={`flex items-center justify-between gap-3 rounded-[7px] px-2.5 py-2 text-start text-[13.5px] ${
                            on ? 'bg-subtle text-ink' : 'text-ink-muted hover:bg-subtle/60'
                          }`}
                        >
                          {sortLabels[k]}
                          {on && <CheckIcon size={14} strokeWidth={1.8} />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <button type="button" onClick={createWorkspace} className={newBtn}>
                <PlusIcon size={15} strokeWidth={1.9} />
                {dict.workspace.newWorkspace}
              </button>
            </div>
          </div>
          <p className="mb-[22px] mt-2 max-w-[620px] text-[14px] text-ink-muted">{dict.workspace.subtitle}</p>

          {/* BOTH failures render, never one instead of the other: a create
              that fails while a load has already failed would otherwise be an
              invisible dead click. Each ErrorLine owns its own block box, so
              this flex column cannot blockify the <bdi> inside it. */}
          {(loadError !== null || createError !== null) && (
            <div
              role="alert"
              className="mb-[22px] flex flex-col gap-1 rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-[13px] text-ink"
            >
              {loadError !== null && (
                <ErrorLine
                  template={dict.workspace.loadFailed}
                  error={loadError}
                  auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
                />
              )}
              {createError !== null && (
                <ErrorLine
                  template={dict.workspace.createFailed}
                  error={createError}
                  auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
                />
              )}
            </div>
          )}

          <div className="relative mb-[22px]">
            <SearchIcon
              size={17}
              strokeWidth={1.6}
              className="absolute top-1/2 -translate-y-1/2 text-ink opacity-40 ltr:left-[15px] rtl:right-[15px]"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={dict.workspace.searchPlaceholder}
              className="h-11 w-full rounded-[10px] border border-hairline bg-paper text-[14.5px] text-ink outline-none placeholder:text-ink-faint ltr:pl-[42px] ltr:pr-4 rtl:pl-4 rtl:pr-[42px]"
            />
          </div>

          {visible.length > 0 ? (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((w) => (
                // A WRAPPER, because the delete control cannot live inside the
                // card: the card is a <button>, and a button inside a button is
                // invalid HTML that browsers resolve by dropping one of them.
                // Siblings in a `relative` box keep both real controls, both
                // keyboard-reachable, with the card still filling the cell.
                <div key={w.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => router.push(`/app/workspace/${w.id}`)}
                    className="flex min-h-[152px] w-full flex-col gap-3.5 rounded-xl border border-hairline bg-paper p-[18px] text-start transition-colors hover:bg-subtle/50"
                  >
                    <div className="flex items-center justify-between">
                      <Monogram name={w.initial} size={38} fontSize={16} radius={9} />
                      <span className="font-mono-num text-[11px] text-ink-ghost" dir="ltr">
                        {w.updatedLabel}
                      </span>
                    </div>
                    {/* NOT dir="auto" on either line — 4th occurrence of the rule
                      in .claude/rules/app.md, and the first where real data made
                      it bite. `dir` resolves the WHOLE line from its FIRST
                      strong character, and presentWorkspace now feeds these real
                      Hebrew issuer names beside a Latin-or-Hebrew source count:
                      in EN a Hebrew company flipped the line to RTL and rendered
                      "4 · ןארידת sources"; in HE a Latin company flipped it to
                      LTR and rendered "Qualitau · 4 תורוקמ". <bdi> per run lets
                      each resolve on its own and the container keeps the page's
                      direction. The parent is a block div, not flex, so these
                      stay inline rather than blockifying. */}
                    <div className="flex-1">
                      <div className="mb-[3px] text-[15px] font-semibold tracking-[-0.01em] text-ink">
                        <bdi>{w.name}</bdi>
                      </div>
                      <div className="text-[12.5px] text-ink-muted">
                        <bdi>{w.company}</bdi> · <bdi>{w.sub}</bdi>
                      </div>
                    </div>
                    <div className="font-mono-num text-[11.5px] text-ink-faint">
                      <bdi dir="ltr">
                        {w.fileCount} {w.fileCount === 1 ? dict.workspace.fileOne : dict.workspace.files}
                      </bdi>
                    </div>
                  </button>
                  {/* `end-*`, not `right-*`: a logical property, so the control
                    sits in the card's trailing corner in both locales rather
                    than colliding with the Hebrew source count.
                    Hidden until hover on pointer devices — a delete button is
                    not something a grid of workspaces should wear all the time —
                    but ALWAYS shown where there is no hover, or it would be an
                    invisible tap target sitting on top of a real card. */}
                  <button
                    type="button"
                    onClick={() => askDelete(w)}
                    title={dict.workspace.deleteWorkspace}
                    aria-label={`${dict.workspace.deleteWorkspace} — ${w.name}`}
                    className="absolute bottom-3.5 end-3.5 flex h-7 w-7 items-center justify-center rounded-[7px] text-ink-ghost opacity-0 transition-opacity hover:bg-subtle hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <TrashIcon size={14} strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-5 pb-10 pt-16 text-center">
              <EmptyGlyph />
              <div className="mb-2 mt-[22px] font-sans text-[19px] font-semibold text-ink">
                {query ? dict.workspace.emptySearchHead : dict.workspace.emptyHead}
              </div>
              <p className="mb-[22px] max-w-[360px] text-[14.5px] leading-[1.5] text-ink-muted">
                {query ? dict.workspace.emptySearchBody.replace('{q}', q.trim()) : dict.workspace.emptyBody}
              </p>
              <button type="button" onClick={createWorkspace} className={newBtn}>
                <PlusIcon size={15} strokeWidth={1.9} />
                {dict.workspace.newWorkspace}
              </button>
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={dict.workspace.deleteWorkspaceTitle}
          titleValue={confirm.name}
          // Until the counts land the dialog says it is still looking, rather
          // than showing an inventory it does not have yet. Delete stays
          // clickable — the user's intent does not depend on the numbers, and a
          // disabled button on a slow request is its own kind of dead control.
          lines={counts ? deleteWorkspaceLines(counts, dict) : [dict.common.loading]}
          confirmLabel={dict.workspace.confirmDelete}
          pending={deleting}
          error={deleteError}
          onConfirm={() => void doDelete()}
          onCancel={() => {
            setConfirm(null)
            setDeleteError(null)
          }}
        />
      )}
    </div>
  )
}

// The design's empty-state mark (lines 1320-1324): two offset cards and a cursor.
function EmptyGlyph() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      className="text-ink"
      aria-hidden
    >
      <rect x="8" y="10" width="22" height="16" rx="3.5" />
      <rect x="17" y="18" width="22" height="16" rx="3.5" fill="var(--main-bg,#FFFFFF)" />
      <path d="M25.5 26.5l1.6 13 2.7-3.6 2.5 4.7 2.1-1.1-2.5-4.7 4.4-.2z" fill="var(--main-bg,#FFFFFF)" />
    </svg>
  )
}
