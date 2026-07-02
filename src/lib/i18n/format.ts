import type { Locale } from './config'

// Locale-aware formatting. Numbers, dates and times must read naturally in both
// languages (brief §2). Intl is available on both server and client.

const localeTag: Record<Locale, string> = { en: 'en-US', he: 'he-IL' }

export type GreetingKey = 'morning' | 'afternoon' | 'evening'

export function greetingKey(date = new Date()): GreetingKey {
  const h = date.getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export function formatTime(d: Date | string, locale: Locale): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat(localeTag[locale], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDate(
  d: Date | string,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat(localeTag[locale], opts).format(date)
}

export function formatMonthYear(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag[locale], { month: 'long', year: 'numeric' }).format(d)
}

export function formatWeekday(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag[locale], { weekday: 'short' }).format(d)
}

// Compact relative time for the activity feed ("2h", "1d"). Numbers stay LTR.
export function relativeShort(d: Date | string, now = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diffMs = now.getTime() - date.getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.round(hr / 24)
  return `${day}d`
}

// Locale-aware "starts in N days" pill for upcoming calls. numeric:'auto' gives the
// natural "tomorrow"/"מחר", "today"/"היום" forms; otherwise "in 4 days"/"בעוד 4 ימים".
export function formatRelativeDays(d: Date | string, locale: Locale, now = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000)
  return new Intl.RelativeTimeFormat(localeTag[locale], { numeric: 'auto' }).format(days, 'day')
}

// mm:ss / h:mm:ss for the media player + transcript timestamps.
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  const mm = String(mins).padStart(hrs > 0 ? 2 : 1, '0')
  const ss = String(secs).padStart(2, '0')
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`
}
