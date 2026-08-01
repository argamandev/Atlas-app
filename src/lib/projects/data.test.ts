import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presentProject, presentChats } from './present'
import { PROJECT_CONTEXT_BUDGET } from './derive'
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

test('capacity reflects instructions, memory and every source body', () => {
  const p = presentProject(
    row({ instructions: 'i'.repeat(400), memory: 'm'.repeat(400) }),
    [source({ body: 'b'.repeat(800) })],
    [],
    NOW,
    'en',
    en
  )
  assert.equal(p.capacity, Math.round((1600 / PROJECT_CONTEXT_BUDGET) * 100))
  assert.equal(p.overBudget, false)
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
