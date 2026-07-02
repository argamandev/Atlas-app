'use client'
// ⚠️ GATEWAY (legacy-styled) — keep until Atlas has its own login/landing, then delete. See LEGACY.md

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase-browser'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createBrowserSupabase()
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })

    if (authErr) {
      setError('מייל או סיסמה שגויים')
      setLoading(false)
      return
    }

    router.push('/app/home')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      <div>
        <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// EMAIL</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@company.com"
          dir="ltr"
          className="w-full bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 font-mono-num transition-colors"
        />
      </div>
      <div>
        <label className="font-mono-num text-2xs text-muted tracking-widest block mb-2">// PASSWORD</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          dir="ltr"
          className="w-full bg-card border border-border px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 font-mono-num transition-colors"
        />
      </div>
      {error && <p className="font-mono-num text-xs text-error tracking-wide">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 bg-accent hover:bg-accent-hover text-white font-mono-num font-bold text-xs tracking-widest uppercase px-6 py-3 transition-colors disabled:opacity-50"
      >
        {loading ? '...' : 'כניסה →'}
      </button>
    </form>
  )
}
