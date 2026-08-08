// Calendar event kinds — the design's three event types (investor calls, report
// publications, webinars) with their probed accent colors. Real data today is
// investor calls only; report/webinar rows arrive with future feeds and are
// recognized via the optional `kind` hint so the filter chips already work.

export const EVENT_KINDS = ['call', 'report', 'webinar'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const EVENT_KIND_META: Record<
  EventKind,
  { accent: string; labelKey: 'investorCalls' | 'reports' | 'webinars' }
> = {
  call: { accent: '#3A3833', labelKey: 'investorCalls' },
  report: { accent: '#6E7B63', labelKey: 'reports' },
  webinar: { accent: '#67788A', labelKey: 'webinars' },
}

// Accepts any event-ish object: real ScheduledCall rows (no kind field yet → 'call')
// and future feed rows carrying an explicit kind hint.
export function eventKind(e: object): EventKind {
  const kind = (e as { kind?: string | null }).kind
  return kind === 'report' || kind === 'webinar' ? kind : 'call'
}

/**
 * The singular, human name of an event kind.
 *
 * ONE PLACE, because three surfaces render this label and one of them got it
 * wrong: Home hardcoded "investor call" for every upcoming row, so 99 report
 * publication dates each announced an investor call that nobody had scheduled
 * (found eyes-on 2026-08-09). A per-surface string is a per-surface chance to
 * describe an event as something it is not.
 *
 * Takes the dictionary slice rather than the whole Dictionary so this module
 * stays dependency-free and usable from both server and client components.
 */
export function kindLabel(
  kind: EventKind,
  d: { ctxKindCall: string; ctxKindReport: string; ctxKindWebinar: string }
): string {
  if (kind === 'report') return d.ctxKindReport
  if (kind === 'webinar') return d.ctxKindWebinar
  return d.ctxKindCall
}
