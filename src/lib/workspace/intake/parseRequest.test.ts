import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseModelRequest } from './parseRequest'

test('reads a well-formed answer', () => {
  const r = parseModelRequest(
    '{"company":"תיגבור","fromYear":2024,"toYear":2026,"kinds":["transcript","document"]}',
    'raw text'
  )
  assert.equal(r.company, 'תיגבור')
  assert.equal(r.fromYear, 2024)
  assert.equal(r.toYear, 2026)
  assert.deepEqual(r.kinds, ['transcript', 'document'])
  assert.equal(r.interpreted, true)
})

test('survives the model fencing its JSON in markdown', () => {
  const r = parseModelRequest('```json\n{"company":"Tigbur"}\n```', 'raw')
  assert.equal(r.company, 'Tigbur')
  assert.equal(r.interpreted, true)
})

// THE HONESTY CASE: an unparseable answer must not silently become "no filters",
// because an empty filter set matches the WHOLE corpus — which would render as
// "here is what I found for you" over what was really a failure to understand.
test('falls back to the raw sentence and says it did NOT interpret', () => {
  const r = parseModelRequest('I think you want Tigbur reports!', 'תיגבור דוחות')
  assert.equal(r.interpreted, false)
  assert.equal(r.text, 'תיגבור דוחות')
  assert.equal(r.company, null)
})

test('treats an empty model answer as uninterpreted, not as no filters', () => {
  const r = parseModelRequest('', 'תיגבור')
  assert.equal(r.interpreted, false)
  assert.equal(r.text, 'תיגבור')
})

test('ignores nonsense field types rather than trusting them', () => {
  const r = parseModelRequest('{"company":42,"fromYear":"soon","kinds":"all"}', 'raw')
  assert.equal(r.company, null)
  assert.equal(r.fromYear, null)
  assert.equal(r.kinds, null)
})

test('drops unknown kinds and reports null rather than an empty list', () => {
  // `kinds: []` must not mean "match nothing" — findSources reads null as
  // "no preference", and an empty array would silently return zero results.
  const r = parseModelRequest('{"kinds":["slidedeck"]}', 'raw')
  assert.equal(r.kinds, null)
})

test('swaps a reversed year range instead of returning an empty window', () => {
  const r = parseModelRequest('{"fromYear":2026,"toYear":2024}', 'raw')
  assert.equal(r.fromYear, 2024)
  assert.equal(r.toYear, 2026)
})

test('refuses years outside a sane range', () => {
  const r = parseModelRequest('{"fromYear":12,"toYear":9999}', 'raw')
  assert.equal(r.fromYear, null)
  assert.equal(r.toYear, null)
})

test('a JSON array is not an object and must not be read as one', () => {
  const r = parseModelRequest('[{"company":"Tigbur"}]', 'raw')
  assert.equal(r.interpreted, false)
  assert.equal(r.company, null)
})
