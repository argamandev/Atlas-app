import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shownPanes } from './panes'

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
