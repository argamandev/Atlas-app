import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quarterOf, kindOf, tabLabel } from './tabLabel'

const L = { transcript: 'תמליל', document: 'דוח' }

// ── the real titles on the founder's shelf ───────────────────────────────────
// These four are the exact strings that made three tabs unreadable: they share
// a long prefix and differ only at the end, which is what a tab chip truncates.

test('the Hebrew call titles resolve to their quarter', () => {
  assert.equal(quarterOf('קבוצת תיגבור - שיחת משקיעים - רבעון ראשון לשנת 2026'), 'Q1 2026')
  assert.equal(quarterOf('קבוצת תיגבור - שיחת משקיעים - רבעון שלישי לשנת 2025'), 'Q3 2025')
  // "רבעון רביעי ושנת 2025" is the Q4 call and the annual in one — filed as Q4,
  // which is the way an analyst looks for it.
  assert.equal(quarterOf('קבוצת תיגבור - שיחת משקיעים - רבעון רביעי ושנת 2025'), 'Q4 2025')
})

test('the Latin form the filings already use is read as-is', () => {
  assert.equal(quarterOf('דוח דירקטוריון Q1 2026'), 'Q1 2026')
  assert.equal(quarterOf('Tigbur q3/2025 board report'), 'Q3 2025')
})

test('a year alone is a full year ONLY when the title says so', () => {
  assert.equal(quarterOf('דוח שנתי 2025'), 'FY 2025')
  assert.equal(quarterOf('Annual 2025'), 'FY 2025')
  // A bare year is more often a mislabelled quarter than an annual, so it is
  // not claimed either way.
  assert.equal(quarterOf('קבוצת תיגבור 2025'), null)
})

test('an unreadable title yields null rather than a guess', () => {
  assert.equal(quarterOf('דיון בוועדת הכלכלה של הכנסת'), null)
  assert.equal(quarterOf(''), null)
  // 1926 is not a quarter of anything this product covers.
  assert.equal(quarterOf('Q1 1926'), null)
})

// ── the chip ─────────────────────────────────────────────────────────────────

test('a call and a filing from the same quarter are told apart', () => {
  const call = tabLabel('קבוצת תיגבור - שיחת משקיעים - רבעון ראשון לשנת 2026', 'transcript', L)
  const doc = tabLabel('דוח דירקטוריון Q1 2026', 'document', L)
  assert.equal(call, 'Q1 2026 · תמליל')
  assert.equal(doc, 'Q1 2026 · דוח')
  assert.notEqual(call, doc)
})

test('three calls that shared a prefix now differ at the START of the chip', () => {
  // The whole point: what distinguishes them has to survive truncation.
  const names = [
    'קבוצת תיגבור - שיחת משקיעים - רבעון ראשון לשנת 2026',
    'קבוצת תיגבור - שיחת משקיעים - רבעון שלישי לשנת 2025',
    'קבוצת תיגבור - שיחת משקיעים - רבעון רביעי ושנת 2025',
  ]
  const chips = names.map((n) => tabLabel(n, 'transcript', L))
  assert.deepEqual(chips, ['Q1 2026 · תמליל', 'Q3 2025 · תמליל', 'Q4 2025 · תמליל'])
  // Distinct within the first 7 characters, so a narrow tab still separates them.
  assert.equal(new Set(chips.map((c) => c.slice(0, 7))).size, 3)
})

test('a title with no readable quarter keeps its stored name', () => {
  const odd = 'דיון בוועדת הכלכלה של הכנסת'
  assert.equal(tabLabel(odd, 'transcript', L), odd)
})

test('every non-call kind reads as a document', () => {
  assert.equal(kindOf('transcript'), 'transcript')
  for (const k of ['document', 'pdf', 'xlsx', 'slide', 'file'] as const) {
    assert.equal(kindOf(k), 'document')
  }
})
