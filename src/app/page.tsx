'use client'

import { useState } from 'react'
import { DottedSurface } from '@/components/ui/dotted-surface'
import { LoginForm } from '@/components/auth/LoginForm'
import { JoinForm } from '@/components/auth/JoinForm'

type Mode = 'login' | 'join'

const CAPABILITIES = [
  { num: '01', text: 'תמלול שיחות משקיעים עם סוכן או קישור.', status: 'LIVE', color: 'text-success' },
  { num: '02', text: 'סנטימנט אוספת בזמן אמת נתונים על עסקאות בעלי עניין ומעדכנת אותך אישית.', status: 'BETA', color: 'text-amber-400' },
  { num: '03', text: 'בפיתוח.', status: 'DEV', color: 'text-muted' },
]

export default function EntryGate() {
  const [mode, setMode] = useState<Mode>('login')

  return (
    <div className="relative bg-bg min-h-screen overflow-x-hidden" dir="rtl">
      <DottedSurface />
      <div className="scan-line pointer-events-none fixed inset-0 z-10" />

      {/* Top bar */}
      <header className="fixed top-0 right-0 left-0 z-20 flex items-center justify-between px-8 py-4 border-b border-border/40 bg-bg/80 backdrop-blur-sm" dir="ltr">
        <span className="font-mono-num font-bold text-white text-base tracking-tight">
          Sentiment<span className="text-accent">.</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-blink" />
          <span className="font-mono-num text-2xs text-muted tracking-widest uppercase">INVITATION-ONLY PLATFORM //</span>
        </div>
      </header>

      {/* Main layout: left = hero, right = auth panel */}
      <div className="relative z-10 min-h-screen flex items-center justify-center pt-16">
        <div className="w-full max-w-5xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16 py-16">

          {/* Left — hero text */}
          <div className="flex-1 text-center lg:text-right">
            <h1
              className="font-bold text-white tracking-tighter leading-none mb-6"
              style={{ fontSize: 'clamp(40px, 5.5vw, 76px)' }}
            >
              בינה מלאכותית<br />
              <span className="text-accent">למשקיעים.</span>
            </h1>
            <p className="font-mono-num text-xs text-muted tracking-widest uppercase mb-12">
              AI PLATFORM FOR INSTITUTIONAL INVESTORS
            </p>

            {/* Capabilities list */}
            <div className="flex flex-col gap-5 text-right max-w-sm mx-auto lg:mx-0">
              {CAPABILITIES.map((c) => (
                <div key={c.num} className="flex items-start gap-4">
                  <span className={`font-mono-num text-2xs tracking-widest mt-1 flex-shrink-0 ${c.color}`}>{c.status}</span>
                  <p className="text-sm text-text-secondary leading-relaxed">{c.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — auth panel */}
          <div className="w-full max-w-sm flex-shrink-0">
            <div className="bg-bg/60 border border-border backdrop-blur-md">
              {/* Tab switcher */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => setMode('login')}
                  className={`flex-1 font-mono-num text-xs tracking-widest uppercase py-3.5 transition-colors border-b-2 ${
                    mode === 'login'
                      ? 'text-text-primary border-accent'
                      : 'text-muted border-transparent hover:text-text-secondary'
                  }`}
                >
                  כניסה
                </button>
                <button
                  onClick={() => setMode('join')}
                  className={`flex-1 font-mono-num text-xs tracking-widest uppercase py-3.5 transition-colors border-b-2 ${
                    mode === 'join'
                      ? 'text-text-primary border-accent'
                      : 'text-muted border-transparent hover:text-text-secondary'
                  }`}
                >
                  הצטרפות
                </button>
              </div>

              {/* Form */}
              <div className="px-6 py-6">
                {mode === 'login' ? (
                  <LoginForm />
                ) : (
                  <>
                    <p className="font-mono-num text-2xs text-muted tracking-widest mb-5">
                      // בקשתך תועבר לאישור. נחזור אליך במייל.
                    </p>
                    <JoinForm />
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 px-8 py-4 flex items-center justify-between" dir="ltr">
        <span className="font-mono-num text-2xs text-muted tracking-widest">© 2026 SENTIMENT INTELLIGENCE LTD.</span>
        <span className="font-mono-num text-2xs text-muted tracking-widest">REV.2026.Q2</span>
      </footer>
    </div>
  )
}
