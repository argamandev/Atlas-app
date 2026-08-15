import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SERVER_INCOMPLETE_CODES,
  TERMINAL_EVENTS,
  isIncompleteCode,
  isTerminal,
  parseChatEvent,
  STREAM_ENDED,
} from './protocol'
import { INCOMPLETE_COPY_KEY } from '@/lib/chat/incompleteCopy'

/**
 * THE DEFECT THIS FILE EXISTS FOR (08a.2), stated as a property rather than as
 * the shape of the old code.
 *
 * The incomplete-code vocabulary used to exist twice: as a TYPE in
 * `chat2/terminal.ts`, and as a hand-maintained RUNTIME array in `api/chat2.ts`
 * carrying the comment "Kept in sync with terminal.ts". Only the array was
 * consulted when parsing a frame off the wire.
 *
 * So adding a ninth code was a silent defect waiting to happen: the union
 * accepts it, the server emits it, both locales ship copy for it — and the
 * parser, not finding it in the other list, rewrites it to `stopped_unknown`.
 * `tsc` passes. The battery passes. The surface shows the generic sentence for a
 * code that was deliberately kept distinct (`terminal.ts` round 4 split the four
 * non-clean stops precisely so four different true things could be said).
 *
 * `protocol.ts` derives the type FROM the array, so the two cannot disagree.
 * That makes the drift unrepresentable rather than merely tested — but the
 * property below is what a reader actually cares about, and it would catch a
 * future re-introduction of a second list, which the derivation alone would not.
 */

test('every server code survives a round trip through the parser', () => {
  // The exact failure the old two-list shape produced: a real code silently
  // rewritten to the generic one. Asserted per code, not as a count.
  for (const code of SERVER_INCOMPLETE_CODES) {
    const event = parseChatEvent(JSON.stringify({ type: 'incomplete', code, reason: 'x' }))
    assert.ok(event, `code '${code}' did not parse at all`)
    assert.equal(event.type, 'incomplete')
    assert.equal(
      event.type === 'incomplete' ? event.code : null,
      code,
      `code '${code}' was rewritten by the parser — the drift this module removed has returned`
    )
  }
})

test('an unknown code still lands on the generic branch', () => {
  // The other direction, and it must stay true: a code this build does not know
  // must render SOMETHING, never fall through every branch and show nothing.
  const event = parseChatEvent(JSON.stringify({ type: 'incomplete', code: 'not_a_real_code', reason: '' }))
  assert.equal(event?.type === 'incomplete' ? event.code : null, 'stopped_unknown')
  assert.equal(isIncompleteCode('not_a_real_code'), false)
})

test('the copy map covers exactly the protocol vocabulary', () => {
  // The type system already forces `INCOMPLETE_COPY_KEY` to be exhaustive over
  // `ClientIncompleteCode`. This asserts the RUNTIME agreement too, because the
  // whole point of this slice is that a type and a value drifted apart once.
  const covered = Object.keys(INCOMPLETE_COPY_KEY).sort()
  const expected = [...SERVER_INCOMPLETE_CODES, 'stream_ended'].sort()
  assert.deepEqual(covered, expected)
})

test('the terminal set has not grown a fourth member', () => {
  // `done` and `incomplete` being distinct TYPES is the "impossible" tier of the
  // degradation law. A fourth terminal type is a protocol change that every
  // surface's persistence logic has to be re-read against, so it fails here
  // first rather than being discovered on screen.
  assert.deepEqual([...TERMINAL_EVENTS], ['done', 'incomplete', 'error'])
  assert.equal(isTerminal({ type: 'done' }), true)
  assert.equal(isTerminal({ type: 'incomplete' }), true)
  assert.equal(isTerminal({ type: 'error' }), true)
  assert.equal(isTerminal({ type: 'delta' }), false)
  assert.equal(isTerminal({ type: 'mode' }), false)
})

test('the synthesised ending is terminal and carries a client-only code', () => {
  // `stream_ended` is the one code the server cannot send by definition. If it
  // ever appeared in the server list, the server would be claiming to know its
  // own connection died.
  assert.equal(isTerminal(STREAM_ENDED), true)
  assert.equal(STREAM_ENDED.type === 'incomplete' ? STREAM_ENDED.code : null, 'stream_ended')
  assert.equal(isIncompleteCode('stream_ended'), false)
})

// ─── THE `grounding` FRAME (ticket 08b) ──────────────────────────────────────

test('a grounding frame parses with its source', () => {
  const e = parseChatEvent(
    JSON.stringify({
      type: 'grounding',
      state: 'truncated',
      source: { company: 'תיגבור', quarter: 'Q3 2025', transcriptId: 'abc' },
    })
  )
  assert.deepEqual(e, {
    type: 'grounding',
    state: 'truncated',
    source: { company: 'תיגבור', quarter: 'Q3 2025', transcriptId: 'abc' },
  })
})

test('an UNKNOWN state is dropped, never defaulted to "whole"', () => {
  // Defaulting would assert the flattering half of the only question this event
  // answers: the surface would say the call reached the model whole because the
  // wire said something this build cannot read. No claim beats a false one.
  for (const state of ['partial', undefined, 7, null]) {
    assert.equal(parseChatEvent(JSON.stringify({ type: 'grounding', state, source: null })), null, String(state))
  }
})

test('a grounding frame without a usable source still parses, with source null', () => {
  // The state is the honesty fact; the source is the citation chip. Losing the
  // chip must not cost the truncation notice.
  for (const source of [null, undefined, {}, 'nope', { company: 'x' }]) {
    const e = parseChatEvent(JSON.stringify({ type: 'grounding', state: 'whole', source })) as {
      source: unknown
    } | null
    assert.deepEqual(e?.source, null, JSON.stringify(source))
  }
})

test('the grounding frame is NOT terminal — it cannot end a turn', () => {
  assert.equal(isTerminal({ type: 'grounding' }), false)
})
