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
import { buildProjectContext } from '@/lib/chat/projectContext'
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

test('capacity measures what the injector actually builds, not the raw fields', () => {
  const input = {
    name: 'Shipping sector',
    instructions: 'a'.repeat(100),
    memory: 'b'.repeat(100),
    sources: [{ name: 'Bidder brief', body: 'c'.repeat(300) }],
  }
  const used = contextChars(input)
  // The meter and the server must be the same number. This used to sum only the
  // raw fields — 500 here — and miss the framing header, the label line per
  // section and the source NAME, so a project could read under 100% while the
  // server was already cutting it.
  assert.equal(used, buildProjectContext(input).fullLength)
  assert.equal(used, buildProjectContext(input).text.length, 'untruncated: both lengths agree')
  assert.ok(used > 500, `the framing the server sends must be counted, got ${used}`)
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

test('contextChars counts every source, not just the first', () => {
  const base = { name: 'P', instructions: '', memory: '' }
  const one = contextChars({ ...base, sources: [{ name: 'a', body: 'aa' }] })
  const three = contextChars({
    ...base,
    sources: [
      { name: 'a', body: 'aa' },
      { name: 'b', body: 'bbb' },
      { name: 'c', body: 'cccc' },
    ],
  })
  assert.ok(three > one, `three sources must measure more than one: ${three} vs ${one}`)
})

test('a blank note costs nothing, because the injector skips it', () => {
  const base = { name: 'P', instructions: 'keep it short', memory: '', sources: [] }
  assert.equal(
    contextChars({ ...base, sources: [{ name: 'Empty note', body: '   \n ' }] }),
    contextChars(base),
    'a note with no body is not sent, so it must not be charged for'
  )
})
