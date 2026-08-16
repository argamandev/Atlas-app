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

// ── a period that had not ended yet (founder-reported, דנאל, 2026-08-16) ──────
//
// THE FOUNDER'S WORDS: the documents tab showed 2026's latest report as ANNUAL
// when the company had only reported a quarter. There is no annual 2026 report —
// 2026 was not over — and the row underneath it was a slide deck.
//
// Every fixture below is a REAL row from the live MAYA feed for issuer 314,
// read on 2026-08-16, not a constructed shape.

test('a DECK is never labelled with a period that had not ended when it was published', () => {
  // `מצגת שוק ההון- מאי 2026`, tagged [101 דוח תקופתי ושנתי, 270 מצגת], published
  // 2026-05-19. The annual code met the "2026" of a MONTH NAME and produced
  // `FY 2026` — which `parsePeriod` accepted, `FY` sorted to the top of 2026, and
  // the tab rendered as **שנתי 2026**. An annual report for a year with seven
  // months left in it is not a thing that can exist.
  const deck = periodFor([101, 270], 'מצגת שוק ההון- מאי 2026', '2026-05-19T16:47:08.093')
  assert.notEqual(deck, 'FY 2026')
  assert.equal(deck, '19.05.2026')

  // The same shape at nine other issuers, from the 233-issuer sweep: a March deck
  // named by its month, carrying the annual code of the report it accompanies.
  assert.equal(periodFor([101, 270], 'מצגת משקיעים - מרץ 2026', '2026-03-23T09:00:00'), '23.03.2026')
  assert.equal(periodFor([101, 270], 'מצגת לשוק ההון - מרס 2025', '2025-03-27T09:00:00'), '27.03.2025')
})

test('a REPORT keeps its period even when the same test would refuse it', () => {
  // THE RULE IS ASKED OF DECKS ONLY, and this is the case that bought that limit.
  // פרוספקט is a foreign-track issuer whose FISCAL Q3 2026 ended 31.3.26, so its
  // results published 2026-05-08 are a real, closed quarter that a calendar-quarter
  // test calls impossible. Measured: refusing reports too threw out three of its
  // filings. A report's title states the period it covers; only a deck's states a
  // month, which is the whole reason the two can disagree.
  assert.equal(
    periodFor([106], 'תוצאות החברה לרבעון 3 לשנת 2026 פורסמו בחו"ל', '2026-05-08T09:00:00'),
    'Q3 2026'
  )

  // And a conference-call RECORDING tagged [101, 233] — a report by docType, so it
  // keeps `FY 2025` exactly as before. It carries no PDF and never reaches the
  // catalog, which is why this is stated rather than fixed here.
  assert.equal(
    periodFor([101, 233], 'הקלטת שיחת ועידה מיום 24/03/2025', '2025-03-24T17:53:59.733'),
    'FY 2025'
  )
})

test('the periods that HAVE ended are untouched — the real דנאל rows, unchanged', () => {
  // The point of the rule is that it refuses one class and disturbs nothing else.
  assert.equal(periodFor([104], 'דוח רבעון 1 לשנת 2026', '2026-05-19T16:22:05.31'), 'Q1 2026')
  assert.equal(periodFor([101], 'דוח תקופתי ושנתי לשנת 2024', '2025-03-24T11:33:03.103'), 'FY 2024')
  assert.equal(periodFor([105], 'דוח רבעון 2/חצי שנתי לשנת 2025', '2025-08-21T18:01:04.437'), 'Q2 2025')
  assert.equal(periodFor([106], 'דוח רבעון 3 לשנת 2025', '2025-11-24T13:46:03.91'), 'Q3 2025')

  // A RESULTS DECK KEEPS ITS QUARTER. `[105, 270]` is the deck that accompanies
  // the Q2 statements, and `CatalogPeriod.slides` exists to hold it. A fix that
  // gave every deck a date label would have emptied that slot for every company.
  assert.equal(periodFor([105, 270], 'מצגת שוק ההון- אוגוסט 2025', '2025-08-21T18:27:01.527'), 'Q2 2025')
})

test('the period code is chosen in a fixed order, never by the order MAYA listed it', () => {
  // `.find(Boolean)` over the raw array made the label a fact about the TRANSPORT:
  // the same filing was `FY` or `Q2` depending on which id the feed happened to put
  // first. NOTE: unlike every fixture above, no filing carrying two period codes was
  // found in the live feed — this pins a fragility, not a sighting.
  const a = periodFor([101, 105], 'דוח רבעון 2/חצי שנתי לשנת 2025', '2025-08-21T18:01:04.437')
  const b = periodFor([105, 101], 'דוח רבעון 2/חצי שנתי לשנת 2025', '2025-08-21T18:01:04.437')
  assert.equal(a, b)
  // Annual first, because that is how `filingKind` settles the same collision. This
  // reader does not get to invent a second precedence.
  assert.equal(a, 'FY 2025')

  // A DECK carrying both tries the next code when the first names a period that had
  // not ended — an impossible label costs it a label, never its place.
  assert.equal(
    periodFor([101, 105, 270], 'מצגת תוצאות רבעון 2 לשנת 2025', '2025-08-21T18:27:01.527'),
    'Q2 2025'
  )
})

// ── THE CLASS COLD REVIEW CAUGHT: a rule that would have emptied the shelf ────
//
// The first version of the closed-period rule checked the code against the year it
// had just INFERRED from the publication date when the title stated none. For `FY`
// that comparison can never pass — an annual filed in 2025 was asked whether 2025
// had ended by 2025 — so every annual-coded filing with a year-less title fell to a
// date label, which `parsePeriod` refuses, which takes it off the documents tab.
// 100% of that class, to fix two rows. These cases exist so it cannot come back.

test('a year we INFERRED buys no refusal — only a year the issuer stated does', () => {
  // A DECK with no year in its title: the year is our own inference, so there is
  // nothing to check the code against and the label is what it always was.
  assert.equal(periodFor([101, 270], 'מצגת שוק ההון', '2026-03-24T09:00:00'), 'FY 2026')
  assert.equal(periodFor([101, 270], null, '2026-03-24T09:00:00'), 'FY 2026')
  // Reports are outside the rule entirely, stated year or not.
  assert.equal(periodFor([101], 'דוח תקופתי ושנתי', '2025-03-24T11:33:03.103'), 'FY 2025')
  assert.equal(periodFor([101], 'Annual Report', '2026-03-24T09:00:00'), 'FY 2026')
  assert.equal(periodFor([101], null, '2025-03-24T11:33:03.103'), 'FY 2025')
  assert.equal(periodFor([106], null, '2026-02-10T09:00:00'), 'Q3 2026')
})

test('no REPORT that had a place on the tab loses it to this rule', () => {
  // The property in the founder's terms: the rule may only refuse a label, never a
  // REPORT a reader could open. Measured at this tip across all 233 issuers and
  // 8,804 document-eligible filings — `node --import tsx
  // scripts/measure-period-labels.ts` — **81 labels change and every one is a deck**.
  // (99 was the PRE-NARROWING figure, and 18 of those were reports; it is quoted
  // here only so the two numbers are never confused again.) `parsePeriod` accepts
  // `FY|Q1|Q2|Q3 <year>` and nothing else, so anything that stops matching leaves
  // the documents tab.
  const isPeriod = (s: string) => /^(FY|Q1|Q2|Q3) (?:19|20)\d{2}$/.test(s)
  const reports: [number[], string | null, string][] = [
    [[101], 'דוח תקופתי ושנתי לשנת 2024', '2025-03-24T11:33:03.103'],
    [[104], 'דוח רבעון 1 לשנת 2026', '2026-05-19T16:22:05.31'],
    [[105], 'דוח רבעון 2/חצי שנתי לשנת 2025', '2025-08-21T18:01:04.437'],
    [[106], 'דוח רבעון 3 לשנת 2025', '2025-11-24T13:46:03.91'],
    // The classes the sweep found a naive rule would have thrown away:
    [[106], 'תוצאות החברה לרבעון 3 לשנת 2026 פורסמו בחו"ל', '2026-05-08T09:00:00'], // non-calendar FY
    [[101], 'Periodic Report For 2024', '2024-04-11T09:00:00'], // English title, same year
    [[101], 'דוח תקופתי ושנתי', '2026-03-24T09:00:00'], // no year stated at all
    [[101], null, '2026-03-24T09:00:00'],
  ]
  for (const [ids, t, iso] of reports) {
    assert.ok(isPeriod(periodFor(ids, t, iso)), `lost its period: ${t}`)
  }

  // A RESULTS deck keeps its quarter too — `CatalogPeriod.slides` exists to hold it.
  assert.ok(
    isPeriod(
      periodFor([104, 270], 'מצגת משקיעים - דוחות כספיים לרבעון הראשון של שנת 2026', '2026-05-27T00:00:00')
    )
  )
  assert.ok(isPeriod(periodFor([105, 270], 'מצגת שוק ההון- אוגוסט 2025', '2025-08-21T18:27:01.527')))
})
