import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setSnipTarget, getSnipTarget, subscribeSnipTarget } from './snipBridge'

// The snip bridge carries "is there a real, snippable document pane mounted?" from
// ReportPane to the Ask Atlas composer scissors (design round 2, second entry point).
// The composer scissors must be HIDDEN when no real doc is present — rendering an
// entry point that silently does nothing violates the visible-degradation law.

test('starts unavailable', () => {
  setSnipTarget(false) // normalize
  assert.equal(getSnipTarget(), false)
})

test('set + get round-trips', () => {
  setSnipTarget(true)
  assert.equal(getSnipTarget(), true)
  setSnipTarget(false)
  assert.equal(getSnipTarget(), false)
})

test('subscribers hear changes; unsubscribe stops them', () => {
  const seen: boolean[] = []
  const unsub = subscribeSnipTarget((v) => seen.push(v))
  setSnipTarget(true)
  setSnipTarget(false)
  unsub()
  setSnipTarget(true)
  assert.deepEqual(seen, [true, false])
  setSnipTarget(false)
})

test('same-value sets still notify (React external-store contract is idempotent reads, not deduped emits)', () => {
  const seen: boolean[] = []
  const unsub = subscribeSnipTarget((v) => seen.push(v))
  setSnipTarget(false)
  setSnipTarget(false)
  unsub()
  assert.deepEqual(seen, [false, false])
})
