'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border bg-bg">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Logo — right side in RTL */}
        <div className="flex items-center gap-3">
          {/* ICT square */}
          <div className="w-9 h-9 bg-accent flex items-center justify-center flex-shrink-0">
            <span className="text-white font-mono-num font-bold text-xs tracking-widest">ICT</span>
          </div>
          {/* Text stack */}
          <div className="flex flex-col leading-none">
            <span className="font-mono-num text-2xs text-muted tracking-widest uppercase">INVESTOR CALL</span>
            <span className="text-sm font-bold text-text-primary tracking-tight">תמלול.</span>
          </div>
        </div>

        {/* Desktop Nav — left side in RTL */}
        <div className="hidden md:flex items-center gap-6">
          <Link href="#features" className="font-mono-num text-xs text-text-secondary hover:text-text-primary transition-colors tracking-wide uppercase">
            מוצר
          </Link>
          <Link href="#pricing" className="font-mono-num text-xs text-text-secondary hover:text-text-primary transition-colors tracking-wide uppercase">
            תמחור
          </Link>
          <Link href="/dashboard" className="font-mono-num text-xs text-text-secondary hover:text-text-primary transition-colors tracking-wide uppercase">
            דשבורד
          </Link>
          <div className="w-px h-3 bg-border" />
          <Link href="/dashboard" className="font-mono-num text-xs font-bold text-text-primary hover:text-accent transition-colors tracking-wide uppercase">
            כניסה
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-text-secondary hover:text-text-primary p-1"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="תפריט"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-bg px-6 py-4 flex flex-col gap-4">
          <Link href="#features" className="font-mono-num text-xs text-text-secondary uppercase tracking-wide">מוצר</Link>
          <Link href="#pricing" className="font-mono-num text-xs text-text-secondary uppercase tracking-wide">תמחור</Link>
          <Link href="/dashboard" className="font-mono-num text-xs text-text-secondary uppercase tracking-wide">דשבורד</Link>
          <Link href="/dashboard" className="font-mono-num text-xs font-bold text-accent uppercase tracking-wide">כניסה</Link>
        </div>
      )}
    </nav>
  )
}
