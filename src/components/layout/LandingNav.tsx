'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { LanguageToggle } from '@/components/ui/LanguageToggle'

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { dict } = useI18n()

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border bg-bg">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link href="/home" className="flex items-center gap-3">
          <span className="font-mono-num font-bold text-white tracking-tight text-base" dir="auto">
            {dict.common.brand}<span className="text-accent">.</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link href="#features" className="font-mono-num text-xs text-text-secondary hover:text-text-primary transition-colors tracking-wide uppercase">
            {dict.nav.product}
          </Link>
          <div className="w-px h-3 bg-border" />
          <Link href="/dashboard" className="font-mono-num text-xs font-bold text-text-primary hover:text-accent transition-colors tracking-wide uppercase">
            {dict.nav.enter}
          </Link>
          <div className="w-px h-3 bg-border" />
          <LanguageToggle />
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-text-secondary hover:text-text-primary p-1"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={dict.common.menu}
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
          <Link href="#features" className="font-mono-num text-xs text-text-secondary uppercase tracking-wide">{dict.nav.product}</Link>
          <Link href="/dashboard" className="font-mono-num text-xs font-bold text-accent uppercase tracking-wide">{dict.nav.enter}</Link>
          <LanguageToggle />
        </div>
      )}
    </nav>
  )
}
