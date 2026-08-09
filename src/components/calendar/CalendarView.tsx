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
import { Logo } from '@/components/ds/Logo'
import {
  eventKind,
  kindLabel,
  kindFill,
  calendarEmptyState,
  EVENT_KINDS,
  EVENT_KIND_META,
  type EventKind,
} from '@/lib/calendar/event-meta'
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

  // OPEN ON THIS MONTH. This used to open on the month of the EARLIEST call,
  // which was harmless with four seeded rows and wrong the moment real data
  // landed: the feed starts in January 2025, so the calendar would have opened
  // nineteen months in the past and looked empty.
  const initialMonth = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }, [])
  const [month, setMonth] = useState(initialMonth)

  // TWO SETS, ON PURPOSE. `inScope` is everything the current MODE covers before
  // the kind chips are applied; `visible` is what survives them. The difference
  // between their per-month counts is the only honest way to tell "nothing is
  // scheduled" apart from "the filter is hiding it" — see `calendarEmptyState`,
  // where deciding that from the chip sets instead cost two review rounds.
  const inScope = mode === 'mine' ? calls.filter((c) => followed.has(c.id)) : calls
  const visible = inScope.filter((c) => kinds.has(eventKind(c)))

  // ONLY OFFER A FILTER THAT CAN MATCH SOMETHING. The design has three chips;
  // the data has two kinds today (webinars are a later slice, founder decision
  // 2026-08-09). A chip for a kind with no rows is a claim that Atlas tracks
  // something it does not, and clicking it just empties the grid.
  const presentKinds = useMemo(() => new Set(calls.map((c) => eventKind(c))), [calls])

  const monthCount = useMemo(
    () =>
      visible.filter((c) => {
        const d = new Date(c.scheduledAt)
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
      }).length,
    [visible, month]
  )

  // The same month window over `inScope`, i.e. before the kind chips. Counted
  // here rather than derived, so it cannot drift from `monthCount` above.
  const monthTotal = useMemo(
    () =>
      inScope.filter((c) => {
        const d = new Date(c.scheduledAt)
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
      }).length,
    [inScope, month]
  )

  // ONE DECISION, MADE ONCE, TESTABLE. See `calendarEmptyState` for why this is
  // not a condition written inline at the render site any more — and why it is
  // fed these two counts rather than the chip sets.
  const emptyState = useMemo(
    () => calendarEmptyState({ visibleCount: monthCount, monthTotal }),
    [monthCount, monthTotal]
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
      // REVERT, do not keep the optimistic star. Swallowing this was survivable while
      // /api/calls/follow fell back to a shared identity and always succeeded; that fallback was
      // removed on 2026-08-03, so a 401 is now reachable and a kept star would claim the call is
      // followed when the server recorded nothing.
      setFollowed((prev) => {
        const next = new Set(prev)
        if (val) next.delete(id)
        else next.add(id)
        return next
      })
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

  const chipLabel: Record<EventKind, string> = {
    call: dict.calendar.kindCalls,
    report: dict.calendar.kindReports,
    webinar: dict.calendar.kindWebinars,
  }
  // hover context card uses the singular type name (design demo: "Investor call").
  // Through the shared `kindLabel` so Home, the company page and this card cannot
  // drift — Home held its own hardcoded string and called every report an
  // investor call until 2026-08-09.

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
          {/* Harvey headlines: Newsreader 500, -0.02em (design harvey headFont) */}
          <h1 className="font-display text-[30px] font-medium tracking-[-0.02em] text-ink">
            {dict.calendar.title}
          </h1>
          <div className="flex rounded-full bg-panel p-[3px]">
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
            {(['report', 'call', 'webinar'] as const)
              .filter((k) => presentKinds.has(k))
              .map((k) => {
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
                        ? 'border-[#D5D5D5] font-semibold text-ink'
                        : 'border-[#DEDEDE] bg-transparent font-medium text-[#767676]'
                    )}
                    // An ACTIVE chip wears its kind's own fill, so the filter row
                    // doubles as the legend for the tints below it. An inactive
                    // chip stays plain: a filter that is off should not look like
                    // it is colouring anything.
                    style={on ? { background: kindFill(k) } : undefined}
                  >
                    <span className="flex" style={{ color: EVENT_KIND_META[k].accent }}>
                      <Icon size={13} />
                    </span>
                    {chipLabel[k]}
                    <span className={cn('flex', on ? 'text-ink' : 'text-[#ADADAD]')}>
                      {on ? <CloseIcon size={12} strokeWidth={2} /> : <PlusIcon size={12} strokeWidth={2} />}
                    </span>
                  </button>
                )
              })}
          </div>
        </div>

        {/* filter hint (design line 294) */}
        <div className="mb-3.5">
          <span className="text-[12px] text-[#8A8A8A]">{dict.calendar.filterHint}</span>
        </div>

        {/* grid (design lines 297-338): paper sheet; overflow VISIBLE so hover cards escape */}
        <div className="rounded-card border border-[#DEDEDE] bg-paper">
          <div className="grid grid-cols-7 border-b border-[#DEDEDE]">
            {weekdays.map((w) => (
              <div
                key={w}
                className="px-3 py-2.5 text-start text-[11px] uppercase tracking-[0.1em] text-[#8A8A8A]"
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
                  className="flex min-h-[104px] flex-col gap-[5px] border-b border-e border-[#EAEAEA] px-[9px] py-2"
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
                        // Tinted per kind (founder 2026-08-09: calls and reports
                        // were too alike to separate at a glance). The icon is
                        // still there and still carries the accent — colour is a
                        // SECOND signal, not the only one, so this stays legible
                        // to anyone who cannot separate blue from green.
                        className="cal-ev flex w-full cursor-grab items-center gap-[5px] rounded-md border border-[#DEDEDE] py-1 pe-[5px] ps-[6px]"
                        style={{ background: kindFill(kind) }}
                      >
                        {/* KIND FIRST, THEN IDENTITY. The icon stays: it is the
                            only NON-COLOUR signal of what an event is, and the
                            tint behind it is deliberately faint. Replacing it
                            with the logo would leave kind encoded in colour
                            alone, which is the thing the previous commit
                            explicitly refused to do. */}
                        <span className="flex flex-none" style={{ color: EVENT_KIND_META[kind].accent }}>
                          <Icon size={12} />
                        </span>
                        {/* 16px, AND THE SIZE IS MEASURED RATHER THAN GUESSED.
                            The pill is 27px tall: 8px of padding around a ~19px
                            content box set by the 11px line. So anything up to
                            ~17px costs NOTHING in height — my first attempt used
                            14px and left 3px unused for no reason, then I removed
                            the logo entirely calling it illegible.
                            That verdict was overturned by the founder, who had
                            watched it render: I had judged it on קומפיוגן and
                            פרודלים, two of the weakest wordmarks in the set, and
                            generalised from them. Marks with colour or shape —
                            Perion, Camtek, Scodix, Nayax — are identifiable at
                            this size, which is the whole job here: an investor
                            spotting a company without reading.
                            Wordmark-only logos DO stay faint at 16px. That is a
                            property of an 80x80 picture of a name, not something
                            a larger square fixes without costing rows. The week
                            view is where they get real room. */}
                        <Logo src={c.company?.logoUrl} name={name} size={16} className="rounded-[3px]" />
                        {isLive && (
                          <span
                            className="h-[6px] w-[6px] flex-none rounded-full bg-live"
                            style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-start text-[11px] text-ink">
                          <span dir="auto">{name}</span>
                        </span>
                        {/* A CLOCK ONLY WHEN ONE WAS PUBLISHED. Report dates carry no
                            time at all (0 of 472 rows), and `scheduledAt` holds midnight
                            Israel time for them purely as a bucket — printing it would
                            invent a 00:00 appointment for every report on the calendar. */}
                        {(isLive || c.timeKnown) && (
                          <span className="flex-none font-mono-num text-[10px] text-[#767676]" dir="ltr">
                            {isLive ? dict.live.liveBadge : formatTime(c.scheduledAt, locale)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => follow(c.id, !isFollowed)}
                          title={isFollowed ? dict.calendar.inCalendar : dict.calendar.addToCalendar}
                          className={cn('flex flex-none', isFollowed ? 'text-ink' : 'text-[#ADADAD]')}
                        >
                          {isFollowed ? (
                            <CheckIcon size={13} strokeWidth={2} />
                          ) : (
                            <PlusIcon size={13} strokeWidth={1.8} />
                          )}
                        </button>
                        {/* hover context card (design lines 327-332) */}
                        <div className="cal-ctx">
                          <div className="mb-[5px] flex items-center gap-2">
                            {/* 28px — the smallest size at which these wordmarks
                                are actually readable. The pill above cannot
                                spare it; this card can. */}
                            <Logo src={c.company?.logoUrl} name={name} size={28} className="rounded-[5px]" />
                            <span
                              className="text-[9.5px] font-semibold uppercase tracking-[0.1em]"
                              style={{ color: EVENT_KIND_META[kind].accent }}
                            >
                              {kindLabel(kind, dict.calendar)}
                            </span>
                          </div>
                          {/* EACH RUN GETS ITS OWN <bdi>, direction on the container.
                              This line mixes a Hebrew company name with Latin quarter,
                              date and time runs; `dir="auto"` on the whole line resolves
                              from its FIRST strong character, so one Hebrew name flipped
                              every trailing Latin run's punctuation to the far side.
                              Third filing of this defect — rules/app.md. */}
                          <div className="text-[11.5px] leading-[1.5] text-[#2A2A2A]">
                            {[
                              name,
                              c.quarter,
                              formatDate(c.scheduledAt, locale),
                              isLive
                                ? dict.live.liveBadge
                                : c.timeKnown
                                  ? formatTime(c.scheduledAt, locale)
                                  : null,
                              isFollowed ? dict.calendar.inCalendar : null,
                            ]
                              .filter(Boolean)
                              .map((part, idx) => (
                                <span key={idx}>
                                  {idx > 0 ? ' · ' : ''}
                                  <bdi>{part}</bdi>
                                </span>
                              ))}
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

        {/* ONE PRECEDENCE CHAIN, BOTH MODES. An empty grid is ambiguous between
            "you follow nothing", "nothing is scheduled" and "your filter hid it",
            and exactly one of those is true at a time — so they are answered in
            order rather than as independent conditions that can both fire or
            both stay silent.
            ⚠ TWO ROUNDS OF HISTORY, because the next person to touch this will be
            tempted by the same shortcuts. Round 1 gated on `kinds.size > 0`,
            which is PERMANENTLY true (the set is seeded with all three kinds and
            `webinar` has no rows, so it draws no chip and can never be switched
            off) — both visible chips off printed "nothing scheduled" over 224 real
            events. Round 2 moved the decision into `calendarEmptyState` (right)
            and fed it the chip sets (wrong), which still lied whenever a month's
            events were ALL of the filtered-away kind. It now takes two counts.
            ⚠ AND `noFollowed` NO LONGER KEYS ON `visible`: that was kind-filtered,
            so switching the chips off told a user who follows calls that they
            follow none. It keys on `inScope`, which is the actual claim. */}
        {mode === 'mine' && inScope.length === 0 ? (
          <p className="mt-6 text-center text-sm text-ink-faint">{dict.calendar.noFollowed}</p>
        ) : emptyState === 'no-events' ? (
          <p className="mt-6 text-center text-sm text-ink-faint">{dict.calendar.noEventsThisMonth}</p>
        ) : emptyState === 'filtered-away' ? (
          <p className="mt-6 text-center text-sm text-ink-faint">{dict.calendar.monthHiddenByFilter}</p>
        ) : null}
      </div>
    </div>
  )
}
