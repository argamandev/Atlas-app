'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { companyDisplayName, type ScheduledCall } from '@/lib/api/types'
import { setFollowCall } from '@/lib/api/calls'
import { formatMonthYear, formatWeekday, formatTime, formatDate } from '@/lib/i18n/format'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  PlusIcon,
  CloseIcon,
  CalReportIcon,
  CalMicIcon,
  CalWebinarIcon,
} from '@/components/ds/icons'
import { eventKind, EVENT_KINDS, EVENT_KIND_META, type EventKind } from '@/lib/calendar/event-meta'
import { cn } from '@/lib/utils'

function dayKey(iso: string): string {
  // Use LOCAL date components so a call buckets onto the same grid cell the user sees
  // (slicing the ISO string would use UTC and misplace calls near midnight).
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const KIND_ICON: Record<EventKind, typeof CalMicIcon> = {
  call: CalMicIcon,
  report: CalReportIcon,
  webinar: CalWebinarIcon,
}

export function CalendarView({ calls, followedIds }: { calls: ScheduledCall[]; followedIds: string[] }) {
  const { dict, locale } = useI18n()
  const [followed, setFollowed] = useState<Set<string>>(new Set(followedIds))
  const [mode, setMode] = useState<'all' | 'mine'>('all')
  const [kinds, setKinds] = useState<Set<EventKind>>(new Set(EVENT_KINDS))
  const [dropActive, setDropActive] = useState(false)

  // default to the month of the earliest call (the seeded Q2 calls), else today
  const initialMonth = useMemo(() => {
    const first = calls.map((c) => new Date(c.scheduledAt)).sort((a, b) => a.getTime() - b.getTime())[0]
    const d = first ?? new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }, [calls])
  const [month, setMonth] = useState(initialMonth)

  const visible = (mode === 'mine' ? calls.filter((c) => followed.has(c.id)) : calls).filter((c) =>
    kinds.has(eventKind(c))
  )
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduledCall[]>()
    for (const c of visible) {
      const k = dayKey(c.scheduledAt)
      const arr = m.get(k) ?? []
      arr.push(c)
      m.set(k, arr)
    }
    return m
  }, [visible])

  async function follow(id: string, val: boolean) {
    setFollowed((prev) => {
      const next = new Set(prev)
      if (val) next.add(id)
      else next.delete(id)
      return next
    })
    try {
      await setFollowCall(id, val)
    } catch {
      /* keep optimistic state */
    }
  }

  function toggleKind(k: EventKind) {
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const kindLabel: Record<EventKind, string> = {
    call: dict.calendar.kindCalls,
    report: dict.calendar.kindReports,
    webinar: dict.calendar.kindWebinars,
  }
  // hover context card uses the singular type name (design demo: "Investor call")
  const kindSingular: Record<EventKind, string> = {
    call: dict.calendar.ctxKindCall,
    report: dict.calendar.ctxKindReport,
    webinar: dict.calendar.ctxKindWebinar,
  }

  const year = month.getFullYear()
  const monthIdx = month.getMonth()
  const firstWeekday = new Date(year, monthIdx, 1).getDay()
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  const weekdays = Array.from({ length: 7 }, (_, i) => formatWeekday(new Date(2023, 0, 1 + i), locale)) // Jan 1 2023 = Sunday
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()

  return (
    // design calendar (line 265) is FULL WIDTH — padding only, no max-width column
    <div className="atscroll flex-1 overflow-y-auto px-11 py-9 pb-dock">
      <div className="w-full animate-fade-up">
        {/* header: title + market/mine toggle (design lines 266-272) */}
        <div className="mb-1.5 flex items-start justify-between">
          {/* founder round-4: system ("apple") headline font, as CD home renders it */}
          <h1 className="text-[30px] font-bold tracking-[-0.03em] text-ink">{dict.calendar.title}</h1>
          <div className="flex rounded-full bg-[#ECE9E2] p-[3px]">
            <button
              type="button"
              onClick={() => setMode('all')}
              className={cn(
                'rounded-full px-4 py-[7px] text-sm font-medium transition-colors',
                mode === 'all' ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink'
              )}
            >
              {dict.calendar.allCalls}
            </button>
            <button
              type="button"
              onClick={() => setMode('mine')}
              onDragOver={(e) => {
                e.preventDefault()
                setDropActive(true)
              }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDropActive(false)
                const id = e.dataTransfer.getData('text/plain')
                if (id) void follow(id, true)
              }}
              className={cn(
                'rounded-full px-4 py-[7px] text-sm font-medium transition-colors',
                mode === 'mine' ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink',
                dropActive && 'ring-2 ring-ink/40'
              )}
            >
              {dict.calendar.myCalendar}
            </button>
          </div>
        </div>

        {/* month nav + type-filter chips (design lines 274-291) */}
        <div className="mb-3 mt-[22px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMonth(new Date(year, monthIdx - 1, 1))}
              aria-label="Previous month"
              className="text-ink-muted transition-colors hover:text-ink"
            >
              <ChevronLeftIcon size={18} strokeWidth={1.7} className="rtl:rotate-180" />
            </button>
            <span className="text-[16px] font-semibold text-ink">{formatMonthYear(month, locale)}</span>
            <button
              type="button"
              onClick={() => setMonth(new Date(year, monthIdx + 1, 1))}
              aria-label="Next month"
              className="text-ink-muted transition-colors hover:text-ink"
            >
              <ChevronRightIcon size={18} strokeWidth={1.7} className="rtl:rotate-180" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* design chip order (line 281 demo data): Reports · Investor calls · Webinars */}
            {(['report', 'call', 'webinar'] as const).map((k) => {
              const Icon = KIND_ICON[k]
              const on = kinds.has(k)
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKind(k)}
                  className={cn(
                    'flex items-center gap-[7px] rounded-full border py-[5px] pe-2.5 ps-[11px] text-[12.5px] transition-colors',
                    on
                      ? 'border-[#E0DACE] bg-[#ECE9E2] font-semibold text-ink'
                      : 'border-[#E6E2DA] bg-transparent font-medium text-[#8A867C]'
                  )}
                >
                  <span className="flex" style={{ color: EVENT_KIND_META[k].accent }}>
                    <Icon size={13} />
                  </span>
                  {kindLabel[k]}
                  <span className={cn('flex', on ? 'text-ink' : 'text-[#B7B2A6]')}>
                    {on ? <CloseIcon size={12} strokeWidth={2} /> : <PlusIcon size={12} strokeWidth={2} />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* filter hint (design line 294) */}
        <div className="mb-3.5">
          <span className="text-[12px] text-[#9A968C]">{dict.calendar.filterHint}</span>
        </div>

        {/* grid (design lines 297-338): paper sheet; overflow VISIBLE so hover cards escape */}
        <div className="rounded-card border border-[#E6E2DA] bg-paper">
          <div className="grid grid-cols-7 border-b border-[#E6E2DA]">
            {weekdays.map((w) => (
              <div
                key={w}
                className="px-3 py-2.5 text-start text-[11px] uppercase tracking-[0.1em] text-[#9A968C]"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const k = day ? localKey(year, monthIdx, day) : `blank-${i}`
              const dayCalls = day ? (byDay.get(k) ?? []) : []
              const isToday =
                day != null &&
                year === today.getFullYear() &&
                monthIdx === today.getMonth() &&
                day === today.getDate()
              return (
                <div
                  key={k}
                  className="flex min-h-[104px] flex-col gap-[5px] border-b border-e border-[#ECE7DD] px-[9px] py-2"
                >
                  {day && (
                    <span
                      className={cn(
                        'self-start rounded-full px-[5px] py-px font-mono-num text-[12px]',
                        isToday ? 'bg-ink text-paper' : 'text-ink-faint'
                      )}
                    >
                      {day}
                    </span>
                  )}
                  {dayCalls.map((c) => {
                    const isFollowed = followed.has(c.id)
                    const isLive = c.status === 'live'
                    const kind = eventKind(c)
                    const Icon = KIND_ICON[kind]
                    const name = c.company ? companyDisplayName(c.company, locale) : ''
                    return (
                      // pill (design lines 312-333): kind icon · live dot · name · mono time · +/✓
                      <div
                        key={c.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                        className="cal-ev flex w-full cursor-grab items-center gap-[5px] rounded-md border border-[#E6E2DA] bg-white py-1 pe-[5px] ps-[6px]"
                      >
                        <span className="flex flex-none" style={{ color: EVENT_KIND_META[kind].accent }}>
                          <Icon size={12} />
                        </span>
                        {isLive && (
                          <span
                            className="h-[6px] w-[6px] flex-none rounded-full bg-live"
                            style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-start text-[11px] text-ink">
                          <span dir="auto">{name}</span>
                        </span>
                        <span className="flex-none font-mono-num text-[10px] text-[#8A867C]" dir="ltr">
                          {isLive ? dict.live.liveBadge : formatTime(c.scheduledAt, locale)}
                        </span>
                        <button
                          type="button"
                          onClick={() => follow(c.id, !isFollowed)}
                          title={isFollowed ? dict.calendar.inCalendar : dict.calendar.addToCalendar}
                          className={cn('flex flex-none', isFollowed ? 'text-ink' : 'text-[#B7B2A6]')}
                        >
                          {isFollowed ? (
                            <CheckIcon size={13} strokeWidth={2} />
                          ) : (
                            <PlusIcon size={13} strokeWidth={1.8} />
                          )}
                        </button>
                        {/* hover context card (design lines 327-332) */}
                        <div className="cal-ctx">
                          <div
                            className="mb-[5px] text-[9.5px] font-semibold uppercase tracking-[0.1em]"
                            style={{ color: EVENT_KIND_META[kind].accent }}
                          >
                            {kindSingular[kind]}
                          </div>
                          <div className="text-[11.5px] leading-[1.5] text-[#3A382F]" dir="auto">
                            {name} · {c.quarter} · {formatDate(c.scheduledAt, locale)} ·{' '}
                            {isLive ? dict.live.liveBadge : formatTime(c.scheduledAt, locale)}
                            {isFollowed ? ` · ${dict.calendar.inCalendar}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {mode === 'mine' && visible.length === 0 && (
          <p className="mt-6 text-center text-sm text-ink-faint">{dict.calendar.noFollowed}</p>
        )}
      </div>
    </div>
  )
}
