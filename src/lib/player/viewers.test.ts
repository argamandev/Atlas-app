import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addViewer, removeViewer, type ViewerCounts } from './viewers'

const counts = (): ViewerCounts => new Map<string, number>()

test('a call with one viewer is displayed', () => {
  const c = counts()
  assert.deepEqual(addViewer(c, 'call-a'), ['call-a'])
})

test('the last viewer leaving un-displays the call', () => {
  const c = counts()
  addViewer(c, 'call-a')
  assert.deepEqual(removeViewer(c, 'call-a'), [])
})

test('TWO panes on one call: the first to unmount does not un-display it', () => {
  // The bug this whole module exists for. Pane A and pane B both show call-a;
  // B closes; A is still on screen, so the chip must stay hidden.
  const c = counts()
  addViewer(c, 'call-a')
  addViewer(c, 'call-a')
  assert.deepEqual(removeViewer(c, 'call-a'), ['call-a'])
  assert.deepEqual(removeViewer(c, 'call-a'), [])
})

test('StrictMode mount → cleanup → mount ends at displayed, and one cleanup still clears it', () => {
  const c = counts()
  addViewer(c, 'call-a')
  removeViewer(c, 'call-a')
  assert.deepEqual(addViewer(c, 'call-a'), ['call-a'])
  assert.equal(c.get('call-a'), 1, 'the double-invoke must not leave a phantom viewer behind')
  assert.deepEqual(removeViewer(c, 'call-a'), [])
})

test('an unbalanced removal cannot go negative', () => {
  const c = counts()
  assert.deepEqual(removeViewer(c, 'never-added'), [])
  addViewer(c, 'call-a')
  removeViewer(c, 'call-a')
  removeViewer(c, 'call-a')
  // If the count had gone to -1, this add would leave it at 0 and the call would
  // be shown as "not displayed" while a pane is displaying it.
  assert.deepEqual(addViewer(c, 'call-a'), ['call-a'])
})

test('different calls are tracked independently', () => {
  const c = counts()
  addViewer(c, 'call-a')
  addViewer(c, 'call-b')
  assert.deepEqual(removeViewer(c, 'call-a'), ['call-b'])
})
