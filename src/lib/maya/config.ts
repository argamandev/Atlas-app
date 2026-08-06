// MAYA connection constants. No secrets here — the key is read from the
// environment inside `client.ts`, server-side only.
//
// Every value below was verified against the live API on 2026-08-06 rather than
// taken from a document; `docs/MAYA-API.md` records the evidence.

/**
 * THE BASE URL, AND THE REASON THIS FILE EXISTS.
 *
 * Read off the portal's own `Servers` dropdown. Two earlier sessions probed
 * seven hostnames — `openapigw.tase.co.il/tase/prod` among them, which is
 * TASE's published base for its OTHER products — and concluded the key was
 * unapproved. Every one of those probes reached an Imperva 503 and therefore
 * said nothing about the key at all. A base URL is configuration, and
 * configuration is read from the system that issues it, never deduced.
 */
export const MAYA_BASE_URL = 'https://datawise.tase.co.il'

/** The portal's app page states this: API Key Auth, key name `apikey`. Not a bearer token. */
export const MAYA_KEY_HEADER = 'apikey'

/**
 * MANDATORY, AND NOT A LOCALE PREFERENCE. The `en-US` catalog returns
 * `title: null` on every row — the English feed has no titles. Hebrew carries
 * the real ones ("דוח תקופתי ושנתי לשנת 2024"). Sending `en-US` would leave
 * Atlas synthesising labels the issuer never wrote.
 */
export const MAYA_LANGUAGE = 'he-IL'

/** P99 measured at ~330ms; this is generous enough to absorb a bad minute. */
export const MAYA_TIMEOUT_MS = 12_000

/** `"The date range cannot exceed 1 year."` — a 380-day window is a 400. */
export const MAYA_MAX_RANGE_DAYS = 365

/**
 * The published limit is 10 requests / 2 seconds, shared by our whole key —
 * every user and every consumer. Windowed calls are therefore issued
 * sequentially with this pause between them rather than fanned out.
 */
export const MAYA_MIN_REQUEST_GAP_MS = 220

/** Tigbur's annual report is 2.3MB; this is a sanity bound, not a real constraint. */
export const MAYA_MAX_PDF_BYTES = 40_000_000

/** The disclosure catalog for one issuer. */
export const PATH_DISCLOSURES_BY_ISSUER = '/api/v2/market-announcements/companies-disclosures/by-issuer'

/** The reporting schedule — consumers ③ (calendar) and ④ (live calls). */
export const PATH_SCHEDULE_BY_YEAR = '/api/v2/market-announcements/financial-report-schedule/by-report-year'
export const PATH_SCHEDULE_BY_DATE = '/api/v2/market-announcements/financial-report-schedule/by-schedule-date'
