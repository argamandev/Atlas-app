import { test } from 'node:test'
import assert from 'node:assert/strict'
import { yearWindows, windowDays, windowIsLegal } from './dates'

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
