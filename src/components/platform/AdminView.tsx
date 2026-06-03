'use client'

import { useState, useEffect } from 'react'

interface AccessRequest {
  id: string
  email: string
  first_name: string
  last_name: string
  fund_name?: string
  job_title?: string
  num_employees?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export function AdminView() {
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
        <p className="text-xs text-muted" dir="ltr">{req.email}</p>
        {req.fund_name && <p className="text-xs text-text-secondary mt-0.5">{req.fund_name}{req.job_title ? ` · ${req.job_title}` : ''}{req.num_employees ? ` · ${req.num_employees} עובדים` : ''}</p>}
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
