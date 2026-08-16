'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { fetchCompanies } from '@/lib/api/companies'
import { companyDisplayName, type Company } from '@/lib/api/types'
import { Surface } from '@/components/ds/Surface'
import { Logo } from '@/components/ds/Logo'
import { selectionClasses } from '@/components/ds/SelectableRow'

// @-mention company autocomplete (brief §5.3.2): floating card, "Watchlists" header,
// rows = logo → name → trailing ticker. Keyboard ↑/↓/Enter/Esc. Mirrors in RTL.
export function MentionDropdown({
  query,
  onSelect,
  onClose,
  onRowsChange,
}: {
  query: string
  onSelect: (c: Company) => void
  onClose: () => void
  /**
   * How many rows this card is SHOWING, whenever that changes.
   *
   * Enter is claimed by this component only while it has rows — with none it
   * declines the key and lets the composer send. A caller that also guards
   * Enter therefore needs the same fact, and "an `@` fragment is being typed"
   * is not it: `@zzz` matches nothing, renders nothing, and a caller guarding
   * on the fragment would swallow the keystroke with no picker on screen to
   * explain why (rules/app.md M3.2 — the choke point gets the fact, never a
   * proxy for it).
   */
  onRowsChange?: (rows: number) => void
}) {
  const { dict, locale } = useI18n()
  const [results, setResults] = useState<Company[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchCompanies(query)
      .then((r) => {
        if (!cancelled) {
          setResults(r)
          setActive(0)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [query])

  // Reported from an effect on the RENDERED list, not from inside the fetch, so
  // it cannot disagree with what is on screen — including the unmount, where a
  // caller must stop believing rows are showing.
  useEffect(() => {
    onRowsChange?.(results.length)
    return () => onRowsChange?.(0)
  }, [results, onRowsChange])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (results.length === 0 && e.key !== 'Escape') return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (a + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a - 1 + results.length) % results.length)
      } else if (e.key === 'Enter') {
        if (results[active]) {
          e.preventDefault()
          onSelect(results[active])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [results, active, onSelect, onClose])

  if (results.length === 0) return null

  return (
    <Surface
      elevation="popover"
      className="absolute bottom-full inset-x-0 mb-2 max-h-72 overflow-y-auto p-1.5 text-start"
    >
      <div className="px-2 py-1 text-xs font-medium text-ink-faint">{dict.chat.watchlists}</div>
      {results.map((c, i) => (
        <button
          key={c.id}
          type="button"
          onMouseEnter={() => setActive(i)}
          onClick={() => onSelect(c)}
          className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start ${selectionClasses(i === active)}`}
        >
          <Logo src={c.logoUrl} name={c.displayName} size={28} />
          <span className="flex-1 truncate text-sm text-ink">{companyDisplayName(c, locale)}</span>
          {c.ticker && (
            <span className="text-xs text-ink-faint" dir="ltr">
              {c.ticker}
            </span>
          )}
        </button>
      ))}
    </Surface>
  )
}
