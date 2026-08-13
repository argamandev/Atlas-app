import { test } from 'node:test'
import assert from 'node:assert/strict'
import { yearWindows, windowDays, windowIsLegal, israelInstant } from './dates'

// THE FOUNDER'S FAILING CASE, as a test. He asked for the 2024 yearly report;
// it was published 2025-03-30, so a 2024-only window returns the 2023 report.
test('one year asks for two windows, because annual reports are filed the year after', () => {
  assert.deepEqual(yearWindows(2024, 2024), [
    { from: '2024-01-01', to: '2024-12-31' },
    { from: '2025-01-01', to: '2025-12-31' },
  ])
})

test('no window can exceed the API cap of one year', () => {
  for (const w of yearWindows(2019, 2026)) {
    assert.ok(windowIsLegal(w), `${w.from}..${w.to} is ${windowDays(w)} days`)
  }
  // the exact boundary the live API rejected: 380 days is a 400
  assert.equal(windowIsLegal({ from: '2025-01-01', to: '2026-01-15' }), false)
})

test('a reversed range is a slip, not a request for nothing', () => {
  assert.deepEqual(yearWindows(2026, 2024), yearWindows(2024, 2026))
})

test('a multi-year request covers every year plus the trailing one', () => {
  const w = yearWindows(2024, 2026)
  assert.equal(w.length, 4)
  assert.equal(w[0].from, '2024-01-01')
  assert.equal(w[3].to, '2027-12-31')
})

// ── israelInstant — MAYA's zone-less publicationDate ─────────────────────────
//
// The A4 backfill is where `publication_date` first gets values, so the wrong
// reading would land on 26 live rows at once. Both sides of the DST changeover
// are asserted because the corpus spans a decade of filings.

test('a summer (DST, +03:00) publication datetime becomes the right instant', () => {
  // 2026-05-27 11:27 Israel = 08:27 UTC
  assert.equal(israelInstant('2026-05-27T11:27:00.52'), '2026-05-27T08:27:00.520Z')
})

test('a winter (standard, +02:00) publication datetime becomes the right instant', () => {
  // 2024-03-31 was already DST in Israel (starts 2024-03-29) — use a January date
  // for the standard-time side. 2021-01-14 09:00 Israel = 07:00 UTC.
  assert.equal(israelInstant('2021-01-14T09:00:00'), '2021-01-14T07:00:00.000Z')
})

test('a real backfilled row: the 2020 annual report published 2021-03-31 08:33 Israel', () => {
  // Israel switched to DST on 2021-03-26, so this is +03:00 → 05:33 UTC.
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
