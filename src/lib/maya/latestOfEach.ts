import type { RemoteSource } from './filings'

// ─────────────────────────────────────────────────────────────────────────────
// "LATEST OF EACH" — the backfill depth, as one pure function.
//
// Founder decision 2026-08-13, option B, in his own words: *"I would like us to
// pay the least amount and for the shortest time possible … since we are building
// here an amazing demo"*. What that bought: the most recent quarterly report, the
// most recent annual report, and the presentations of the last 12 months — per
// company, for all 234. ≈ 55–70K pages, ≈ $5–8 of embeddings, once.
//
// He was offered a strict three-month window at $2–3 and did not take it, for a
// stated reason worth keeping next to the code: a three-month window misses most
// companies' ANNUAL report, which is the document analysts quote most.
//
// PURE, AND TAKING `now` AS AN ARGUMENT. Everything expensive downstream — MAYA
// requests, PDF extraction, embedding spend — is decided here, so this is the one
// part of the backfill that has to be provable without spending any of it. A
// function that read the wall clock could not be tested at the window edge, and a
// dry run and the real run that followed it could select different sets.
//
// DEEPENING LATER IS ADDITIVE (1 year / 3 years / 5 years, ≈ $19–39 at 3 years):
// a wider window through the same pipeline, not a different one. This function is
// where that change lands, and nothing else has to move.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 12 months, counted in DAYS.
 *
 * Not calendar months: a calendar-month cutoff is a wall-clock question, and every
 * wall-clock answer in this repo has to come from `lib/i18n/format.ts`, which is
 * the only file allowed to know what Israel time means (app.md, the Time laws).
 * A duration needs no zone at all, and the difference — one day, in a leap year,
 * on a demo-scoped backfill window — buys nothing worth a timezone bug.
 */
export const PRESENTATION_WINDOW_DAYS = 365

export type SelectLatestOptions = {
  /** The instant the window is measured back from. Explicit so a dry run and the
   *  real run that follows it cannot disagree. */
  now: string | Date
  /** Overridable for the deepening rung; defaults to the approved 12 months. */
  windowDays?: number
}

/**
 * Newest first, ties broken on the identity so the order is total.
 *
 * MAYA stamps batches of filings with one publication instant often enough that
 * this matters: without the tiebreak, "the latest quarterly" could come out
 * differently on a re-run, which would make the backfill non-idempotent — a second
 * run would ingest a DIFFERENT document and pay for it, while the first one stayed
 * in the corpus.
 */
export function newestFirst(a: RemoteSource, b: RemoteSource): number {
  if (a.publishedISO !== b.publishedISO) return a.publishedISO < b.publishedISO ? 1 : -1
  return b.mayaReportId - a.mayaReportId
}

/**
 * The approved set for ONE issuer, out of that issuer's already-fetched catalog.
 *
 * A company with no annual report — a recent listing, a foreign-track issuer whose
 * annual is filed under a code we do not admit — yields what it HAS. Returning a
 * quarterly in the annual's place, or refusing the company, would both be claims
 * about the catalog that the catalog does not support.
 */
export function selectLatestOfEach(sources: RemoteSource[], opts: SelectLatestOptions): RemoteSource[] {
  const windowDays = opts.windowDays ?? PRESENTATION_WINDOW_DAYS
  const nowMs = (opts.now instanceof Date ? opts.now : new Date(opts.now)).getTime()
  const cutoffMs = nowMs - windowDays * 86_400_000

  const byKind = (kind: RemoteSource['kind']) => sources.filter((s) => s.kind === kind).sort(newestFirst)

  const picked = [
    ...byKind('quarterly').slice(0, 1),
    ...byKind('annual').slice(0, 1),
    // EVERY presentation in the window, not the latest one: a company's Q1 deck and
    // its investor-day deck are different documents, and the founder's decision
    // named the window rather than a count.
    ...byKind('presentation').filter((s) => Date.parse(s.publishedISO) >= cutoffMs),
  ]

  return picked.sort(newestFirst)
}
