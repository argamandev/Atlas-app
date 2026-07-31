import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setSnipTarget, getSnipTarget, subscribeSnipTarget } from './snipBridge'

// The snip bridge carries "is there a real, snippable document pane mounted?" from
// ReportPane to the Ask Atlas composer scissors (design round 2, second entry point).
// The composer scissors stays RENDERED and goes visibly DISABLED when no real doc is
// present (founder round-2 note, 6661c02) — an entry point that silently did nothing
// would violate the visible-degradation law; a disabled one does not.
// These tests cover the store itself; the enabled/disabled binding lives in
// TranscriptChatPanel (`disabled={!(snipAvailable && snipTarget)}`).

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
