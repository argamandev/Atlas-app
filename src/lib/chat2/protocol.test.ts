import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOCUMENT_CONTEXT_STATES,
  PROJECT_CONTEXT_STATES,
  SERVER_INCOMPLETE_CODES,
  TERMINAL_EVENTS,
  isDocumentContextState,
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
    assert.equal(
      parseChatEvent(JSON.stringify({ type: 'grounding', state, source: null })),
      null,
      String(state)
    )
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

// ─── THE `projectContext` FRAME (ticket 08c) ─────────────────────────────────

test('a projectContext frame parses all three states', () => {
  for (const state of ['ok', 'truncated', 'failed']) {
    assert.deepEqual(parseChatEvent(JSON.stringify({ type: 'projectContext', state })), {
      type: 'projectContext',
      state,
    })
  }
})

test('an unrecognised projectContext state is DROPPED, never defaulted to ok', () => {
  // Same law as the grounding frame one section up. Defaulting would make an
  // unparseable frame assert the flattering half of the only question this event
  // exists to answer — the surface would render a clean answer where the server
  // may have been saying the user's instructions never loaded. Dropped leaves the
  // surface with no claim rather than a false one.
  for (const state of ['whole', 'OK', '', null, undefined, 7, {}, true]) {
    assert.equal(
      parseChatEvent(JSON.stringify({ type: 'projectContext', state })),
      null,
      `should have dropped state: ${JSON.stringify(state)}`
    )
  }
  // And a frame with no state at all.
  assert.equal(parseChatEvent(JSON.stringify({ type: 'projectContext' })), null)
})

test('the projectContext frame is NOT terminal — it cannot end a turn', () => {
  assert.equal(isTerminal({ type: 'projectContext' }), false)
})

// ─── THE `documentContext` FRAME (ticket 08c-3) ──────────────────────────────

test('a documentContext frame parses all three states', () => {
  for (const state of ['ok', 'truncated', 'failed']) {
    assert.deepEqual(parseChatEvent(JSON.stringify({ type: 'documentContext', state })), {
      type: 'documentContext',
      state,
    })
  }
})

test('an unrecognised documentContext state is DROPPED, never defaulted to ok', () => {
  for (const state of ['whole', 'OK', '', null, undefined, 7, {}, true]) {
    assert.equal(
      parseChatEvent(JSON.stringify({ type: 'documentContext', state })),
      null,
      `should have dropped state: ${JSON.stringify(state)}`
    )
  }
  assert.equal(parseChatEvent(JSON.stringify({ type: 'documentContext' })), null)
})

test('the frame carries NOTHING the gate cannot make disagree', () => {
  // It held a `snips` count in the first draft, justified as "the surface can
  // tell four chips from three images". The gate REFUSES a malformed or excess
  // snip with a 400 rather than trimming, so that state is unreachable — the
  // count could never differ from what the client sent. A field that cannot
  // disagree is a stub filling a designed slot, and it reads as evidence of a
  // check nobody performs.
  const parsed = parseChatEvent(JSON.stringify({ type: 'documentContext', state: 'ok', snips: 3 }))
  assert.deepEqual(Object.keys(parsed!).sort(), ['state', 'type'])
})

test('the documentContext frame is NOT terminal — it cannot end a turn', () => {
  assert.equal(isTerminal({ type: 'documentContext' }), false)
})

test('the two context state lists are SEPARATE declarations, equal only today', () => {
  // Sharing one array would mean a state added for the project silently appearing
  // in the document parser and union, with copy for it existing on neither
  // surface. Same reasoning that keeps LIVE_BUDGET_CHARS and CALL_BUDGET_CHARS
  // apart: equal today by coincidence is not derived from one another.
  assert.notEqual(PROJECT_CONTEXT_STATES, DOCUMENT_CONTEXT_STATES)
  assert.equal(isDocumentContextState('ok'), true)
  assert.equal(isDocumentContextState('whole'), false)
})
