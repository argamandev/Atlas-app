import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatTime,
  formatDate,
  formatRelativeDays,
  greetingKey,
  israelDayKey,
  israelMonthParts,
  israelDayStart,
  israelInstant,
} from './format'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ── Israel time, always ──────────────────────────────────────────────────────
//
// FOUNDER DECISION 2026-08-09, filed in cross-cutting: a call at 10:00 Israel
// time reads 10:00 for every viewer in every timezone. TASE and Israeli issuers
// publish in Israel time; a per-viewer value would mean Home, the calendar and
// the company page can disagree about the same event.
//
// ⚠ WHY THESE TESTS EXIST — THIS SHIPPED TO PRODUCTION AND WAS FOUND BY LOOKING.
// `formatTime` pinned no timeZone, so it used the RUNTIME's. Home is a Server
// Component: it formatted on Railway (UTC) and handed the client a finished
// string the browser never re-formats, so www.timlul-ai.com listed every
// investor call THREE HOURS EARLY — יעקב פיננסים's 10:00 call read 07:00 —
// while the calendar, a client component, rendered the same row correctly.
// Measured live 2026-08-09 against the DB.
//
// These assertions are absolute: they must hold whatever TZ the test process
// runs in, which is the whole property that was missing.

const CALL = '2026-08-10T07:00:00Z' // 10:00 in Jerusalem (UTC+3 in August)
const WINTER = '2026-01-14T08:00:00Z' // 10:00 in Jerusalem (UTC+2 in January)

test('THE PRODUCTION BUG: a 10:00 Israel call never renders as its UTC hour', () => {
  assert.equal(formatTime(CALL, 'en'), '10:00')
  assert.equal(formatTime(CALL, 'he'), '10:00')
})

test('the offset is taken from the date, not hardcoded — winter is UTC+2', () => {
  // A fixed +3 would render 11:00 here. Israel observes DST; only a real
  // timezone gets both right.
  assert.equal(formatTime(WINTER, 'en'), '10:00')
})

test('a report bucketed at Israel midnight belongs to THAT day, not the day before', () => {
  // Report publications carry no time, so they are stored at midnight Israel.
  // 2026-08-27T21:00Z IS 2026-08-28T00:00 in Jerusalem. Formatted in UTC — or
  // in any timezone west of Israel — it reads as the 27th, a day early.
  assert.equal(formatDate('2026-08-27T21:00:00Z', 'en'), 'Aug 28, 2026')
  assert.equal(israelDayKey('2026-08-27T21:00:00Z'), '2026-08-28')
})

test('a late-evening Israel event does not slide into the next day', () => {
  // 23:30 Israel = 20:30Z. A timezone EAST of Israel would push this to the 11th.
  assert.equal(israelDayKey('2026-08-10T20:30:00Z'), '2026-08-10')
  assert.equal(formatTime('2026-08-10T20:30:00Z', 'en'), '23:30')
})

test('israelMonthParts reports the Israel year and month of an instant', () => {
  assert.deepEqual(israelMonthParts('2026-08-27T21:00:00Z'), { year: 2026, month: 7 })
  // 2026-01-01T00:00 Israel is 2025-12-31T22:00Z — the year boundary is the
  // sharpest case, and a UTC read puts this event in the wrong YEAR.
  assert.deepEqual(israelMonthParts('2025-12-31T22:00:00Z'), { year: 2026, month: 0 })
})

test("relative days count Israel days, not the runtime's", () => {
  // "now" is 2026-08-09 23:00 Israel (20:00Z). The call is 2026-08-10 10:00
  // Israel. That is TOMORROW in Israel — but in UTC "now" is still the 9th at
  // 20:00 and the call is the 10th, which happens to agree; the case that
  // breaks is a viewer west of Israel, where local "now" is still the 9th
  // morning and the Israel day has already turned.
  const now = new Date('2026-08-09T20:00:00Z')
  assert.equal(formatRelativeDays(CALL, 'en', now), 'tomorrow')
})

test('same Israel day is "today" even across a UTC date boundary', () => {
  // now = 2026-08-10 02:00 Israel (2026-08-09 23:00Z — still the 9th in UTC).
  // The call is later the same Israel day, so it is TODAY, not tomorrow.
  const now = new Date('2026-08-09T23:00:00Z')
  assert.equal(formatRelativeDays(CALL, 'en', now), 'today')
})

test("the greeting follows Israel hours, not the server's", () => {
  // 2026-08-09T20:00Z is 23:00 in Israel — evening. A server in UTC would say
  // "Good evening" too here, so the discriminating case is the other way:
  // 06:00Z is 09:00 Israel (morning) but would be morning in UTC as well.
  // The real split: 2026-08-09T10:00Z = 13:00 Israel (afternoon) vs 10:00 UTC
  // (morning).
  assert.equal(greetingKey(new Date('2026-08-09T10:00:00Z')), 'afternoon')
  assert.equal(greetingKey(new Date('2026-08-09T20:00:00Z')), 'evening')
  assert.equal(greetingKey(new Date('2026-08-09T04:00:00Z')), 'morning')
})

// ── israelDayStart — the inverse of israelDayKey ─────────────────────────────
//
// Added by fix/israel-time-residue. The hotfix pinned the FORMATTERS to Israel
// time; three places that COMPARE dates were left reading the runtime's
// midnight, and `listCalls({scope:'upcoming'})` was the one that needed a real
// instant rather than a day key, because it filters in SQL.

test('israelDayStart: an Israel day begins before UTC midnight, by its real offset', () => {
  // August: Israel is UTC+3, so the day starts at 21:00Z the evening before.
  assert.equal(israelDayStart('2026-08-10').toISOString(), '2026-08-09T21:00:00.000Z')
  // January: UTC+2, so 22:00Z. A hardcoded offset gets exactly one of these right.
  assert.equal(israelDayStart('2026-01-14').toISOString(), '2026-01-13T22:00:00.000Z')
})

test('israelDayStart: THE BUG — UTC midnight is 2-3 hours LATE, which hid every report due today', () => {
  // Report rows carry no clock and are stored AT Israel midnight. The old
  // `setHours(0,0,0,0)` running on Railway floored to UTC midnight, which is
  // AFTER the row's own timestamp — so today's reports fell below the cut-off
  // and no surface listed them.
  const report = Date.parse('2026-08-09T21:00:00Z') // = 2026-08-10T00:00 Israel
  const utcMidnight = Date.parse('2026-08-10T00:00:00Z')
  assert.ok(report < utcMidnight, 'precondition: the row sorts BEFORE UTC midnight')
  assert.ok(
    report >= israelDayStart('2026-08-10').getTime(),
    'a report due today must survive the upcoming filter'
  )
})

test('israelDayStart: every day of 2026 starts at its own first instant (DST included)', () => {
  // A PROPERTY, not a table of dates I believe in: the returned instant must be
  // inside the requested Israel day, and one millisecond earlier must not be.
  // That is the definition of "the day starts here", and it holds across both
  // 2026 transitions without this test having to know when they are.
  let checked = 0
  for (let t = Date.UTC(2026, 0, 1, 12); t <= Date.UTC(2026, 11, 31, 12); t += 86_400_000) {
    const key = israelDayKey(new Date(t))
    const start = israelDayStart(key)
    assert.equal(israelDayKey(start), key, `${key}: start is not inside its own day`)
    assert.notEqual(
      israelDayKey(new Date(start.getTime() - 1)),
      key,
      `${key}: the millisecond before the start is still the same day`
    )
    checked++
  }
  assert.equal(checked, 365)
})

// A DATE WE DO NOT HAVE MUST NOT TAKE THE PAGE DOWN.
//
// Found 2026-08-09 by opening a period the catalog can reach: a quarter with a
// report and a deck but NO transcript has no call date, and the viewer header
// formats one. `Intl.DateTimeFormat().format(new Date(''))` throws
// `RangeError: Invalid time value`, so the whole route 500'd — invisible to 649
// passing tests, a clean tsc and a green build, because it lived in a state
// nobody had rendered.
//
// Both call sites already wrote `[a, formatDate(...)].filter(Boolean)`, i.e.
// they were built expecting an empty string. The formatter simply never
// returned one. Empty is the honest answer for an instant we do not have;
// crashing is not, and neither is inventing a date.
test('formatDate returns empty for an instant we do not have, rather than throwing', () => {
  assert.equal(formatDate('', 'en'), '')
  assert.equal(formatDate('', 'he'), '')
  assert.equal(formatDate('not a date', 'en'), '')
})

test('formatTime returns empty for an instant we do not have', () => {
  assert.equal(formatTime('', 'en'), '')
  assert.equal(formatTime('not a date', 'he'), '')
})

test('a real instant is unaffected', () => {
  assert.equal(formatDate('2026-08-09T09:00:00Z', 'en'), 'Aug 9, 2026')
})

// ── israelInstant — a zone-less Israel wall clock → a real instant ───────────
//
// MAYA sends `"publicationDate": "2026-05-27T11:27:00.52"` with no zone. Slice
// A4 is where that fact first reached a `timestamptz` column, on 26 live rows at
// once, so both sides of the DST changeover are asserted here — including the
// changeover DAY itself, which is the only day a single-pass offset probe gets
// wrong and the reason this shares `israelDayStart`'s two passes.

test('a summer (IDT, +03:00) wall clock resolves to the right instant', () => {
  assert.equal(israelInstant('2026-05-27T11:27:00.52'), '2026-05-27T08:27:00.520Z')
})

test('a winter (IST, +02:00) wall clock resolves to the right instant', () => {
  assert.equal(israelInstant('2021-01-14T09:00:00'), '2021-01-14T07:00:00.000Z')
})

test('the DST changeover day: an hour past the transition is +03:00, not +02:00', () => {
  // Israel moved to IDT at 02:00 on 2026-03-27 (last Friday of March).
  // 01:30 is still IST (+02:00); 03:30 is already IDT (+03:00). A single-pass
  // probe reads the second one off the wrong side and lands an hour early.
  assert.equal(israelInstant('2026-03-27T01:30:00'), '2026-03-26T23:30:00.000Z')
  assert.equal(israelInstant('2026-03-27T03:30:00'), '2026-03-27T00:30:00.000Z')
})

test('a real backfilled row: the 2020 annual report, published 2021-03-31 08:33 Israel', () => {
  assert.equal(israelInstant('2021-03-31T08:33:18.363'), '2021-03-31T05:33:18.363Z')
})

test('a string that already carries a zone is returned untouched', () => {
  assert.equal(israelInstant('2026-05-27T08:27:00Z'), '2026-05-27T08:27:00Z')
  assert.equal(israelInstant('2026-05-27T11:27:00+03:00'), '2026-05-27T11:27:00+03:00')
})

test('null, empty and unrecognised shapes are never guessed at', () => {
  assert.equal(israelInstant(null), null)
  assert.equal(israelInstant(''), null)
  assert.equal(israelInstant('31/03/2021'), '31/03/2021')
})

// ── THE MECHANISM (ADR-0002) ────────────────────────────────────────────────
//
// Every Israel-time law in `.claude/rules/app.md` sits on one premise: that
// there is ONE place in the source that knows what Israel time is. The premise
// went unenforced until a second copy of the offset probe appeared in
// `lib/maya/dates.ts` during slice A4 — a copy that dropped the two-pass fix and
// was wrong for one hour a year. A reviewer caught it; nothing mechanical would
// have. This is that mechanism.
//
// THREE STATED LIMITS, because a guard that overstates its reach is worse than
// none (M1):
//   1. It scans `src/` and `scripts/` for the zone LITERAL. A second
//      implementation that derived the offset another way — a hardcoded +180, a
//      table of transition dates — passes this and is still a second copy.
//   2. COMMENTS ARE BLANKED FIRST. This repo has been fooled by a grep that hit
//      prose before (`DEMO_USER_ID` read as 14 live sites, 11 of them comments).
//      A `@deprecated … use the one that pins Asia/Jerusalem` note is a POINTER
//      at the single source, not a rival to it.
//   3. This file is excluded: it is the scanner, and the needle is in its hand.
//
// The two ALLOWED entries below are a ratchet, not an amnesty — each states why,
// and anything not on the list fails.

const ROOT = resolve(process.cwd())

/** file → why this file is allowed to name the zone itself. */
const ALLOWED: Record<string, string> = {
  'src/lib/i18n/format.ts': 'THE definition — every Israel-time law resolves here',
  'src/lib/maya/schedule.ts':
    'genuinely multi-zone: MAYA schedule rows carry a country tag, and a US issuer’s ' +
    'call is America/New_York. Not a copy of the Israel answer — a different question. ' +
    'Its own header carries the seven-hours-wrong case that put it there.',
  'src/lib/maya/schedule.test.ts': 'asserts the above mapping; naming the zone IS the assertion',
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(p)
  }
  return out
}

const blankComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

test('only the files that MAY name Asia/Jerusalem do — a second one is a second answer', () => {
  const self = 'src/lib/i18n/format.test.ts'
  const files = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'scripts'))]
  assert.ok(files.length > 50, `only ${files.length} source files found — the walk is broken`)

  const holders = files
    .map((p) => relative(ROOT, p).replace(/\\/g, '/'))
    .filter((rel) => rel !== self)
    .filter((rel) => blankComments(readFileSync(join(ROOT, rel), 'utf8')).includes('Asia/Jerusalem'))
    .sort()

  const unexpected = holders.filter((p) => !(p in ALLOWED))
  assert.deepEqual(
    unexpected,
    [],
    'These files name the Israel timezone themselves. Import from @/lib/i18n/format instead — ' +
      'the second copy is where the two-pass DST fix gets dropped, which is exactly what ' +
      'happened in slice A4:\n' +
      unexpected.join('\n')
  )

  // Both jaws: an entry that stopped being true must be removed, or the list
  // slowly becomes a description of nothing.
  const stale = Object.keys(ALLOWED).filter((p) => !holders.includes(p))
  assert.deepEqual(stale, [], `ALLOWED lists files that no longer name the zone:\n${stale.join('\n')}`)
})
