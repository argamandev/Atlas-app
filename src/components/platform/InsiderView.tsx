'use client'

import { useState, useEffect, useRef } from 'react'

const NOTIFY_METHODS = ['מייל', 'וואטסאפ'] as const
type NotifyMethod = typeof NOTIFY_METHODS[number]

interface WatchlistItem {
  id: string
  ticker: string
  company_name: string
}

interface Prefs {
  notify_email: boolean
  notify_whatsapp: boolean
  email: string
  whatsapp_phone: string
}

interface SearchResult {
  ticker: string
  nameHe: string
  nameEn: string
}

interface RecentReport {
  reportId: string
  companyName: string
  reportUrl: string
  publicationDate: string | null
  firstSeenAt: string
}

interface TestResult {
  email: 'sent' | 'failed' | 'skipped'
  whatsapp: 'sent' | 'failed' | 'skipped'
  errors: { email?: string; whatsapp?: string }
}

export function InsiderView() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [prefs, setPrefs] = useState<Prefs>({
    notify_email: false,
    notify_whatsapp: false,
    email: '',
    whatsapp_phone: '',
  })
  const [loading, setLoading] = useState(true)
  const [newTicker, setNewTicker] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [recentReports, setRecentReports] = useState<RecentReport[]>([])
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/watchlist').then(r => r.json()),
      fetch('/api/notification-prefs').then(r => r.json()),
      fetch('/api/insider-reports/recent').then(r => r.json()),
    ]).then(([wl, p, rr]) => {
      setWatchlist(Array.isArray(wl) ? wl : [])
      if (p && !p.error) {
        setPrefs({
          notify_email: p.notify_email ?? false,
          notify_whatsapp: p.notify_whatsapp ?? false,
          email: p.email ?? '',
          whatsapp_phone: p.whatsapp_phone ?? '',
        })
      }
      setRecentReports(Array.isArray(rr) ? rr : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function handleTickerChange(val: string) {
    setNewTicker(val)
    setSearchError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(val.trim())}`)
        const data = await res.json()
        setSearchResults(Array.isArray(data) ? data : [])
        setSearchOpen(Array.isArray(data) && data.length > 0)
      } catch {
        setSearchResults([])
        setSearchOpen(false)
      }
    }, 200)
  }

  async function addFromResult(result: SearchResult) {
    setSearchOpen(false)
    setNewTicker('')
    setSearchResults([])
    await addTicker(result.ticker, result.nameHe)
  }

  async function addTicker(ticker: string, companyName: string) {
    const t = ticker.trim().toUpperCase()
    const cn = companyName.trim()
    if (!t) return
    if (watchlist.some(w => w.ticker === t)) return

    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: t, companyName: cn }),
    })
    if (res.ok) {
      const item = await res.json()
      setWatchlist(prev => [item, ...prev])
    } else {
      const data = await res.json()
      setSaveError(data.error || 'שגיאה בהוספת הנייר')
    }
  }

  async function handleTickerKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (searchOpen && searchResults.length > 0) {
        await addFromResult(searchResults[0])
      } else if (newTicker.trim()) {
        const value = newTicker.trim()
        setNewTicker('')
        setSearchResults([])
        setSearchOpen(false)
        await addTicker(value, value)
      }
    }
  }

  async function removeTicker(ticker: string) {
    await fetch('/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
    })
    setWatchlist(prev => prev.filter(w => w.ticker !== ticker))
  }

  function toggleMethod(m: NotifyMethod) {
    if (m === 'מייל') {
      setPrefs(prev => ({ ...prev, notify_email: !prev.notify_email }))
    } else {
      setPrefs(prev => ({ ...prev, notify_whatsapp: !prev.notify_whatsapp }))
    }
  }

  async function sendTestAlert() {
    setTestResult(null)
    setTestError(null)
    setTesting(true)
    try {
      const res = await fetch('/api/insider-alerts/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setTestError(typeof data.error === 'string' ? data.error : 'שגיאה בשליחת התראת בדיקה')
      } else {
        setTestResult(data as TestResult)
      }
    } catch {
      setTestError('שגיאה בשליחת התראת בדיקה')
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)

    const res = await fetch('/api/notification-prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notify_email: prefs.notify_email,
        notify_whatsapp: prefs.notify_whatsapp,
        email: prefs.email || null,
        whatsapp_phone: prefs.whatsapp_phone || null,
      }),
    })

    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      const data = await res.json()
      const msg =
        typeof data.error === 'string'
          ? data.error
          : JSON.stringify(data.error)
      setSaveError(msg)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <p className="font-mono-num text-xs text-accent tracking-widest uppercase mb-1">// MODULE 02</p>
        <h2 className="text-xl font-bold text-text-primary tracking-tight">עסקאות בעלי עניין</h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          סנטימנט תעקוב בזמן אמת אחרי עסקאות בעלי עניין ותעדכן אותך לפי ההעדפות שלך.
        </p>
        <div className="mt-4 flex items-center gap-3 border border-accent/40 bg-accent/5 px-4 py-3">
          <span className="text-accent text-base">⚠</span>
          <p className="font-mono-num text-xs text-accent tracking-wide">
            פיצ׳ר זה נמצא בפיתוח ואינו זמין כרגע.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="font-mono-num text-xs text-muted tracking-widest animate-pulse">טוען...</p>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-8">
          {/* Recent reports from MAYA */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-0.5 h-4 bg-accent" />
              <h3 className="text-sm font-semibold text-text-primary">דיווחים אחרונים מהבורסה</h3>
            </div>
            {recentReports.length === 0 ? (
              <p className="font-mono-num text-2xs text-muted tracking-widest">
                ■ ממתין לדיווח ראשון מהבורסה
              </p>
            ) : (
              <div className="flex flex-col">
                {recentReports.slice(0, 10).map((r) => {
                  const alreadyWatched = watchlist.some(
                    (w) => w.company_name.toLowerCase() === r.companyName.toLowerCase()
                  )
                  return (
                    <div
                      key={r.reportId}
                      className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-b-0"
                    >
                      <div className="flex flex-col flex-1 min-w-0">
                        <a
                          href={r.reportUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-text-primary hover:text-accent transition-colors truncate"
                        >
                          {r.companyName}
                        </a>
                        {r.publicationDate && (
                          <span className="font-mono-num text-2xs text-muted tracking-wide" dir="ltr">
                            {r.publicationDate}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={alreadyWatched}
                        onClick={() => addTicker(r.companyName, r.companyName)}
                        className="font-mono-num text-2xs text-accent border border-accent/40 hover:bg-accent/10 px-3 py-1 transition-colors tracking-widest disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap"
                      >
                        {alreadyWatched ? '■ במעקב' : '+ הוסף למעקב'}
                      </button>
                    </div>
                  )
                })}
                <p className="font-mono-num text-2xs text-muted tracking-wide mt-3">
                  לחץ ′+ הוסף למעקב′ כדי לעקוב אחר חברה שכבר פרסמה דיווח
                </p>
              </div>
            )}
          </section>

          {/* Securities watchlist */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-0.5 h-4 bg-accent" />
              <h3 className="text-sm font-semibold text-text-primary">ניירות ערך במעקב</h3>
            </div>

            {/* Current tickers */}
            <div className="flex flex-wrap gap-2 mb-3">
              {watchlist.map(item => (
                <div key={item.id} className="flex items-center gap-2 bg-card border border-border px-3 py-1.5">
                  <span className="font-mono-num text-xs font-bold text-text-primary" dir="ltr">{item.ticker}</span>
                  {item.company_name && item.company_name !== item.ticker && (
                    <span className="text-2xs text-muted">{item.company_name}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeTicker(item.ticker)}
                    className="text-muted hover:text-error transition-colors font-mono-num text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add ticker with search */}
            <div className="relative flex gap-2">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="text"
                  value={newTicker}
                  onChange={e => handleTickerChange(e.target.value.toUpperCase())}
                  onKeyDown={handleTickerKeyDown}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  placeholder="הוסף נייר ערך או שם חברה (TEVA, טבע…)"
                  dir="ltr"
                  maxLength={100}
                  className="w-full bg-card border border-border px-4 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/40 transition-colors font-mono-num"
                />
                {searchOpen && searchResults.length > 0 && (
                  <div className="absolute top-full right-0 left-0 z-50 bg-card border border-border mt-0.5 flex flex-col">
                    {searchResults.map(r => (
                      <button
                        key={r.ticker}
                        type="button"
                        onMouseDown={() => addFromResult(r)}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-accent/10 transition-colors text-left"
                      >
                        <span className="font-mono-num text-xs font-bold text-text-primary" dir="ltr">{r.ticker}</span>
                        <span className="text-xs text-text-secondary">{r.nameHe}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (searchResults.length > 0) {
                    addFromResult(searchResults[0])
                  } else if (newTicker.trim()) {
                    const value = newTicker.trim()
                    setNewTicker('')
                    setSearchResults([])
                    setSearchOpen(false)
                    addTicker(value, value)
                  }
                }}
                className="font-mono-num text-xs text-accent border border-accent/40 hover:bg-accent/10 px-4 py-2 transition-colors tracking-widest"
              >
                + הוסף
              </button>
            </div>
            {searchError && (
              <p className="font-mono-num text-xs text-error tracking-wide mt-2">{searchError}</p>
            )}
          </section>

          {/* Notification method */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-0.5 h-4 bg-accent" />
              <h3 className="text-sm font-semibold text-text-primary">שיטת עדכון</h3>
            </div>
            <div className="flex gap-2 mb-5" dir="ltr">
              {NOTIFY_METHODS.map(m => {
                const active = m === 'מייל' ? prefs.notify_email : prefs.notify_whatsapp
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMethod(m)}
                    className={`font-mono-num text-xs px-5 py-2 tracking-wide border transition-colors ${
                      active
                        ? 'bg-accent/10 border-accent/60 text-accent'
                        : 'bg-card border-border text-muted hover:text-text-secondary hover:border-[#2a2a2a]'
                    }`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>

            {/* Conditional inputs */}
            <div className="flex flex-col gap-3">
              {prefs.notify_email && (
                <div>
                  <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// EMAIL</label>
                  <input
                    type="email"
                    value={prefs.email}
                    onChange={e => setPrefs(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@company.com"
                    dir="ltr"
                    className="w-full max-w-sm bg-card border border-border px-4 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/40 transition-colors font-mono-num"
                  />
                </div>
              )}
              {prefs.notify_whatsapp && (
                <div>
                  <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// PHONE (WhatsApp)</label>
                  <input
                    type="tel"
                    value={prefs.whatsapp_phone}
                    onChange={e => setPrefs(prev => ({ ...prev, whatsapp_phone: e.target.value }))}
                    placeholder="0549556061 או +972-54-955-6061"
                    dir="ltr"
                    className="w-full max-w-sm bg-card border border-border px-4 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/40 transition-colors font-mono-num"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Save */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              className="bg-accent hover:bg-accent-hover text-white font-mono-num font-bold text-xs tracking-widest uppercase px-8 py-3 transition-colors"
            >
              שמור הגדרות
            </button>
            {saved && (
              <span className="font-mono-num text-xs text-success tracking-widest animate-pulse">
                ■ ההגדרות נשמרו
              </span>
            )}
            {saveError && (
              <span className="font-mono-num text-xs text-error tracking-wide">
                {saveError}
              </span>
            )}
          </div>

          {/* Test alert */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-0.5 h-4 bg-accent" />
              <h3 className="text-sm font-semibold text-text-primary">בדיקת מערכת התראות</h3>
            </div>
            <p className="text-2xs text-muted tracking-wide mb-3">
              שלח התראת בדיקה לפי ההגדרות השמורות כדי לוודא שמייל ו/או וואטסאפ עובדים.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="button"
                onClick={sendTestAlert}
                disabled={testing || (!prefs.notify_email && !prefs.notify_whatsapp)}
                className="font-mono-num text-xs text-accent border border-accent/40 hover:bg-accent/10 px-5 py-2 transition-colors tracking-widest disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {testing ? '...שולח' : 'שלח התראת בדיקה →'}
              </button>
              {testResult && (
                <>
                  {testResult.email === 'sent' && (
                    <span className="font-mono-num text-2xs text-success tracking-widest">■ מייל נשלח</span>
                  )}
                  {testResult.email === 'failed' && (
                    <span className="font-mono-num text-2xs text-error tracking-wide">
                      ■ מייל נכשל: {testResult.errors.email}
                    </span>
                  )}
                  {testResult.whatsapp === 'sent' && (
                    <span className="font-mono-num text-2xs text-success tracking-widest">■ וואטסאפ נשלח</span>
                  )}
                  {testResult.whatsapp === 'failed' && (
                    <span className="font-mono-num text-2xs text-error tracking-wide">
                      ■ וואטסאפ נכשל: {testResult.errors.whatsapp}
                    </span>
                  )}
                </>
              )}
              {testError && (
                <span className="font-mono-num text-2xs text-error tracking-wide">{testError}</span>
              )}
            </div>
          </section>
        </form>
      )}
    </div>
  )
}
