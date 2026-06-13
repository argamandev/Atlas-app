'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { isValidVideoUrl } from '@/lib/utils'
import { apiPost } from '@/lib/api/client'
import { Surface } from '@/components/ds/Surface'
import { PlusIcon, ArrowUpIcon } from '@/components/ds/icons'

// "Add Investor Call" (brief §5.4): paste a YouTube link → the REAL existing
// transcription pipeline (POST /api/transcripts). Auth-gated upstream, so a 401
// (no session) is surfaced as a friendly sign-in hint.
type Status = 'idle' | 'submitting' | 'done' | 'error'

export function AddInvestorCall({ companyId }: { companyId?: string }) {
  const { dict } = useI18n()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function submit() {
    if (!isValidVideoUrl(url)) {
      setStatus('error')
      setMessage(dict.company.addCallPlaceholder)
      return
    }
    setStatus('submitting')
    setMessage('')
    try {
      const res = await apiPost<{ id: string }>('/api/transcripts', { url, companyId })
      setStatus('done')
      setMessage(`${dict.company.queued} · ${res.id}`)
      setUrl('')
    } catch (err) {
      setStatus('error')
      setMessage((err as Error).message)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black"
      >
        <PlusIcon size={15} />
        {dict.company.addInvestorCall}
      </button>

      {open && (
        <Surface elevation="popover" className="absolute end-0 top-full z-50 mt-2 w-80 p-2.5 text-start">
          <div className="flex items-center gap-2 rounded-bubble border border-hairline bg-canvas px-3 py-2">
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={dict.company.addCallPlaceholder}
              dir="ltr"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              type="button"
              onClick={submit}
              disabled={status === 'submitting'}
              aria-label={dict.company.addCallCta}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-faint text-white transition-colors enabled:hover:bg-ink disabled:opacity-50"
            >
              <ArrowUpIcon size={15} />
            </button>
          </div>
          {message && (
            <p className={`mt-2 px-1 text-xs ${status === 'error' ? 'text-live' : 'text-ink-muted'}`}>{message}</p>
          )}
        </Surface>
      )}
    </div>
  )
}
