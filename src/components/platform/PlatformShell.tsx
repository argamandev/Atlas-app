'use client'

import { useState, useRef, useEffect } from 'react'
import { DottedSurface } from '@/components/ui/dotted-surface'
import { UrlInputBar } from '@/components/dashboard/UrlInputBar'
import { TranscriptsTable } from '@/components/dashboard/TranscriptsTable'
import { InsiderView } from './InsiderView'
import type { RecentTranscript } from '@/lib/types'

type Tab = 'transcripts' | 'insider' | 'admin'

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  transcripts: RecentTranscript[]
  isAdmin?: boolean
  userName?: string
}

export function PlatformShell({ transcripts, isAdmin = false, userName = 'אנליסט' }: Props) {
  const [tab, setTab] = useState<Tab>('transcripts')

  return (
    <div className="relative min-h-screen bg-bg flex flex-col overflow-hidden" dir="rtl">
      <DottedSurface className="opacity-20" />
      <div className="scan-line pointer-events-none fixed inset-0 z-10" />

      {/* Top nav */}
      <header className="relative z-20 flex items-center justify-between px-6 h-14 border-b border-border bg-bg/90 backdrop-blur-sm flex-shrink-0" dir="ltr">
        {/* Brand */}
        <span className="font-mono-num font-bold text-white text-base tracking-tight">
          תמלול<span className="text-accent">.</span>
        </span>

        {/* Tabs — right to left: תמלולים | עסקאות | Admin */}
        <div className="flex items-center gap-1">
          <TabBtn label="עסקאות בעלי עניין" active={tab === 'insider'} onClick={() => setTab('insider')} />
          <TabBtn label="תמלולים" active={tab === 'transcripts'} onClick={() => setTab('transcripts')} />
          {isAdmin && <TabBtn label="Admin" active={tab === 'admin'} onClick={() => setTab('admin')} accent />}
        </div>

        {/* User */}
        <div className="flex items-center gap-3">
          <span className="font-mono-num text-xs text-text-secondary hidden sm:block">{userName}</span>
          <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-accent">{userName[0]}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-20 flex-1 flex flex-col overflow-hidden">
        {tab === 'transcripts' && <TranscriptsView transcripts={transcripts} />}
        {tab === 'insider' && <InsiderView />}
        {tab === 'admin' && isAdmin && <AdminView />}
      </main>
    </div>
  )
}

function TabBtn({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`font-mono-num text-xs px-4 py-1.5 tracking-wide transition-colors border-b-2 ${
        active
          ? 'text-text-primary border-accent'
          : accent
          ? 'text-accent/60 border-transparent hover:text-accent hover:border-accent/40'
          : 'text-muted border-transparent hover:text-text-secondary hover:border-border'
      }`}
    >
      {label}
    </button>
  )
}

/* ── HOME / CHAT VIEW ─────────────────────────────────────────── */

const INITIAL_MESSAGES: Message[] = [
  {
    id: 0,
    role: 'assistant',
    text: 'היי אנליסט, אני Sentiment.\n\nתוכל לשאול אותי על ניירות ערך, תמלולים שבמאגר, דוחות כספיים, או להגדיר עדכונים על ניירות שאתה עוקב אחריהם.',
  },
]

function HomeView({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: Date.now(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Simulated response — replace with real LLM call when ready
    setTimeout(() => {
      const reply: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        text: 'מעבד את השאלה שלך... (יכולת הצ\'אט תהיה זמינה בקרוב)',
      }
      setMessages(prev => [...prev, reply])
      setLoading(false)
    }, 800)
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full px-4 pt-8 pb-0">
      {/* Greeting */}
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          היי, <span className="text-accent">{userName}</span>
        </h1>
        <p className="font-mono-num text-xs text-muted tracking-widest mt-1">
          {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4 min-h-0">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            {msg.role === 'assistant' ? (
              <div className="w-7 h-7 flex-shrink-0 border border-accent/40 flex items-center justify-center mt-0.5">
                <span className="font-mono-num text-2xs text-accent font-bold">S</span>
              </div>
            ) : (
              <div className="w-7 h-7 flex-shrink-0 rounded-full bg-accent/20 flex items-center justify-center mt-0.5">
                <span className="text-xs font-semibold text-accent">א</span>
              </div>
            )}

            {/* Bubble */}
            <div
              className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'assistant'
                  ? 'bg-card border border-border text-text-primary'
                  : 'bg-accent/10 border border-accent/20 text-text-primary'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 flex-shrink-0 border border-accent/40 flex items-center justify-center">
              <span className="font-mono-num text-2xs text-accent font-bold">S</span>
            </div>
            <div className="bg-card border border-border px-4 py-3">
              <span className="font-mono-num text-xs text-muted animate-pulse tracking-widest">...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex-shrink-0 border-t border-border bg-bg/80 backdrop-blur-sm pt-3 pb-5"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="שאל על ניירות ערך, תמלולים, עסקאות..."
            className="flex-1 bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/40 transition-colors font-hebrew"
            dir="rtl"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-accent hover:bg-accent-hover text-white font-mono-num font-bold text-xs tracking-widest uppercase px-5 py-3 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            שלח
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── TRANSCRIPTS VIEW ─────────────────────────────────────────── */

function TranscriptsView({ transcripts }: { transcripts: RecentTranscript[] }) {
  const completed = transcripts.filter(t => t.status === 'completed').length

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono-num text-xs text-accent tracking-widest uppercase mb-1">// MODULE 01</p>
          <h2 className="text-xl font-bold text-text-primary tracking-tight">תמלולים</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="font-mono-num text-lg font-bold text-text-primary">{completed}</span>
            <span className="font-mono-num text-2xs text-muted block tracking-widest">הושלמו</span>
          </div>
          <div className="text-right">
            <span className="font-mono-num text-lg font-bold text-text-primary">{transcripts.length}</span>
            <span className="font-mono-num text-2xs text-muted block tracking-widest">סה&quot;כ</span>
          </div>
        </div>
      </div>

      {/* New transcription input */}
      <div className="bg-card border border-border p-5 mb-6">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono-num text-xs text-accent">// תמלול חדש</span>
          </div>
          <p className="text-xs text-muted">הדביקו קישור YouTube לשיחת משקיעים לקבלת תמלול מקצועי</p>
        </div>
        <UrlInputBar size="hero" />
      </div>

      {/* Agent setup hint */}
      <div className="border border-border/50 border-dashed p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono-num text-xs text-text-secondary tracking-wide">// סוכן אוטומטי</p>
          <p className="text-xs text-muted mt-1">הגדר סוכן שיתמלל שיחות עבורך אוטומטית לפי לוח זמנים</p>
        </div>
        <span className="font-mono-num text-2xs text-amber-400 tracking-widest border border-amber-400/30 px-2 py-1">BETA</span>
      </div>

      {/* Table */}
      <TranscriptsTable transcripts={transcripts} />
    </div>
  )
}

/* ── ADMIN VIEW ───────────────────────────────────────────────── */

interface AccessRequest {
  id: string
  email: string
  first_name: string
  last_name: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

function AdminView() {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/requests')
      .then(r => r.json())
      .then(data => { setRequests(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleAction(requestId: string, action: 'approve' | 'reject') {
    setActing(requestId)
    await fetch('/api/admin/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action }),
    })
    setRequests(prev =>
      prev.map(r => r.id === requestId
        ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' }
        : r
      )
    )
    setActing(null)
  }

  const pending = requests.filter(r => r.status === 'pending')
  const reviewed = requests.filter(r => r.status !== 'pending')

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <p className="font-mono-num text-xs text-accent tracking-widest uppercase mb-1">// ADMIN</p>
        <h2 className="text-xl font-bold text-text-primary tracking-tight">בקשות גישה</h2>
      </div>

      {loading && (
        <p className="font-mono-num text-xs text-muted tracking-widest animate-pulse">טוען...</p>
      )}

      {!loading && pending.length === 0 && reviewed.length === 0 && (
        <div className="border border-border/50 border-dashed p-8 text-center">
          <p className="font-mono-num text-xs text-muted tracking-widest">אין בקשות עדיין</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-0.5 h-4 bg-amber-400" />
            <h3 className="text-sm font-semibold text-text-primary">ממתינות לאישור</h3>
            <span className="font-mono-num text-2xs text-amber-400 border border-amber-400/30 px-2 py-0.5">{pending.length}</span>
          </div>
          <div className="flex flex-col divide-y divide-border border border-border">
            {pending.map(req => (
              <RequestRow key={req.id} req={req} acting={acting === req.id} onAction={(a) => handleAction(req.id, a)} />
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-0.5 h-4 bg-border" />
            <h3 className="text-sm font-semibold text-text-secondary">טופלו</h3>
          </div>
          <div className="flex flex-col divide-y divide-border border border-border opacity-60">
            {reviewed.map(req => (
              <RequestRow key={req.id} req={req} acting={false} onAction={() => {}} readonly />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RequestRow({
  req, acting, onAction, readonly,
}: {
  req: AccessRequest
  acting: boolean
  onAction: (a: 'approve' | 'reject') => void
  readonly?: boolean
}) {
  const statusColor = req.status === 'approved' ? 'text-success' : req.status === 'rejected' ? 'text-error' : 'text-amber-400'
  const statusLabel = req.status === 'approved' ? 'אושר' : req.status === 'rejected' ? 'נדחה' : 'ממתין'

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-card gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{req.first_name} {req.last_name}</p>
        <p className="font-mono-num text-xs text-muted" dir="ltr">{req.email}</p>
      </div>
      <span className={`font-mono-num text-2xs tracking-widest ${statusColor}`}>{statusLabel}</span>
      {!readonly && req.status === 'pending' && (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onAction('approve')}
            disabled={acting}
            className="font-mono-num text-2xs text-success border border-success/40 hover:bg-success/10 px-3 py-1.5 tracking-widest transition-colors disabled:opacity-40"
          >
            אשר
          </button>
          <button
            onClick={() => onAction('reject')}
            disabled={acting}
            className="font-mono-num text-2xs text-error border border-error/40 hover:bg-error/10 px-3 py-1.5 tracking-widest transition-colors disabled:opacity-40"
          >
            דחה
          </button>
        </div>
      )}
    </div>
  )
}
