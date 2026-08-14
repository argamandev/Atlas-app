import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOCUMENT_EVENT_IDS,
  SCHEDULE_EVENT_IDS,
  docTypeFor,
  filingKind,
  periodFor,
  isAnnouncement,
  isDocumentEvent,
  isScheduleEvent,
} from './events'

test('the whitelist is exactly the five analyst-relevant kinds', () => {
  assert.deepEqual(
    [...DOCUMENT_EVENT_IDS].sort((a, b) => a - b),
    [101, 104, 105, 106, 270]
  )
})

// THE LINE THE CALENDAR AND LIVE-CALL CONSUMERS WILL READ. A conference call is
// news about when something happens, not a document to put on a shelf.
test('a conference call is schedule, never a document', () => {
  assert.equal(isDocumentEvent([233]), false)
  assert.equal(isScheduleEvent([233]), true)
  assert.equal(docTypeFor([233]), null)
  assert.ok(SCHEDULE_EVENT_IDS.has(233))
})

// A NOTICE THAT A REPORT IS COMING IS NOT THE REPORT. It carries the report's
// OWN event id — that is how it says which report it is announcing — so the
// "any whitelisted event" rule filed it as that report. Measured 2026-08-09
// across 20 issuers / 2022-2026: 80 of 814 offered filings, every one a
// scheduling notice, none of them a presentation.
test('a release-date notice is an announcement, never the document', () => {
  assert.equal(isAnnouncement([104, 113, 233]), true) // אאורה #1741205
  assert.equal(isAnnouncement([101, 113]), true)
  assert.equal(isDocumentEvent([104, 113]), false)
  assert.equal(docTypeFor([104, 113]), 'report') // classification is unchanged; admission is not
})

test('the report itself and its deck are still documents', () => {
  assert.equal(isAnnouncement([104]), false)
  assert.equal(isAnnouncement([104, 270]), false) // 0 of 295 measured decks carry 113
  assert.equal(isDocumentEvent([104]), true)
  assert.equal(isDocumentEvent([104, 270]), true)
})

test('a presentation wins over the report it accompanies', () => {
  assert.equal(docTypeFor([104, 270]), 'slides')
  assert.equal(docTypeFor([101, 270]), 'slides')
  assert.equal(docTypeFor([101]), 'report')
  assert.equal(docTypeFor([106]), 'report')
})

test('anything unrecognised is excluded rather than guessed at', () => {
  assert.equal(docTypeFor([114]), null) // מצבת התחיבויות
  assert.equal(docTypeFor([282]), null) // תיקון טעות סופר
  assert.equal(docTypeFor([]), null)
})

// THE YEAR COMES FROM THE TITLE WHEN THE ISSUER STATED ONE, because the case
// that matters is precisely the one where publication year != report year.
test('the period is read from the Hebrew title, falling back to the publication year', () => {
  assert.equal(periodFor([101], 'דוח תקופתי ושנתי לשנת 2024', '2025-03-30T00:00:00'), 'FY 2024')
  assert.equal(
    periodFor([104, 270], 'מצגת משקיעים  - דוחות כספיים לרבעון הראשון של שנת 2026', '2026-05-27T00:00:00'),
    'Q1 2026'
  )
  assert.equal(periodFor([106], null, '2025-11-30T00:00:00'), 'Q3 2025')
  assert.equal(periodFor([105], 'דוח רבעון 2/חצי שנתי לשנת 2025', '2025-08-27T00:00:00'), 'Q2 2025')
})

// ── filingKind — the class the A5 backfill selects "latest of each" on ────────
//
// THE RULE THIS ENCODES IS A MEASURED ONE (ticket 17's probe, 2026-08-13): detect
// a real financial statement by event ids 101/104/105/106, NEVER by the presence
// of an `.xbrl` attachment. ICL, dual-listed, files 61 disclosures with zero xbrl
// instances because foreign-track issuers have no ISA XBRL at all — an
// attachment-based rule would have dropped every one of them out of the corpus
// while reporting success.

test('the three approved classes are read off the event ids', () => {
  assert.equal(filingKind([101]), 'annual')
  assert.equal(filingKind([104]), 'quarterly')
  assert.equal(filingKind([105]), 'quarterly')
  assert.equal(filingKind([106]), 'quarterly')
  assert.equal(filingKind([270]), 'presentation')
})

test('a deck tagged with its period code is a PRESENTATION, not that period’s report', () => {
  // `104 + 270` is the Q1 deck. Counting it as the Q1 report would let a slide
  // deck displace the actual statements as "the latest quarterly" — and
  // docTypeFor already resolves the same collision the same way.
  assert.equal(filingKind([104, 270]), 'presentation')
  assert.equal(docTypeFor([104, 270]), 'slides')
  assert.equal(filingKind([101, 270]), 'presentation')
})

test('a scheduling notice is not the report it announces', () => {
  // 113 always carries the event id of the report it is announcing — that is how
  // it says WHICH report — so an id-membership rule admits it as that report.
  assert.equal(filingKind([104, 113]), null)
  assert.equal(filingKind([101, 113]), null)
})

test('anything outside the three classes is null, never guessed', () => {
  assert.equal(filingKind([114]), null) // מצבת התחיבויות
  assert.equal(filingKind([231]), null) // the 6-K/8-K foreign-track code
  assert.equal(filingKind([]), null)
})

test('past isDocumentEvent, filingKind and docTypeFor admit exactly the same filings', () => {
  // toRemoteSources runs the three in that order — isDocumentEvent, then docTypeFor,
  // then filingKind — and drops the row if any says no. So the property is not
  // "these two functions agree everywhere": docTypeFor deliberately does NOT know
  // about announcements, because isDocumentEvent owns that question one line
  // earlier. The first version of this test asserted the unconditional version and
  // failed on [101,113], which is docTypeFor answering a question nobody asked it.
  //
  // What must hold is that neither of the last two silently discards something the
  // other admitted — a row dropped there is a document missing from the corpus with
  // nothing anywhere saying why.
  const vocabulary = [[101], [104], [105], [106], [270], [104, 270], [101, 113], [114], [231], []]
  const admitted = vocabulary.filter(isDocumentEvent)
  assert.deepEqual(admitted, [[101], [104], [105], [106], [270], [104, 270]])
  for (const ids of admitted) {
    assert.equal(filingKind(ids) === null, docTypeFor(ids) === null, `disagreed on [${ids.join(',')}]`)
  }
})

// ── the deck-period fix (slice A5, founder-approved 2026-08-14) ───────────────

test('a deck with no period code is labelled by its publication DATE', () => {
  // The 207-collision fix. A bare `270 מצגת` used to return just the year, so
  // every deck a company filed in one year keyed identically on
  // (company_id, quarter, doc_type) and silently overwrote its siblings.
  assert.equal(periodFor([270], 'מצגת משקיעים', '2026-08-13T20:11:04'), '13.08.2026')
  assert.equal(periodFor([270], 'מצגת משקיעים-נובמבר 2025', '2025-11-20T09:00:00'), '20.11.2025')
})

test('two decks from one year no longer share a period — the whole point', () => {
  const a = periodFor([270], 'מצגת משקיעים - רבעון ראשון 2026', '2026-03-19T09:00:00')
  const b = periodFor([270], 'מצגת משקיעים - רבעון 3 2026', '2026-11-12T09:00:00')
  assert.notEqual(a, b)
})

test('a deck that DOES carry a period code is untouched — still Q1 2026', () => {
  // `104 + 270` is the Q1 deck and already had a distinct period. Only the
  // code-less decks change, so this fix cannot disturb a label that worked.
  assert.equal(
    periodFor([104, 270], 'מצגת משקיעים  - דוחות כספיים לרבעון הראשון של שנת 2026', '2026-05-27T00:00:00'),
    'Q1 2026'
  )
})

test('the fallback year is ISRAEL time, closing the listed UTC leak', () => {
  // 2026-01-01 00:30 Israel is 2025-12-31 22:30 UTC. `getUTCFullYear` labelled
  // this filing 2025 — one of the two UTC leaks in docs/open-findings.md.
  assert.equal(periodFor([106], null, '2026-01-01T00:30:00'), 'Q3 2026')
  assert.equal(periodFor([270], null, '2026-01-01T00:30:00'), '01.01.2026')
})

test('an unparseable publication date yields a weaker label, never an exception', () => {
  // periodFor runs on a RAW MAYA field on a live request path. israelDayKey throws
  // RangeError on an unparseable string, so one malformed feed row would have 500'd
  // GET /api/companies/[id]/filings — where the old getUTCFullYear merely produced a
  // harmless NaN. A descriptive label is never worth an outage.
  for (const bad of ['', 'not-a-date', '0000-99-99T99:99:99']) {
    assert.doesNotThrow(() => periodFor([270], 'מצגת משקיעים 2025', bad))
    assert.doesNotThrow(() => periodFor([104], null, bad))
  }
  // and it degrades to the best thing it still knows
  assert.equal(periodFor([270], 'מצגת משקיעים 2025', 'not-a-date'), '2025')
  assert.equal(periodFor([104], 'דוח רבעון 1 לשנת 2026', 'not-a-date'), 'Q1 2026')
  assert.equal(periodFor([270], null, 'not-a-date'), '')
})
