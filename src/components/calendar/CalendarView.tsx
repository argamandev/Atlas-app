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
    <div className="app-scroll flex-1 overflow-y-auto px-8 py-6 pb-dock">
      <div className="mx-auto w-full max-w-4xl animate-fade-up">
        {/* header: title + mode toggle */}
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{dict.calendar.title}</h1>
          <div className="flex items-center gap-1 rounded-full bg-panel p-1">
            <button
              type="button"
              onClick={() => setMode('all')}
              className={cn('rounded-full px-3.5 py-1.5 text-sm transition-colors', mode === 'all' ? 'bg-canvas font-medium text-ink shadow-card' : 'text-ink-muted hover:text-ink')}
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
                'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                mode === 'mine' ? 'bg-canvas font-medium text-ink shadow-card' : 'text-ink-muted hover:text-ink',
                dropActive && 'ring-2 ring-ink/40',
              )}
            >
              {dict.calendar.myCalendar}
            </button>
          </div>
        </div>

        {/* month nav */}
        <div className="mb-3 flex items-center gap-3">
          <button type="button" onClick={() => setMonth(new Date(year, monthIdx - 1, 1))} aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-subtle hover:text-ink">
            <ChevronLeftIcon size={18} />
          </button>
          <span className="min-w-[160px] text-center text-sm font-semibold text-ink">{formatMonthYear(month, locale)}</span>
          <button type="button" onClick={() => setMonth(new Date(year, monthIdx + 1, 1))} aria-label="Next month" className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-subtle hover:text-ink">
            <ChevronRightIcon size={18} />
          </button>
          <span className="ms-auto text-xs text-ink-faint">{dict.calendar.dragHint}</span>
        </div>

        {/* grid */}
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card bg-hairline">
          {weekdays.map((w) => (
            <div key={w} className="bg-panel py-2 text-center text-xs font-medium text-ink-faint">
              {w}
            </div>
          ))}
          {cells.map((day, i) => {
            const k = day ? localKey(year, monthIdx, day) : `blank-${i}`
            const dayCalls = day ? byDay.get(k) ?? [] : []
            const isToday =
              day != null && year === today.getFullYear() && monthIdx === today.getMonth() && day === today.getDate()
            return (
              <div key={k} className={cn('min-h-[96px] bg-canvas p-1.5', isToday && 'ring-1 ring-inset ring-ink/30')}>
                {day && (
                  <div className="mb-1 flex px-0.5">
                    <span
                      className={cn(
                        'grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-xs tabular-nums',
                        isToday ? 'bg-ink font-semibold text-white' : 'text-ink-faint',
                      )}
                    >
                      {day}
                    </span>
                  </div>
                )}
                <div className="space-y-1">
                  {dayCalls.map((c) => {
                    const isFollowed = followed.has(c.id)
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                        className="group flex cursor-grab items-center gap-1.5 rounded-md bg-canvas px-1.5 py-1 shadow-card ring-1 ring-hairline/60 transition-shadow hover:shadow-popover"
                        title={c.company ? companyDisplayName(c.company, locale) : ''}
                      >
                        <Logo src={c.company?.logoUrl} name={c.company?.displayName ?? ''} size={18} />
                        <span className="min-w-0 flex-1 truncate text-xs text-ink">
                          {c.company ? companyDisplayName(c.company, locale) : ''}
                        </span>
                        <span className="shrink-0 text-2xs text-ink-faint" dir="ltr">
                          {formatTime(c.scheduledAt, locale)}
                        </span>
                        <button
                          type="button"
                          onClick={() => follow(c.id, !isFollowed)}
                          aria-label={isFollowed ? dict.common.remove : dict.common.add}
                          className={cn(
                            'grid h-4 w-4 shrink-0 place-items-center rounded-full',
                            isFollowed ? 'bg-ink text-white' : 'text-ink-faint opacity-0 group-hover:opacity-100',
                          )}
                        >
                          {isFollowed ? <CheckIcon size={11} /> : <PlusIcon size={11} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {mode === 'mine' && visible.length === 0 && (
          <p className="mt-6 text-center text-sm text-ink-faint">{dict.calendar.noFollowed}</p>
        )}
      </div>
    </div>
  )
}
