'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { IconButton } from '@/components/ds/IconButton'
import { Surface } from '@/components/ds/Surface'
import { PencilIcon, TrashIcon } from '@/components/ds/icons'

// Admin-only per-transcript controls (rename + delete), shown beside a finished-call row on
// the company page. Calls PATCH/DELETE /api/transcripts/[id] (both admin-gated) then refreshes.
export function AdminCallControls({
  transcriptId,
  title,
  quarter,
}: {
  transcriptId: string
  title: string
  quarter: string
}) {
  const { dict } = useI18n()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [company, setCompany] = useState(title)
  const [q, setQ] = useState(quarter)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function rename() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company: company.trim(), quarter: q.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'failed')
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(dict.company.deleteConfirm)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'failed')
      router.refresh()
    } catch {
      setBusy(false)
    }
  }

  return (
    <span className="relative flex shrink-0 items-center gap-0.5">
      <IconButton label={dict.common.edit} size={28} onClick={() => setEditing((v) => !v)}>
        <PencilIcon size={15} />
      </IconButton>
      <IconButton label={dict.common.remove} size={28} onClick={() => void remove()}>
        <TrashIcon size={15} />
      </IconButton>

      {editing && (
        <Surface elevation="popover" className="absolute end-0 top-full z-50 mt-1 w-64 p-2.5 text-start">
          <div className="flex flex-col gap-2">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={dict.company.renameTitle}
              className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={dict.company.renameQuarter}
              dir="ltr"
              className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint"
            />
            {error && <p className="text-xs text-live">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-2 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                {dict.common.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void rename()}
                className="rounded-md bg-ink px-3 py-1 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
              >
                {dict.common.save}
              </button>
            </div>
          </div>
        </Surface>
      )}
    </span>
  )
}
