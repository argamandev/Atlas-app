'use client'

import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { locales, localeShortLabels, LOCALE_COOKIE, type Locale } from '@/lib/i18n/config'

// Compact EN | עב segmented control. Persists the choice in a cookie and refreshes
// the server tree so the layout re-reads it and flips dir + text on the spot.
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale } = useI18n()
  const router = useRouter()

  function setLocale(next: Locale) {
    if (next === locale) return
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} role="group" aria-label="Language">
      {locales.map((code) => {
        const active = code === locale
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={`font-mono-num text-2xs tracking-wide uppercase px-1.5 py-0.5 rounded-sm transition-colors ${
              active ? 'text-text-primary' : 'text-muted hover:text-text-secondary'
            }`}
          >
            {localeShortLabels[code]}
          </button>
        )
      })}
    </div>
  )
}
