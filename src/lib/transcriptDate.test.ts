import { test } from 'node:test'
import assert from 'node:assert/strict'
import { israelDayKey } from '@/lib/i18n/format'

// `listCompanyTranscripts` maps a row's date for the company page's document
// rows. It used to do `created_at.split('T')[0]`, which is the UTC day — so a
// transcript created between midnight and 03:00 Israel rendered as YESTERDAY,
// on the very rows this slice builds. Filed at the fix/israel-time-residue
// merge; the law is in rules/app.md.
//
// The second assertion in each case is the OLD behaviour, kept so this test
// states what it is defending rather than only that the new answer is right.

test('a transcript created after Israel midnight is dated that day, not the previous one', () => {
  // 01:30 Israel on 2026-08-10 is 22:30 UTC on 2026-08-09 (IDT, UTC+3)
  const createdAt = '2026-08-09T22:30:00Z'
  assert.equal(israelDayKey(createdAt), '2026-08-10')
  assert.equal(createdAt.split('T')[0], '2026-08-09') // what it used to render
})

test('winter time too — the offset is not hardcoded', () => {
  // 01:30 Israel on 2026-01-10 is 23:30 UTC on 2026-01-09 (IST, UTC+2)
  const createdAt = '2026-01-09T23:30:00Z'
  assert.equal(israelDayKey(createdAt), '2026-01-10')
  assert.equal(createdAt.split('T')[0], '2026-01-09')
})

test('an ordinary daytime instant is unchanged', () => {
  assert.equal(israelDayKey('2026-08-09T09:00:00Z'), '2026-08-09')
})
