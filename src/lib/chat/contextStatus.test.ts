import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeContextStatus } from './messageState'

// Why this is load-bearing rather than defensive decoration:
//
// `chat_conversations.messages` is a jsonb blob, and PATCH /api/conversations/[id]
// stores what it is given (`Array.isArray(body.messages) ? body.messages : []`)
// without narrowing the shape of each message. Verified in the browser against
// the real routes: a message saved with `projectContext: 'notARealStatus'` came
// back out of the database with that exact string intact.
//
// So nothing between the request body and the rendered surface constrains this
// value except this function. Without it, whatever is in the blob decides
// whether a warning appears on an answer — and since the render treats
// "anything that is not 'failed'" as truncated, an arbitrary string would paint
// a degradation notice onto an answer that was never degraded.
//
// The field is also newer than the rows, so most stored messages have no
// `projectContext` at all. Absent must mean "the context was whole", never
// "unknown, so warn".

test('the two real statuses pass through', () => {
  assert.equal(sanitizeContextStatus('truncated'), 'truncated')
  assert.equal(sanitizeContextStatus('failed'), 'failed')
})

test('a message written before this field existed is not a degradation', () => {
  assert.equal(sanitizeContextStatus(undefined), null)
  assert.equal(sanitizeContextStatus(null), null)
})

test('nothing else reaches the render, whatever is in the blob', () => {
  for (const junk of [
    'notARealStatus',
    'TRUNCATED',
    ' truncated',
    'truncated ',
    '',
    0,
    1,
    true,
    false,
    {},
    [],
    ['truncated'],
    { status: 'truncated' },
  ]) {
    assert.equal(
      sanitizeContextStatus(junk),
      null,
      `${JSON.stringify(junk) ?? String(junk)} must not become a rendered notice`
    )
  }
})
