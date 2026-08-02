import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROJECT_CONTEXT_BUDGET,
  relativeLabel,
  memoryLabel,
  lineMeta,
  contextChars,
  capacityPercent,
  isOverBudget,
} from './derive'
import { en } from '@/lib/i18n/dictionaries/en'
import { he } from '@/lib/i18n/dictionaries/he'

const NOW = new Date('2026-08-02T12:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

test('relative labels come from the timestamp, never from a stored string', () => {
  assert.match(relativeLabel(ago(2 * HOUR), NOW, 'en'), /2 hours ago/)
  assert.match(relativeLabel(ago(4 * DAY), NOW, 'en'), /4 days ago/)
})

test('the same row renders differently later — which is the whole point', () => {
  const created = ago(2 * HOUR)
  const later = new Date(NOW.getTime() + 5 * DAY)
  assert.notEqual(
    relativeLabel(created, NOW, 'en'),
    relativeLabel(created, later, 'en'),
    'a stored "2h ago" would still read "2h ago" a week later'
  )
})

test('relative labels localize to Hebrew rather than emitting English', () => {
  const label = relativeLabel(ago(2 * HOUR), NOW, 'he')
  assert.ok(/[֐-׿]/.test(label), `expected Hebrew characters, got "${label}"`)
})

test('memory that was never updated says so, in both locales', () => {
  assert.equal(memoryLabel(null, NOW, 'en', en), en.projects.memoryNever)
  assert.equal(memoryLabel(null, NOW, 'he', he), he.projects.memoryNever)
})

test('memory that WAS updated reports when, with the placeholder substituted', () => {
  const label = memoryLabel(ago(2 * DAY), NOW, 'en', en)
  assert.ok(label.includes('2 days ago'), label)
  assert.ok(!label.includes('{when}'), 'the placeholder must be substituted')
})

test('line meta counts the real body', () => {
  assert.equal(lineMeta('a\nb\nc', en), '3 lines')
})

test('a single line inflects correctly rather than reading "1 lines"', () => {
  assert.equal(lineMeta('just the one', en), en.projects.sourceLine)
  assert.equal(lineMeta('שורה אחת בלבד', he), he.projects.sourceLine)
  assert.ok(!lineMeta('just the one', en).includes('{n}'))
})

test('an empty or whitespace body is labelled empty, not given a fake count', () => {
  assert.equal(lineMeta('', en), en.projects.sourceEmpty)
  assert.equal(lineMeta('   \n  ', en), en.projects.sourceEmpty)
  assert.equal(lineMeta('', he), he.projects.sourceEmpty)
})

test('capacity is measured against a real budget', () => {
  const used = contextChars({
    instructions: 'a'.repeat(100),
    memory: 'b'.repeat(100),
    bodies: ['c'.repeat(300)],
  })
  assert.equal(used, 500)
  assert.equal(capacityPercent(0), 0)
  assert.equal(capacityPercent(PROJECT_CONTEXT_BUDGET), 100)
  assert.equal(isOverBudget(PROJECT_CONTEXT_BUDGET), false)
  assert.equal(isOverBudget(PROJECT_CONTEXT_BUDGET + 1), true)
})

test('capacity stays in the meter range even when the project does not', () => {
  const pct = capacityPercent(PROJECT_CONTEXT_BUDGET * 10)
  assert.ok(pct >= 0 && pct <= 100, `meter out of range: ${pct}`)
  // ...but the over-budget FACT must stay reachable, or the UI shows a full bar
  // and says nothing while the user's instructions are being cut.
  assert.equal(isOverBudget(PROJECT_CONTEXT_BUDGET * 10), true)
})

test('contextChars counts every source body, not just the first', () => {
  assert.equal(contextChars({ instructions: '', memory: '', bodies: ['aa', 'bbb', 'cccc'] }), 9)
})
