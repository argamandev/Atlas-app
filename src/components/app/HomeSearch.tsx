'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { fetchCompanies } from '@/lib/api/companies'
import { companyDisplayName, type Company } from '@/lib/api/types'
import { Surface } from '@/components/ds/Surface'
import { EntityRow } from '@/components/ds/EntityRow'
import { SearchIcon } from '@/components/ds/icons'

// Centered company search (brief §5.1). Live-filters the company directory and
// navigates to the company page on select.
export function HomeSearch() {
  const { dict, locale } = useI18n()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Company[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setResults([])
      setOpen(false)
      return
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetchCompanies(term)
        setResults(r)
        setOpen(true)
      } catch {
        /* ignore transient search errors */
      }
    }, 160)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const go = (id: string) => {
    setOpen(false)
    router.push(`/app/company/${id}`)
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2.5 rounded-card border border-subtle-strong bg-paper py-[13px] pe-4 ps-[18px] shadow-soft transition-shadow focus-within:shadow-float">
        <SearchIcon size={17} strokeWidth={1.7} className="flex-none text-ink-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={dict.home.searchPlaceholder}
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
        />
        {/* TASE coverage mark (design lines 227-231): divider · exchange mark · caps tag */}
        <span
          title="Covering every company listed on the Tel Aviv Stock Exchange"
          className="pointer-events-none flex flex-none items-center gap-[9px]"
        >
          <span className="h-5 w-px bg-[#D5D5D5]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/tase-mark.png" alt="" className="h-[15px] w-auto opacity-60" />
          <span className="text-[11px] font-semibold tracking-[0.11em] text-[#8A8A8A]">TASE</span>
        </span>
      </div>

      {open && results.length > 0 && (
        <Surface
          elevation="popover"
          className="absolute inset-x-0 top-full z-50 mt-2 animate-pop-in p-1.5 text-start"
        >
          {results.map((c) => (
            <EntityRow
              key={c.id}
              name={companyDisplayName(c, locale)}
              secondary={c.sector ?? undefined}
              meta={c.ticker ? <span dir="ltr">{c.ticker}</span> : undefined}
              logoSrc={c.logoUrl}
              onClick={() => go(c.id)}
            />
          ))}
        </Surface>
      )}
    </div>
  )
}
