import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeTruncated, truncatedForPersist } from './messageState'

/**
 * The two halves of the round-three BLOCKER fix.
 *
 * The defect: a stream that broke partway left a message with REAL BUT PARTIAL
 * content and `errorKind: 'truncated'`. `errorKind` is view state, so the next
 * successful send persisted that partial text as an ordinary complete answer —
 * one reload and half an answer read as Atlas's whole reply, rendered through
 * Markdown mid-sentence.
 *
 * These functions were inline expressions in `ChatView` until a reviewer pointed
 * out that the identical class one field away (`sanitizeContextStatus`) had a
 * dedicated test file with 13 junk values while the BLOCKER fix had none — so a
 * later refactor to `!!m.truncated` would have failed nothing and quietly
 * restored the bug.
 */

test('a message that just broke is stored as truncated', () => {
  assert.equal(truncatedForPersist({ errorKind: 'truncated' }), true)
})

test('a message reopened from storage keeps the flag on the NEXT save', () => {
  // The round-trip case. Without this half, re-saving a thread that already
  // contains a truncated answer would silently clear the flag, so the defect
  // returns one exchange later instead of immediately.
  assert.equal(truncatedForPersist({ truncated: true }), true)
})

test('the other failure kinds are not truncation', () => {
  assert.equal(truncatedForPersist({ errorKind: 'save' }), false)
  assert.equal(truncatedForPersist({ errorKind: 'answer' }), false)
})

test('an ordinary complete answer is never marked truncated', () => {
  // The MIRROR failure: a false "this was cut off" on a good answer is its own
  // untrue-UI defect, not a safe default.
  assert.equal(truncatedForPersist({}), false)
  assert.equal(truncatedForPersist({ truncated: false }), false)
  assert.equal(truncatedForPersist({ truncated: null }), false)
})

test('only a literal true survives the read', () => {
  assert.equal(sanitizeTruncated(true), true)
})

test('a message written before the field existed is not truncated', () => {
  assert.equal(sanitizeTruncated(undefined), false)
  assert.equal(sanitizeTruncated(null), false)
})

test('nothing truthy-but-wrong reaches the render', () => {
  // The jsonb is stored verbatim by PATCH /api/conversations/[id] — proven by
  // round trip against the real route — so the blob can hold anything.
  for (const junk of ['true', 'truncated', 1, -1, {}, [], [true], 'yes', 0.5]) {
    assert.equal(
      sanitizeTruncated(junk),
      false,
      `${JSON.stringify(junk)} must not render a truncation notice`
    )
  }
})

// ─── The v2 door (ticket 07) ─────────────────────────────────────────────────
// The new backend reports a partial answer as an `incomplete` EVENT on a stream
// that then finishes normally — a successful HTTP response with no `errorKind`.
// Every signal the two original fields read therefore says "complete", so
// without this third source the round-three BLOCKER returns through the very
// machinery built to prevent it.

test('a v2 answer that ended incomplete is stored as truncated', () => {
  assert.equal(truncatedForPersist({ incomplete: 'length_limit' }), true)
  assert.equal(truncatedForPersist({ incomplete: 'round_trip_cap' }), true)
  assert.equal(truncatedForPersist({ incomplete: 'stream_ended' }), true)
})

test('a v2 answer that ended cleanly is not truncated', () => {
  // The mirror failure again: `done` turns carry no code, and marking them
  // partial would put a false "this was cut off" on a good answer.
  assert.equal(truncatedForPersist({ incomplete: null }), false)
  assert.equal(truncatedForPersist({ incomplete: undefined }), false)
})
