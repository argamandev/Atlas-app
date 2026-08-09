// Calendar event kinds — the design's three event types (investor calls, report
// publications, webinars).
//
// ⚠ THE COMMENT HERE USED TO SAY "real data today is investor calls only" and
// went stale the day the MAYA sync landed: reports are now the MAJORITY of rows
// (99 of the 184 upcoming). Webinars are still unpopulated.

export const EVENT_KINDS = ['call', 'report', 'webinar'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

/**
 * ONE PLACE FOR A KIND'S COLOUR, for the same reason `kindLabel` is one place
 * for its name: the chip, the pill, and the hover card all draw it, and three
 * copies is three chances to say a report is a call.
 *
 * `accent` is the icon/label colour. `tint` is the pill's fill — a white→tint
 * vertical gradient, kept very light because these sit at 11px on a paper sheet
 * and a saturated fill would drown the company name, which is the thing being
 * read.
 *
 * COLOURS CHANGED 2026-08-09 ON THE FOUNDER'S CALL. He could not tell calls
 * from reports at a glance, which is fair: the original accents were charcoal
 * (#3A3833) and sage (#6E7B63), two dark neutrals differing mostly in warmth,
 * and the only other signal was a 12px icon. Blue = call, green = report, per
 * his ask.
 *
 * WEBINAR MOVED TO AMBER, WHICH HE DID NOT ASK FOR — and the reason is that its
 * old #67788A is a slate BLUE. Giving calls the blue he wanted while leaving
 * webinars blue would have moved the confusion rather than removed it, and it
 * would have landed silently, since zero webinar rows exist to look at today.
 * Three kinds need three hues.
 */
export const EVENT_KIND_META: Record<
  EventKind,
  { accent: string; tint: string; labelKey: 'investorCalls' | 'reports' | 'webinars' }
> = {
  call: { accent: '#2F5D9E', tint: '#EFF5FC', labelKey: 'investorCalls' },
  report: { accent: '#4A7C59', tint: '#EFF6F1', labelKey: 'reports' },
  webinar: { accent: '#8A5A2B', tint: '#FAF3EA', labelKey: 'webinars' },
}

/**
 * The pill fill for a kind.
 *
 * `to bottom`, never `to right`: a horizontal gradient reads as a direction, and
 * this app renders the same calendar in LTR and RTL. Vertical is the only axis
 * that means the same thing in both.
 */
export function kindFill(kind: EventKind): string {
  return `linear-gradient(to bottom, #FFFFFF 0%, ${EVENT_KIND_META[kind].tint} 100%)`
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
