import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NdjsonEvents, parseChatEvent, type ClientChatEvent } from './chat2'

// ─────────────────────────────────────────────────────────────────────────────
// THE CLIENT HALF OF THE WIRE. The backend's whole honesty story (typed events,
// exactly one terminal, error text with no path into a delta) is worth nothing if
// the surface reading it can drop a frame or invent one — so the two properties
// tested hardest here are the ones a naive reader gets wrong:
//
//   1. A JSON object SPLIT ACROSS TCP CHUNKS must not be lost. `JSON.parse` on
//      each raw chunk is the obvious implementation and it fails on any answer
//      long enough to matter — silently, by throwing on a half-object that a
//      catch-and-continue would then swallow.
//   2. A stream that simply STOPS carries no terminal event, and that is not a
//      clean finish. It is the client-side mirror of the law loop.ts enforces.
// ─────────────────────────────────────────────────────────────────────────────

function feed(decoder: NdjsonEvents, ...chunks: string[]): ClientChatEvent[] {
  const out: ClientChatEvent[] = []
  for (const c of chunks) out.push(...decoder.push(c))
  out.push(...decoder.end())
  return out
}

test('whole lines in one chunk decode in order', () => {
  const events = feed(
    new NdjsonEvents(),
    '{"type":"mode","mode":"search","companyId":null}\n{"type":"delta","text":"שלום"}\n{"type":"done"}\n'
  )
  assert.deepEqual(events, [
    { type: 'mode', mode: 'search', companyId: null },
    { type: 'delta', text: 'שלום' },
    { type: 'done' },
  ])
})

test('an object SPLIT across chunks is buffered, not dropped', () => {
  // The exact failure a per-chunk JSON.parse produces. Split mid-key, mid-value
  // and mid-escape so no single boundary is being special-cased.
  const events = feed(
    new NdjsonEvents(),
    '{"type":"del',
    'ta","text":"ההכנסות ',
    'גדלו"}\n{"type":"do',
    'ne"}\n'
  )
  assert.deepEqual(events, [{ type: 'delta', text: 'ההכנסות גדלו' }, { type: 'done' }])
})

test('a delta whose TEXT contains a newline survives — the frame boundary is the JSON, not the prose', () => {
  // A real answer has line breaks in it. They are escaped as \n INSIDE the JSON
  // string, so the framing must split on raw newlines only.
  const events = feed(new NdjsonEvents(), '{"type":"delta","text":"שורה\\nשנייה"}\n{"type":"done"}\n')
  assert.deepEqual(events[0], { type: 'delta', text: 'שורה\nשנייה' })
})

test('a final line with no trailing newline is still delivered', () => {
  const events = feed(new NdjsonEvents(), '{"type":"delta","text":"x"}\n{"type":"done"}')
  assert.deepEqual(events.at(-1), { type: 'done' })
})

test('blank lines are skipped, not treated as failures', () => {
  const events = feed(new NdjsonEvents(), '\n{"type":"done"}\n\n')
  assert.deepEqual(events, [{ type: 'done' }])
})

// ─── What the decoder REFUSES to invent ──────────────────────────────────────

test('an unrecognised event type is dropped, never rendered', () => {
  // Forward compatibility in the safe direction: a future event this build does
  // not understand must not reach the surface as an object it will render the
  // wrong way. Dropping is safe because the TERMINAL events are a closed set and
  // a missing terminal is already handled as truncation.
  assert.equal(parseChatEvent('{"type":"telemetry","x":1}'), null)
})

test('a malformed line is dropped rather than throwing mid-stream', () => {
  assert.equal(parseChatEvent('{not json'), null)
  assert.equal(parseChatEvent('null'), null)
  assert.equal(parseChatEvent('"a string"'), null)
  assert.equal(parseChatEvent('[]'), null)
})

test('a delta with a non-string text is not a delta', () => {
  // The server never sends this. The point is that a surface which appends
  // `e.text` to a message must not be handed a number or an object to append.
  assert.equal(parseChatEvent('{"type":"delta","text":5}'), null)
  assert.equal(parseChatEvent('{"type":"delta"}'), null)
})

test('an incomplete with an unknown CODE is kept, but its code is normalised', () => {
  // The code drives which Hebrew sentence renders. An unknown one must degrade to
  // the generic case rather than falling through every branch and rendering
  // nothing — an `incomplete` that displays as a clean answer is the whole defect
  // class this stream exists to prevent.
  const e = parseChatEvent('{"type":"incomplete","code":"from_the_future","reason":"x"}')
  assert.equal(e?.type, 'incomplete')
  assert.equal((e as { code: string }).code, 'stopped_unknown')
})

test('a known incomplete code passes through verbatim', () => {
  const e = parseChatEvent('{"type":"incomplete","code":"length_limit","reason":"x"}')
  assert.equal((e as { code: string }).code, 'length_limit')
})

test('a mode event with a bogus mode is dropped', () => {
  assert.equal(parseChatEvent('{"type":"mode","mode":"vibes","companyId":null}'), null)
})

// ─── The missing terminal ────────────────────────────────────────────────────

test('a stream that ends with NO terminal event is reported as truncated', () => {
  const d = new NdjsonEvents()
  const events = feed(d, '{"type":"delta","text":"חצי משפט"}\n')
  assert.deepEqual(events.at(-1), {
    type: 'incomplete',
    code: 'stream_ended',
    reason: 'the connection ended before the answer finished',
  })
})

test('a stream that DID end in a terminal event gets no synthesised one', () => {
  const events = feed(new NdjsonEvents(), '{"type":"delta","text":"x"}\n{"type":"done"}\n')
  assert.equal(events.filter((e) => e.type === 'incomplete').length, 0)
  assert.equal(events.filter((e) => e.type === 'done').length, 1)
})

test('an error terminal also counts as an ending — no truncation is invented on top of it', () => {
  const events = feed(new NdjsonEvents(), '{"type":"error","message":"upstream 500"}\n')
  assert.deepEqual(events, [{ type: 'error', message: 'upstream 500' }])
})

test('an empty stream is truncated, not a silent success', () => {
  // Nothing at all arrived. Rendering that as a finished empty answer is the
  // "success with nothing" state the degradation law forbids.
  const events = feed(new NdjsonEvents())
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'incomplete')
})
