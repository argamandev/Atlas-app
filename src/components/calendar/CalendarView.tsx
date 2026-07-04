'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { companyDisplayName, type ScheduledCall } from '@/lib/api/types'
import { setFollowCall } from '@/lib/api/calls'
import { formatMonthYear, formatWeekday, formatTime } from '@/lib/i18n/format'
import { Logo } from '@/components/ds/Logo'
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon, PlusIcon } from '@/components/ds/icons'
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

export function CalendarView({ calls, followedIds }: { calls: ScheduledCall[]; followedIds: string[] }) {
  const { dict, locale } = useI18n()
  const [followed, setFollowed] = useState<Set<string>>(new Set(followedIds))
  const [mode, setMode] = useState<'all' | 'mine'>('all')
  const [dropActive, setDropActive] = useState(false)

  // default to the month of the earliest call (the seeded Q2 calls), else today
  const initialMonth = useMemo(() => {
    const first = calls.map((c) => new Date(c.scheduledAt)).sort((a, b) => a.getTime() - b.getTime())[0]
    const d = first ?? new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }, [calls])
  const [month, setMonth] = useState(initialMonth)

  const visible = mode === 'mine' ? calls.filter((c) => followed.has(c.id)) : calls
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
    <div className="atscroll flex-1 overflow-y-auto px-11 py-9 pb-dock">
      <div className="mx-auto w-full max-w-5xl animate-fade-up">
        {/* header: title + mode toggle (design lines 169-175) */}
        <div className="mb-1.5 flex items-start justify-between">
          <h1 className="text-[30px] font-bold tracking-[-0.03em] text-ink">{dict.calendar.title}</h1>
          <div className="flex rounded-full bg-subtle p-[3px]">
            <button
              type="button"
              onClick={() => setMode('all')}
              className={cn(
                'rounded-full px-4 py-[7px] text-sm font-medium transition-colors',
                mode === 'all' ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink'
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
                mode === 'mine' ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink',
                dropActive && 'ring-2 ring-ink/40'
              )}
            >
              {dict.calendar.myCalendar}
            </button>
          </div>
        </div>

        {/* month nav + drag hint (design lines 178-185) */}
        <div className="mb-3.5 mt-[22px] flex items-center justify-between">
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
          <span className="text-[12.5px] text-ink-faint">{dict.calendar.dragHint}</span>
        </div>

        {/* grid (design lines 187-212): paper sheet, hairline cells, mono day numbers */}
        <div className="overflow-hidden rounded-card border border-subtle-strong bg-paper">
          <div className="grid grid-cols-7 border-b border-subtle-strong">
            {weekdays.map((w) => (
              <div
                key={w}
                className="px-3 py-2.5 text-start text-xs uppercase tracking-[0.1em] text-ink-faint"
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
                  className="flex min-h-[104px] flex-col gap-[5px] border-b border-e border-hairline p-2"
                >
                  {day && (
                    <span
                      className={cn(
                        'self-start rounded-full px-[5px] py-px font-mono-num text-xs',
                        isToday ? 'bg-ink font-semibold text-white' : 'text-ink-faint'
                      )}
                    >
                      {day}
                    </span>
                  )}
                  {dayCalls.map((c) => {
                    const isFollowed = followed.has(c.id)
                    const isLive = c.status === 'live'
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                        className="group flex w-full cursor-grab items-center gap-1.5 rounded-md border border-subtle-strong bg-canvas px-1.5 py-1 transition-shadow hover:shadow-card"
                        title={c.company ? companyDisplayName(c.company, locale) : ''}
                      >
                        <Logo
                          src={c.company?.logoUrl}
                          name={c.company?.displayName ?? ''}
                          size={16}
                          className="rounded-[4px]"
                        />
                        {isLive && (
                          <span
                            className="h-1.5 w-1.5 flex-none rounded-full bg-live"
                            style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-start text-[11px] text-ink">
                          <span dir="auto">{c.company ? companyDisplayName(c.company, locale) : ''}</span>
                        </span>
                        {isLive ? (
                          <span className="flex-none text-[10px] font-semibold tracking-[0.03em] text-live">
                            {dict.live.liveBadge}
                          </span>
                        ) : (
                          <span className="flex-none font-mono-num text-[10px] text-ink-faint" dir="ltr">
                            {formatTime(c.scheduledAt, locale)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => follow(c.id, !isFollowed)}
                          aria-label={isFollowed ? dict.common.remove : dict.common.add}
                          className={cn(
                            'h-4 w-4 shrink-0 place-items-center rounded-full',
                            isFollowed ? 'grid bg-ink text-white' : 'hidden text-ink-faint group-hover:grid'
                          )}
                        >
                          {isFollowed ? <CheckIcon size={11} /> : <PlusIcon size={11} />}
                        </button>
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
