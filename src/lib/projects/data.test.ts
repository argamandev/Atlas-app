import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presentProject, presentChats } from './present'
import { PROJECT_CONTEXT_BUDGET } from './derive'
import { buildProjectContext } from '@/lib/chat/projectContext'
import { en } from '@/lib/i18n/dictionaries/en'
import { he } from '@/lib/i18n/dictionaries/he'
import type { ProjectRow, ProjectSourceRow } from './data'

// The demo seed these tests used to assert is gone — projects come from the
// database now. What is worth testing is the seam where a row becomes a label.

const NOW = new Date('2026-08-02T12:00:00Z')

const row = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: 'p1',
  user_id: 'u1',
  name: 'Shipping sector',
  pinned: true,
  instructions: '',
  memory: '',
  memory_updated_at: null,
  created_at: '2026-08-01T12:00:00Z',
  updated_at: '2026-08-02T10:00:00Z',
  ...over,
})

const source = (over: Partial<ProjectSourceRow> = {}): ProjectSourceRow => ({
  id: 's1',
  project_id: 'p1',
  user_id: 'u1',
  name: 'Bidder brief',
  body: 'a\nb\nc',
  position: 0,
  created_at: '2026-08-01T12:00:00Z',
  updated_at: '2026-08-01T12:00:00Z',
  ...over,
})

test('a project that never had memory says so, in both locales', () => {
  assert.equal(presentProject(row(), [], [], NOW, 'en', en).memWhen, en.projects.memoryNever)
  assert.equal(presentProject(row(), [], [], NOW, 'he', he).memWhen, he.projects.memoryNever)
})

test('source meta is counted from the real body, and the body is carried through', () => {
  const p = presentProject(row(), [source()], [], NOW, 'en', en)
  assert.equal(p.context[0].meta, '3 lines')
  assert.equal(p.context[0].body, 'a\nb\nc')
  assert.equal(p.context[0].kind, 'TEXT')
  assert.equal(p.context[0].id, 's1')
})

test('an empty source is labelled empty rather than claiming content', () => {
  const p = presentProject(row(), [source({ body: '' })], [], NOW, 'en', en)
  assert.equal(p.context[0].meta, en.projects.sourceEmpty)
})

test('capacity reflects the block the server actually sends', () => {
  const r = row({ instructions: 'i'.repeat(400), memory: 'm'.repeat(400) })
  const s = source({ body: 'b'.repeat(800) })
  const p = presentProject(r, [s], [], NOW, 'en', en)

  // Expected comes from the injector, not from a hand-summed constant — a
  // number typed here would be free to drift away from what is sent, which is
  // exactly the defect this replaces (the old assertion said 1600 chars while
  // the real block is larger).
  const real = buildProjectContext({
    name: r.name,
    instructions: r.instructions,
    memory: r.memory,
    sources: [{ name: s.name, body: s.body }],
  }).fullLength
  assert.ok(real > 1600, 'the framing the server adds is part of the budget')
  assert.equal(p.capacity, Math.round((real / PROJECT_CONTEXT_BUDGET) * 100))
  assert.equal(p.overBudget, false)
})

test('a blank note is not counted as context, in the meter or in the count', () => {
  const withBlank = presentProject(row(), [source({ body: '   ' })], [], NOW, 'en', en)
  const without = presentProject(row(), [], [], NOW, 'en', en)
  // It still LISTS — the user wrote it and can go fill it in — but it costs
  // nothing, because buildProjectContext skips a source with no body.
  assert.equal(withBlank.context.length, 1)
  assert.equal(withBlank.capacity, without.capacity)
})

test('a project past the budget reports overBudget so the UI can say so', () => {
  const p = presentProject(
    row({ instructions: 'x'.repeat(PROJECT_CONTEXT_BUDGET + 1) }),
    [],
    [],
    NOW,
    'en',
    en
  )
  assert.equal(p.overBudget, true)
  assert.equal(p.capacity, 100, 'the meter clamps, but overBudget still carries the fact')
})

test('memory that was updated reports when, derived from the timestamp', () => {
  const p = presentProject(
    row({ memory: 'tracking the tender', memory_updated_at: '2026-07-31T12:00:00Z' }),
    [],
    [],
    NOW,
    'en',
    en
  )
  assert.ok(p.memWhen.includes('2 days ago'), p.memWhen)
})

test('chat timestamps are derived, never stored as a label', () => {
  const chats = presentChats(
    [{ id: 'c1', title: 'Who is bidding?', updated_at: '2026-08-02T10:00:00Z' }],
    NOW,
    'en'
  )
  assert.equal(chats[0].id, 'c1')
  assert.match(chats[0].when, /2 hours ago/)
})
