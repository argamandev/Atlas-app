'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { SearchIcon, PlusIcon, CheckIcon } from '@/components/ds/icons'
import type { AttachableSource } from '@/lib/workspace/data'
import { fetchSources, addItemReq } from '@/lib/workspace/client'

// Puts a REAL source on the shelf: an investor-call transcript or a corpus
// document, both shared corpus. This is the piece that makes a workspace hold
// something — before it existed a new workspace could only sit empty.
//
// Private uploads are NOT offered. The item table supports a storage_path, but
// no browser upload path exists in Atlas yet (extraction is script-only, via
// pdfjs in scripts/ingest-document.ts). Offering a button that cannot work is
// the failure this codebase keeps filing; when upload lands, it joins here.

export function WorkspaceSourcePicker({
  workspaceId,
  attachedSourceIds,
  onAttached,
}: {
  workspaceId: string
  /** transcript_id / document_id already on this shelf — the DB refuses duplicates */
  attachedSourceIds: string[]
  onAttached?: () => void
}) {
  const { dict } = useI18n()
  const router = useRouter()

  const [sources, setSources] = useState<AttachableSource[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [addError, setAddError] = useState<unknown>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState<string[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    let live = true
    fetchSources()
      .then((r) => {
        if (!live) return
        setSources(r.sources)
        setLoadError(null)
      })
      .catch((e: unknown) => {
        if (!live) return
        // The list stays NULL rather than becoming [], so the empty state and a
        // failed fetch cannot render as the same screen. That conflation is the
        // exact defect fix/projects-honesty was gated on.
        setSources(null)
        setLoadError(e)
      })
    return () => {
      live = false
    }
  }, [])

  const attached = useMemo(
    () => new Set([...attachedSourceIds, ...justAdded]),
    [attachedSourceIds, justAdded]
  )

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!sources) return []
    if (!query) return sources
    return sources.filter((s) => `${s.title} ${s.company ?? ''}`.toLowerCase().includes(query))
  }, [sources, q])

  async function attach(s: AttachableSource) {
    if (busyId) return
    setBusyId(s.sourceId)
    setAddError(null)
    try {
      await addItemReq(workspaceId, {
        kind: s.kind,
        name: s.title,
        ...(s.kind === 'transcript' ? { transcript_id: s.sourceId } : { document_id: s.sourceId }),
      })
      setJustAdded((a) => [...a, s.sourceId])
      onAttached?.()
      // The shelf is read on the SERVER, so the new item only appears after the
      // server component runs again. Without this the row would sit in the
      // database while the screen kept claiming the workspace was empty.
      router.refresh()
    } catch (e) {
      setAddError(e)
    } finally {
      setBusyId(null)
    }
  }

  const authProps = { expired: dict.common.sessionExpired, signIn: dict.common.signIn }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {(loadError !== null || addError !== null) && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-[13px] text-ink"
        >
          {loadError !== null && (
            <ErrorLine template={dict.workspace.sourcesFailed} error={loadError} auth={authProps} />
          )}
          {addError !== null && (
            <ErrorLine template={dict.workspace.attachFailed} error={addError} auth={authProps} />
          )}
        </div>
      )}

      <div className="relative flex-none">
        <SearchIcon
          size={16}
          strokeWidth={1.6}
          className="absolute top-1/2 -translate-y-1/2 text-ink opacity-40 ltr:left-[13px] rtl:right-[13px]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={dict.workspace.searchSources}
          className="h-10 w-full rounded-[9px] border border-hairline bg-paper text-[14px] text-ink outline-none placeholder:text-ink-faint ltr:pl-[38px] ltr:pr-3 rtl:pl-3 rtl:pr-[38px]"
        />
      </div>

      {sources === null && loadError === null && (
        <p className="px-1 py-6 text-center text-[13px] text-ink-muted">{dict.common.loading}</p>
      )}

      {sources !== null && (
        <div className="atscroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-1 py-6 text-center text-[13px] text-ink-muted">
              {q.trim() ? dict.workspace.noSourceMatch : dict.workspace.noSources}
            </p>
          ) : (
            visible.map((s) => {
              const on = attached.has(s.sourceId)
              return (
                <div
                  key={`${s.kind}:${s.sourceId}`}
                  className="flex items-center gap-2.5 rounded-[9px] border border-hairline bg-paper px-3 py-2.5"
                >
                  <span
                    className={`flex-none rounded-[5px] px-1.5 py-[3px] font-mono-num text-[9.5px] tracking-[0.06em] ${
                      s.kind === 'transcript'
                        ? 'text-[#4A6E8A] bg-[rgba(74,110,138,.12)]'
                        : 'text-[#9C6B4E] bg-[rgba(156,107,78,.12)]'
                    }`}
                  >
                    {s.kind === 'transcript' ? 'CALL' : 'DOC'}
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* Titles are usually Hebrew and often carry a Latin ticker
                        or year. <bdi> per run, never dir on the line. */}
                    <div className="truncate text-[13.5px] text-ink">
                      <bdi>{s.title}</bdi>
                    </div>
                    {s.company && (
                      <div className="truncate text-[11.5px] text-ink-ghost">
                        <bdi>{s.company}</bdi>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={on || busyId === s.sourceId}
                    onClick={() => attach(s)}
                    className={`flex flex-none items-center gap-1 rounded-[7px] px-2.5 py-1.5 text-[12.5px] transition-colors ${
                      on ? 'text-ink-ghost' : 'bg-ink text-paper hover:opacity-90 disabled:opacity-50'
                    }`}
                  >
                    {on ? (
                      <>
                        <CheckIcon size={13} strokeWidth={1.9} />
                        {dict.workspace.sourceAdded}
                      </>
                    ) : (
                      <>
                        <PlusIcon size={13} strokeWidth={1.9} />
                        {dict.common.add}
                      </>
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
