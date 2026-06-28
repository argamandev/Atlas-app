'use client'
// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { isValidVideoUrl } from '@/lib/utils'

interface UrlInputBarProps {
  size?: 'hero' | 'standard'
}

export function UrlInputBar({ size = 'standard' }: UrlInputBarProps) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidVideoUrl(url)) {
      setError(true)
      setErrorMsg(null)
      return
    }
    setError(false)
    setErrorMsg(null)
    setLoading(true)

    try {
      const res = await fetch('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `שגיאה ${res.status}`)
      router.push(`/processing/${data.id}`)
    } catch (e) {
      setError(true)
      setErrorMsg(e instanceof Error ? e.message : 'שגיאה לא ידועה')
      setLoading(false)
    }
  }

  const isHero = size === 'hero'

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          {/* YouTube icon */}
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
            <svg className={isHero ? 'w-4 h-4' : 'w-3.5 h-3.5'} viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </span>
          <input
            type="text"
            dir="ltr"
            value={url}
            onChange={e => { setUrl(e.target.value); setError(false); setErrorMsg(null) }}
            placeholder="הדבק קישור YouTube או Vimeo..."
            className={`w-full bg-card border rounded pr-10 pl-4 text-sm text-text-primary placeholder:text-muted text-right
              focus:outline-none focus:ring-1 transition-colors
              ${isHero ? 'h-12' : 'h-10'}
              ${error
                ? 'border-error/60 focus:ring-error/30 focus:border-error/60'
                : 'border-border hover:border-[#2a2a2a] focus:ring-accent/40 focus:border-accent/40'
              }`}
          />
        </div>
        <Button
          type="submit"
          size={isHero ? 'lg' : 'md'}
          loading={loading}
          className={`shrink-0 ${isHero ? 'h-12 px-6' : 'h-10 px-5'}`}
        >
          התחל תמלול
        </Button>
      </div>
      {error && (
        <p className="text-xs text-error mt-2" dir={errorMsg ? 'ltr' : 'rtl'}>
          {errorMsg ?? 'קישור לא תקין. ודאו שהקישור הוא מ-YouTube או Vimeo'}
        </p>
      )}
    </form>
  )
}
