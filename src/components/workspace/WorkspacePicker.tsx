'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { useDemoState } from '@/lib/demo/DemoStateProvider'
import { DemoBanner } from '@/components/ds/DemoBanner'
import { Monogram } from '@/components/ds/Monogram'
import { SearchIcon, PlusIcon, ChevronDownIcon, CheckIcon } from '@/components/ds/icons'
import { WS_SORTS, type WsSortKey } from '@/lib/workspace/data'

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
export function WorkspacePicker() {
  const { dict } = useI18n()
  const router = useRouter()
  const { workspaces, addWorkspace } = useDemoState()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<WsSortKey>('updated')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

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
    let list = workspaces.filter((w) => `${w.name} ${w.company} ${w.sub}`.toLowerCase().includes(query))
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'files') list = [...list].sort((a, b) => b.fileCount - a.fileCount)
    return list
  }, [workspaces, query, sort])

  const sortLabels: Record<WsSortKey, string> = {
    updated: dict.workspace.sortUpdated,
    name: dict.workspace.sortName,
    files: dict.workspace.sortFiles,
  }

  function createWorkspace() {
    const id = addWorkspace(dict.workspace.untitled)
    router.push(`/app/workspace/${id}`)
  }

  const newBtn =
    'flex items-center gap-[7px] rounded-[10px] bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper transition-opacity hover:opacity-90'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DemoBanner />
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
                <button
                  key={w.id}
                  type="button"
                  onClick={() => router.push(`/app/workspace/${w.id}`)}
                  className="flex min-h-[152px] flex-col gap-3.5 rounded-xl border border-hairline bg-paper p-[18px] text-start transition-colors hover:bg-subtle/50"
                >
                  <div className="flex items-center justify-between">
                    <Monogram name={w.initial} size={38} fontSize={16} radius={9} />
                    <span className="font-mono-num text-[11px] text-ink-ghost" dir="ltr">
                      {w.updatedLabel}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div
                      className="mb-[3px] text-[15px] font-semibold tracking-[-0.01em] text-ink"
                      dir="auto"
                    >
                      {w.name}
                    </div>
                    <div className="text-[12.5px] text-ink-muted" dir="auto">
                      {w.company} · {w.sub}
                    </div>
                  </div>
                  <div className="font-mono-num text-[11.5px] text-ink-faint">
                    <bdi dir="ltr">
                      {w.fileCount} {w.fileCount === 1 ? dict.workspace.fileOne : dict.workspace.files}
                    </bdi>
                  </div>
                </button>
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
