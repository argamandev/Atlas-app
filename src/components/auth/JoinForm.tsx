'use client'
// ⚠️ GATEWAY (legacy-styled) — keep until Atlas has its own login/landing, then delete. See LEGACY.md

import { useState } from 'react'

type State = 'idle' | 'loading' | 'success' | 'error' | 'duplicate'

const numEmployeesOptions = ['1–5', '6–20', '21–50', '51–200', '200+']

export function JoinForm() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [fundName, setFundName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [numEmployees, setNumEmployees] = useState('')
  const [state, setState] = useState<State>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')

    const res = await fetch('/api/access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, fundName, jobTitle, numEmployees }),
    })

    if (res.ok) {
      setState('success')
    } else {
      const data = await res.json()
      setState(data.code === 'duplicate' ? 'duplicate' : 'error')
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center py-6">
        <span className="text-success text-2xl block mb-4">■</span>
        <p className="text-sm text-text-primary font-medium mb-2">הפנייה נשלחה בהצלחה</p>
        <p className="text-xs text-muted">ניצור איתך קשר בהקדם.</p>
      </div>
    )
  }

  const inputCls =
    'w-full bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors rounded'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted block mb-1.5">שם פרטי</label>
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="ישראל"
            dir="rtl"
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1.5">שם משפחה</label>
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="ישראלי"
            dir="rtl"
            className={inputCls}
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="text-xs text-muted block mb-1.5">אימייל</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@company.com"
          dir="ltr"
          className={inputCls}
        />
      </div>

      {/* Fund name */}
      <div>
        <label className="text-xs text-muted block mb-1.5">שם הקרן / החברה</label>
        <input
          type="text"
          value={fundName}
          onChange={(e) => setFundName(e.target.value)}
          placeholder="קרן לדוגמא"
          dir="rtl"
          className={inputCls}
        />
      </div>

      {/* Role */}
      <div>
        <label className="text-xs text-muted block mb-1.5">תפקיד</label>
        <input
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="מנהל השקעות"
          dir="rtl"
          className={inputCls}
        />
      </div>

      {/* Num employees */}
      <div>
        <label className="text-xs text-muted block mb-1.5">כמות עובדים</label>
        <select
          value={numEmployees}
          onChange={(e) => setNumEmployees(e.target.value)}
          className={`${inputCls} cursor-pointer`}
          dir="rtl"
        >
          <option value="">בחרו טווח</option>
          {numEmployeesOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {state === 'duplicate' && <p className="text-xs text-amber-400">המייל הזה כבר הגיש בקשה.</p>}
      {state === 'error' && <p className="text-xs text-error">שגיאה. נסה שוב.</p>}

      <button
        type="submit"
        disabled={state === 'loading'}
        className="mt-2 bg-accent hover:bg-accent-hover text-white font-semibold text-sm px-6 py-3 rounded transition-colors disabled:opacity-50"
      >
        {state === 'loading' ? '...' : 'צור קשר'}
      </button>
    </form>
  )
}
