import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelObject, firstJsonObject, unfence } from './json'

test('a fenced object is read', () => {
  assert.deepEqual(modelObject('```json\n{"reply":"hi"}\n```'), { reply: 'hi' })
  assert.equal(unfence('```\n{"a":1}\n```'), '{"a":1}')
})

test('braces inside strings are not structure', () => {
  assert.deepEqual(modelObject('{"reply":"a } b {"}'), { reply: 'a } b {' })
  assert.equal(firstJsonObject('{"a":"\\""}'), '{"a":"\\""}')
})

// A PREAMBLE THAT HAPPENS TO CONTAIN BRACES IS STILL AN ANSWER.
//
// `firstJsonObject` commits to the first `{`, so committing to it once and
// giving up was enough to fail the whole turn — and a failed parse does not
// surface as an error here, it silently downgrades the analyst's request to a
// keyword search. This is the shape a chatty model actually produces.
test('a candidate that does not parse is stepped over, not surrendered to', () => {
  assert.deepEqual(modelObject('Here is the object {as asked}: {"reply":"ok"}'), { reply: 'ok' })
  assert.deepEqual(modelObject('{not json at all} then {"status":"ready"}'), { status: 'ready' })
  assert.equal(modelObject('{nothing} {here either}'), null)
})

test('an array is refused rather than unwrapped', () => {
  assert.equal(modelObject('[{"a":1}]'), null)
})

test('a truncated object is null, never a partial answer', () => {
  assert.equal(modelObject('{"reply":"cut off'), null)
  assert.equal(firstJsonObject('{"a":{"b":1}'), null)
})
