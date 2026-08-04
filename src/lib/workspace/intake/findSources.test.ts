import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSources } from './findSources'
import type { SourceRequest } from './types'
import type { AttachableSource } from '../data'

const req = (over: Partial<SourceRequest> = {}): SourceRequest => ({
  text: 'תיגבור',
  company: null,
  fromYear: null,
  toYear: null,
  kinds: null,
  interpreted: true,
  ...over,
})

// Shaped like the real corpus: Hebrew company names with a legal suffix the user
// will never type, which is why matching is substring-either-way.
const CORPUS: AttachableSource[] = [
  {
    sourceId: 't1',
    kind: 'transcript',
    title: 'שיחת משקיעים Q1 2026',
    company: 'קבוצת תיגבור בע"מ',
    when: '2026-03-02',
  },
  {
    sourceId: 't2',
    kind: 'transcript',
    title: 'שיחת משקיעים Q2 2026',
    company: 'קבוצת תיגבור בע"מ',
    when: '2026-06-02',
  },
  {
    sourceId: 't3',
    kind: 'transcript',
    title: 'Old call 2023',
    company: 'קבוצת תיגבור בע"מ',
    when: '2023-05-02',
  },
  {
    sourceId: 'd1',
    kind: 'document',
    title: 'דוח שנתי 2025',
    company: 'קבוצת תיגבור בע"מ',
    when: '2026-01-11',
  },
  { sourceId: 't9', kind: 'transcript', title: 'Tamis call', company: 'תמיס בע"מ', when: '2026-04-01' },
]

const ids = (r: { matched: AttachableSource[] }) => r.matched.map((m) => m.sourceId).sort()

test('matches a company by a partial Hebrew name', () => {
  const r = findSources(req({ company: 'תיגבור' }), CORPUS)
  assert.equal(r.reason, 'ok')
  assert.equal(r.company, 'קבוצת תיגבור בע"מ')
  assert.deepEqual(ids(r), ['d1', 't1', 't2', 't3'])
})

test('filters by the asked-for year window', () => {
  const r = findSources(req({ company: 'תיגבור', fromYear: 2026, toYear: 2026 }), CORPUS)
  assert.deepEqual(ids(r), ['d1', 't1', 't2'])
})

test('filters by kind', () => {
  const r = findSources(req({ company: 'תיגבור', kinds: ['document'] }), CORPUS)
  assert.deepEqual(ids(r), ['d1'])
})

// THE CASE THE SPEC IS BUILT AROUND. "The company exists but not in that period"
// and "I do not have that company" are different sentences on screen, and neither
// may render as an ordinary empty list.
test('separates "company has nothing in that period" from "nothing matched at all"', () => {
  const r = findSources(req({ company: 'תיגבור', fromYear: 2019, toYear: 2020 }), CORPUS)
  assert.equal(r.reason, 'company-has-nothing-in-period')
  assert.deepEqual(r.matched, [])
  assert.deepEqual(r.otherForCompany.map((m) => m.sourceId).sort(), ['d1', 't1', 't2', 't3'])

  // The sentence and the resolved company must agree, as they do in real traffic:
  // the model reads "אלביט" out of the user typing "אלביט". An unresolvable
  // company still falls back to searching the user's words, and when THOSE match
  // nothing either, the honest answer is nothing-matched.
  const none = findSources(req({ text: 'אלביט', company: 'אלביט' }), CORPUS)
  assert.equal(none.reason, 'nothing-matched')
  assert.deepEqual(none.otherForCompany, [])
  assert.deepEqual(none.matched, [])
})

test('reports an empty corpus as such rather than as a missing company', () => {
  assert.equal(findSources(req({ company: 'תיגבור' }), []).reason, 'empty-corpus')
})

test('falls back to the raw words when no company was resolved', () => {
  const r = findSources(req({ text: 'Tamis', company: null }), CORPUS)
  assert.deepEqual(
    r.matched.map((m) => m.sourceId),
    ['t9']
  )
})

test('returns newest first', () => {
  const r = findSources(req({ company: 'תיגבור' }), CORPUS)
  assert.equal(r.matched[0].sourceId, 't2')
})

test('a resolved company wins over the words in the sentence', () => {
  // "תיגבור 2026 דוחות" resolves the company; the stray words must not then
  // narrow the result to titles that happen to contain them.
  const r = findSources(req({ text: 'תיגבור 2026 דוחות', company: 'תיגבור' }), CORPUS)
  assert.deepEqual(ids(r), ['d1', 't1', 't2', 't3'])
})

test('a source with no date is not silently dropped when no window was asked for', () => {
  const undated: AttachableSource = {
    sourceId: 'x1',
    kind: 'document',
    title: 'דוח ללא תאריך',
    company: 'קבוצת תיגבור בע"מ',
    when: null,
  }
  const r = findSources(req({ company: 'תיגבור' }), [...CORPUS, undated])
  assert.ok(ids(r).includes('x1'))
})

test('a source with no date IS excluded when a window was asked for', () => {
  // It cannot be shown to be in the window, and claiming it is would put a file
  // on the shelf the user did not ask for.
  const undated: AttachableSource = {
    sourceId: 'x1',
    kind: 'document',
    title: 'דוח ללא תאריך',
    company: 'קבוצת תיגבור בע"מ',
    when: null,
  }
  const r = findSources(req({ company: 'תיגבור', fromYear: 2026, toYear: 2026 }), [...CORPUS, undated])
  assert.ok(!ids(r).includes('x1'))
})

test('an unresolved company with no match anywhere reads as nothing-matched', () => {
  const r = findSources(req({ text: 'zzzznothing', company: null }), CORPUS)
  assert.deepEqual(r.matched, [])
  assert.equal(r.reason, 'nothing-matched')
})
