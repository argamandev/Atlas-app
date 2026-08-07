import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addPane, initialPanes, MAX_PANES, shownPanes } from './panes'

const base = { split: false, openTabs: ['a', 'b', '__doc'], multi: [], activeTab: 'a' }

test('single view shows exactly the active tab', () => {
  assert.deepEqual(shownPanes(base), ['a'])
})

test('multi-view shows the kept tabs, in TAB order', () => {
  // Order comes from openTabs, not from the order they were added to `multi` —
  // pane N must sit under tab N (founder, 2026-08-05).
  assert.deepEqual(shownPanes({ ...base, split: true, multi: ['__doc', 'a'] }), ['a', '__doc'])
})

test('a tab kept in multi but no longer open is not a pane', () => {
  assert.deepEqual(shownPanes({ ...base, split: true, multi: ['a', 'closed'] }), ['a'])
})

test('SPLIT ON WITH NOTHING KEPT FALLS BACK TO THE ACTIVE TAB — the screen never blanks', () => {
  assert.deepEqual(shownPanes({ ...base, split: true, multi: [] }), ['a'])
})

test('nothing open at all is nothing shown', () => {
  assert.deepEqual(shownPanes({ split: false, openTabs: [], multi: [], activeTab: '' }), [])
})

test('the working document counts as a pane like any other', () => {
  // It is what the shell asks about: mounted ⇒ splice into its live DOM,
  // not mounted ⇒ splice into the stored HTML.
  assert.equal(shownPanes({ ...base, activeTab: '__doc' }).includes('__doc'), true)
  assert.equal(shownPanes({ ...base, split: true, multi: ['a'] }).includes('__doc'), false)
})

// ── The three-pane cap (founder, 2026-08-06) ─────────────────────────────────

// ⚠ RENAMED AND RE-JUSTIFIED (cold review, 2026-08-08). This used to be called
// "even from a layout persisted before the cap" and its comment claimed the
// database still held four `is_open` rows that would open four columns. That is
// not reachable: `multi` starts `[]` and `split` starts `false` in
// WorkspaceShell, `is_open` seeds `openTabs` only, and a tab becomes a PANE just
// by going through the already-capped `addPane`. The test was fine; the reason
// attached to it was invented, which is worse than no reason — it is a false
// fact a future reader would build on.
//
// What it actually pins: the clamp is UNCONDITIONAL at the render chokepoint, so
// a future second writer of `multi` (the spec's `workspaces.layout`) cannot
// exceed the cap however it fills the array.
test('shownPanes clamps unconditionally, whatever it is handed', () => {
  const tabs = ['a', 'b', 'c', 'd', 'e']
  const shown = shownPanes({ split: true, openTabs: tabs, multi: tabs, activeTab: 'a' })
  assert.equal(shown.length, MAX_PANES)
  assert.deepEqual(shown, ['a', 'b', 'c'])
})

test('adding a fourth pane evicts the oldest rather than refusing', () => {
  // The invariant the shell's own comments defend: a file the user just opened
  // must APPEAR. Refusing at the cap would make the fourth click do nothing.
  assert.deepEqual(addPane(['a', 'b', 'c'], 'd'), ['b', 'c', 'd'])
})

test('adding a pane that is already shown changes nothing', () => {
  // Same array identity, so React does not re-render the row for a no-op.
  const m = ['a', 'b']
  assert.equal(addPane(m, 'b'), m)
})

test('turning multi-view on keeps the tab being read', () => {
  // Turning the control on must never take away the document you were looking
  // at when you reached for it.
  assert.deepEqual(initialPanes(['a', 'b', 'c', 'd', 'e'], 'a'), ['a', 'b', 'c'])
  assert.deepEqual(initialPanes(['a', 'b', 'c', 'd', 'e'], 'c'), ['c', 'd', 'e'])
  // The window slides back rather than returning fewer than three panes.
  assert.deepEqual(initialPanes(['a', 'b', 'c', 'd', 'e'], 'e'), ['c', 'd', 'e'])
  for (const active of ['a', 'b', 'c', 'd', 'e']) {
    assert.ok(initialPanes(['a', 'b', 'c', 'd', 'e'], active).includes(active))
  }
})

test('fewer open tabs than the cap all become panes', () => {
  assert.deepEqual(initialPanes(['a', 'b'], 'a'), ['a', 'b'])
  assert.deepEqual(initialPanes([], ''), [])
})
