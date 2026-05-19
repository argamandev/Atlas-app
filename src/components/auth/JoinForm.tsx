'use client'

import { useState } from 'react'

type State = 'idle' | 'loading' | 'success' | 'error' | 'duplicate'

export function JoinForm() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [state, setState] = useState<State>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== passwordConfirm) {
      setState('error')
      return
    }
    setState('loading')

    const res = await fetch('/api/access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, password }),
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
        <p className="font-mono-num text-sm text-text-primary tracking-wide mb-2">הבקשה נשלחה</p>
        <p className="font-mono-num text-2xs text-muted tracking-widest">נחזור אליך בקרוב לאחר אישור.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// שם פרטי</label>
          <input
            type="text"
            required
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="ישראל"
            dir="rtl"
            className="w-full bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
          />
        </div>
        <div>
          <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// שם משפחה</label>
          <input
            type="text"
            required
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="ישראלי"
            dir="rtl"
            className="w-full bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
          />
        </div>
      </div>
      <div>
        <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// EMAIL</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="email@company.com"
          dir="ltr"
          className="w-full bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 font-mono-num transition-colors"
        />
      </div>
      <div>
        <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// סיסמא</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="לפחות 8 תווים"
          dir="ltr"
          className="w-full bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
        />
      </div>
      <div>
        <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// אימות סיסמא</label>
        <input
          type="password"
          required
          value={passwordConfirm}
          onChange={e => setPasswordConfirm(e.target.value)}
          placeholder="הקלד שוב את הסיסמא"
          dir="ltr"
          className="w-full bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
        />
      </div>
      {state === 'duplicate' && (
        <p className="font-mono-num text-xs text-amber-400 tracking-wide">המייל הזה כבר הגיש בקשה.</p>
      )}
      {state === 'error' && (
        <p className="font-mono-num text-xs text-error tracking-wide">
          {password !== passwordConfirm ? 'הסיסמאות אינן תואמות.' : 'שגיאה. נסה שוב.'}
        </p>
      )}
      <button
        type="submit"
        disabled={state === 'loading'}
        className="mt-2 bg-card border border-border hover:border-accent/60 text-text-primary font-mono-num font-bold text-xs tracking-widest uppercase px-6 py-3 transition-colors disabled:opacity-50"
      >
        {state === 'loading' ? '...' : 'שלח בקשה →'}
      </button>
    </form>
  )
}
