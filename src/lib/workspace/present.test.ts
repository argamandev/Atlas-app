import { test } from 'node:test'
import assert from 'node:assert/strict'
import { en } from '@/lib/i18n/dictionaries/en'
import { he } from '@/lib/i18n/dictionaries/he'
import { citationState, workspaceInitial, deriveCompany, deriveSub, presentWorkspace } from './present'
import type { WorkspaceRow, WorkspaceItemRow } from './data'

const block = (over: Partial<{ source_item_id: string | null; source_quote: string | null }> = {}) => ({
  source_item_id: 'i1' as string | null,
  source_quote: 'הכנסות עלו בכל שנה' as string | null,
  ...over,
})

const row = (over: Partial<WorkspaceRow> = {}): WorkspaceRow => ({
  id: 'w1',
  user_id: 'u1',
  name: 'תגבור — הפרטה',
  doc_title: 'מה אנחנו יודעים',
  created_at: '2026-08-01T09:00:00.000Z',
  updated_at: '2026-08-03T10:00:00.000Z',
  ...over,
})

const item = (over: Partial<WorkspaceItemRow> = {}): WorkspaceItemRow => ({
  id: 'i1',
  workspace_id: 'w1',
  user_id: 'u1',
  transcript_id: 't1',
  document_id: null,
  storage_path: null,
  name: 'תדיראן Q4 2025',
  kind: 'transcript',
  is_open: false,
  position: 0,
  created_at: '2026-08-01T09:00:00.000Z',
  ...over,
})

// ── Citation truthfulness ────────────────────────────────────────────────────

test('a citation whose source left the shelf is ABSENT, never live', () => {
  assert.equal(citationState(block({ source_item_id: null }), null), 'absent')
  assert.equal(citationState(block({ source_item_id: null }), 'any text at all'), 'absent')
})

test('a citation whose anchor no longer resolves is ABSENT', () => {
  assert.equal(citationState(block(), null), 'absent')
})

test('a citation resolving to the words it quoted is LIVE', () => {
  assert.equal(citationState(block(), 'ובכן, הכנסות עלו בכל שנה מאז 2022'), 'live')
})

test('a re-processed transcript that moved the line renders DRIFTED, not live', () => {
  // The anchor still RESOLVES — to a different sentence. This is the entire
  // reason source_quote is stored: without it this case is indistinguishable
  // from a correct citation, which is the "plausible-looking, not absent"
  // failure the app rules keep filing.
  assert.equal(citationState(block(), 'שאלה לגבי המרווח התפעולי'), 'drifted')
})

test('reflowed whitespace is not drift', () => {
  assert.equal(citationState(block(), 'הכנסות   עלו\n בכל שנה, כן'), 'live')
})

test('a block with no quote snapshot cannot be judged drifted', () => {
  // Nothing to compare against, so it is live while it resolves. Only quote
  // blocks are required to carry a snapshot, and the DB enforces that.
  assert.equal(citationState(block({ source_quote: null }), 'anything'), 'live')
  assert.equal(citationState(block({ source_quote: null }), null), 'absent')
})

// ── Derived labels ───────────────────────────────────────────────────────────

test('the avatar initial survives an emoji and a Hebrew letter', () => {
  // Naive name[0] splits a surrogate pair and renders a replacement glyph.
  assert.equal(workspaceInitial('⚓ Shipping scan'), '⚓')
  assert.equal(workspaceInitial('תגבור — הפרטה'), 'ת')
  assert.equal(workspaceInitial('Qualitau'), 'Q')
  assert.equal(workspaceInitial('   '), '+')
  assert.equal(workspaceInitial(''), '+')
})

test('a workspace over several companies says so rather than naming one', () => {
  assert.equal(deriveCompany([], en), en.workspace.companyNone)
  assert.equal(deriveCompany(['Tigbur Group'], en), 'Tigbur Group')
  assert.equal(deriveCompany(['Tigbur Group', 'Tigbur Group'], en), 'Tigbur Group')
  assert.equal(deriveCompany(['Tigbur Group', 'Qualitau', 'ZIM'], en), '3 companies')
  // A source with no company attached must not be counted as one.
  assert.equal(deriveCompany(['Tigbur Group', ''], en), 'Tigbur Group')
})

test('the source count inflects at one in BOTH locales', () => {
  // "1 sources" / "1 מקורות" would ship straight to the UI.
  assert.equal(deriveSub(1, en), en.workspace.sourceOne)
  assert.equal(deriveSub(1, he), he.workspace.sourceOne)
  assert.equal(deriveSub(0, en), '0 sources')
  assert.equal(deriveSub(4, en), '4 sources')
  assert.equal(deriveSub(4, he), '4 מקורות')
})

// ── The display shape ────────────────────────────────────────────────────────

test('presentWorkspace derives every label and stores none', () => {
  const now = new Date('2026-08-03T12:00:00.000Z')
  const w = presentWorkspace(
    row(),
    [item(), item({ id: 'i2', is_open: true })],
    ['Tigbur Group'],
    now,
    'en',
    en
  )

  assert.equal(w.id, 'w1')
  assert.equal(w.name, 'תגבור — הפרטה')
  assert.equal(w.docTitle, 'מה אנחנו יודעים')
  assert.equal(w.company, 'Tigbur Group')
  assert.equal(w.fileCount, 2)
  assert.equal(w.initial, 'ת')
  assert.equal(w.subtitle, 'Tigbur Group · 2 sources')
  assert.equal(w.updatedLabel, '2 hours ago')
})

test('a real workspace claims no agents and no actions', () => {
  // Agent execution is out of scope this chapter. Empty is the honest answer;
  // feeding the demo agent constants into a real row would put invented
  // findings on a page backed by the database.
  const w = presentWorkspace(row(), [item()], [], new Date(), 'en', en)
  assert.deepEqual(w.agents, [])
  assert.deepEqual(w.actions, [])
})

test('an open item survives into the display shape as `live`', () => {
  // This is the "must not open cold" fact making its way to the UI, which
  // initialises its open tabs from exactly this flag.
  const w = presentWorkspace(
    row(),
    [item({ id: 'a', is_open: false }), item({ id: 'b', is_open: true })],
    [],
    new Date(),
    'en',
    en
  )
  assert.deepEqual(
    w.files.map((f) => [f.id, f.live]),
    [
      ['a', false],
      ['b', true],
    ]
  )
})

test('both locales carry every key this module reads', () => {
  for (const k of ['companyNone', 'companyMany', 'sourceOne', 'sourceMany'] as const) {
    assert.equal(typeof en.workspace[k], 'string', `en.workspace.${k}`)
    assert.equal(typeof he.workspace[k], 'string', `he.workspace.${k}`)
  }
})
