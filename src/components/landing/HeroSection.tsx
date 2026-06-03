'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isValidVideoUrl } from '@/lib/utils'
import { DottedSurface } from '@/components/ui/dotted-surface'

const STATS = [
  { value: '99.4%', label: 'ACCURACY' },
  { value: 'מלא',   label: 'TRANSCRIPTS' },
  { value: 'מוסדי', label: 'FORMATTING' },
  { value: '~2 דק׳', label: 'PROCESSING' },
]

const TRUSTED = ['קדמה קפיטל', 'אלטשולר שחם', 'מגדל השקעות', 'אנליסט IBI']

export function HeroSection() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidVideoUrl(url)) {
      setError(true)
      return
    }
    setError(false)
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
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  // ⌘ + Enter shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        document.getElementById('hero-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <section className="relative pt-36 pb-20 overflow-hidden">
      {/* Three.js animated particle field */}
      <DottedSurface className="opacity-40" />
      {/* Subtle grid background */}
      <div className="absolute inset-0 hero-grid pointer-events-none opacity-60" />
      {/* Radial fade at center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(255,106,0,0.03) 0%, transparent 65%)' }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 flex flex-col items-center text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 border border-border px-3 py-1.5 mb-10 font-mono-num">
          <span className="text-success text-xs animate-blink">■</span>
          <span className="text-xs text-text-secondary tracking-widest uppercase">MODULE 01 // CALL INTELLIGENCE · ACTIVE</span>
        </div>

        {/* Headline */}
        <h1 className="font-bold tracking-tighter leading-none mb-6" style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>
          <span className="block text-text-primary">תמלול ברמה מוסדית</span>
          <span className="block text-accent">לשיחות משקיעים</span>
        </h1>

        {/* Subheadline */}
        <p className="text-base text-text-secondary leading-relaxed mb-2 max-w-xl">
          הדביקו קישור YouTube לשיחת רווחים וקבלו תמלול מקצועי ומלא תוך דקות.
        </p>
        <p className="text-sm text-muted mb-10 max-w-xl font-mono-num tracking-wide">
          הפרדת דוברים. פורמט מוסדי. מוכן לביקורת.
        </p>

        {/* Terminal Input Box */}
        <form id="hero-form" onSubmit={handleSubmit} className="w-full max-w-2xl mb-0">
          {/* Header bar */}
          <div className="flex items-center justify-between border border-border border-b-0 bg-[#0d0d0d] px-4 py-2">
            <span className="font-mono-num text-2xs text-muted tracking-widest">
              <span className="text-accent">// MODULE 01 · CALL_INTELLIGENCE_ENGINE</span>
            </span>
            <span className="font-mono-num text-2xs text-muted tracking-widest">⌘ + ENTER</span>
          </div>
          {/* Input row */}
          <div className={`flex border border-t-0 ${error ? 'border-error/60' : 'border-border'}`}>
            <input
              type="text"
              dir="ltr"
              value={url}
              onChange={e => { setUrl(e.target.value); setError(false) }}
              placeholder="https://www.youtube.com/watch?v=... או https://vimeo.com/..."
              className="flex-1 bg-card px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none font-mono-num"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-accent hover:bg-accent-hover text-white font-mono-num font-bold text-xs tracking-widest uppercase px-6 shrink-0 transition-colors disabled:opacity-60 border-r border-border"
            >
              {loading ? '...' : 'TRANSCRIBE →'}
            </button>
          </div>
          {error && (
            <div className="border border-t-0 border-error/40 bg-error/5 px-4 py-2">
              <p className="text-xs text-error font-mono-num">
                // שגיאה: קישור YouTube או Vimeo לא תקין
              </p>
            </div>
          )}
        </form>

        {/* Stats grid */}
        <div className="w-full max-w-2xl grid grid-cols-4 border border-t-0 border-border">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`px-4 py-3 text-center ${i < STATS.length - 1 ? 'border-l border-border' : ''}`}
            >
              <div className="text-lg font-bold text-text-primary font-mono-num tracking-tight" dir="ltr">{s.value}</div>
              <div className="text-2xs text-muted font-mono-num tracking-widest uppercase mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Trusted by */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <span className="font-mono-num text-2xs text-muted tracking-widest uppercase">בשימוש מנהלי השקעות ב-</span>
          {TRUSTED.map((firm) => (
            <span key={firm} className="font-mono-num text-xs font-bold text-text-secondary tracking-wide uppercase">
              {firm}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
