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

// OBSERVED IN THE BROWSER, 2026-08-04, against the real model: with
// responseMimeType application/json, gemini-3.5-flash emitted a stray SECOND
// closing brace — `{ ... "toYear": 2019 }\n}\n` — which JSON.parse rejects
// outright. Every such request silently degraded to a keyword search. Trailing
// junk after a complete object must not cost the user their interpretation.
test('tolerates a stray trailing brace after a complete object', () => {
  const r = parseModelRequest('{\n "company": "תיגבור",\n "fromYear": 2019,\n "toYear": 2019\n}\n}\n', 'raw')
  assert.equal(r.interpreted, true)
  assert.equal(r.company, 'תיגבור')
  assert.equal(r.fromYear, 2019)
  assert.equal(r.toYear, 2019)
})

test('tolerates prose after the object', () => {
  const r = parseModelRequest('{"company":"Tigbur"}  Hope that helps!', 'raw')
  assert.equal(r.interpreted, true)
  assert.equal(r.company, 'Tigbur')
})

test('a brace inside a string value does not end the object early', () => {
  const r = parseModelRequest('{"company":"Ti{gbur","fromYear":2024}', 'raw')
  assert.equal(r.company, 'Ti{gbur')
  assert.equal(r.fromYear, 2024)
})

test('an escaped quote inside a value does not end the string early', () => {
  const r = parseModelRequest('{"company":"קבוצת תיגבור בע\\"מ"}', 'raw')
  assert.equal(r.company, 'קבוצת תיגבור בע"מ')
})

test('a JSON array is not an object and must not be read as one', () => {
  const r = parseModelRequest('[{"company":"Tigbur"}]', 'raw')
  assert.equal(r.interpreted, false)
  assert.equal(r.company, null)
})
