'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { formatDate } from '@/lib/i18n/format'
import { SunIcon } from '@/components/ds/icons'

// Quiet "today" line that sits above the home greeting (brief §5.1 hero). Rendered on the
// client so the date matches the viewer's local day; empty on the server to avoid hydration
// mismatch (the line simply fades in once mounted).
export function TodayLine() {
  const { locale } = useI18n()
  const [label, setLabel] = useState('')

  useEffect(() => {
    setLabel(formatDate(new Date(), locale, { weekday: 'long', month: 'long', day: 'numeric' }))
  }, [locale])

  return (
    <div className="flex h-5 items-center gap-2 text-sm text-ink-faint">
      {label && (
        <>
          <SunIcon size={15} />
          <span>{label}</span>
        </>
      )}
    </div>
  )
}
