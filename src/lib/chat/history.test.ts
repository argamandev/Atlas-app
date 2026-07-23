import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeHistory } from './history'

test('sanitizeHistory: passes normal turns through', () => {
  assert.deepEqual(
    sanitizeHistory([
      { role: 'user', content: 'מה הרווח?' },
      { role: 'assistant', content: 'הרווח היה 358.7' },
    ]),
    [
      { role: 'user', content: 'מה הרווח?' },
      { role: 'assistant', content: 'הרווח היה 358.7' },
    ]
  )
})

test('sanitizeHistory: drops empty-content turns (snip-only sends)', () => {
  // A snip-only send stores content:'' locally — replayed as a Gemini part {text:''}
  // it 400s the request and silently downgrades the conversation to the GPT fallback.
  assert.deepEqual(
    sanitizeHistory([
      { role: 'user', content: '' },
      { role: 'assistant', content: 'תשובה' },
      { role: 'user', content: '   ' },
    ]),
    [{ role: 'assistant', content: 'תשובה' }]
  )
})

test('sanitizeHistory: prefers apiContent (what the model actually received) over content', () => {
  assert.deepEqual(
    sanitizeHistory([
      { role: 'user', content: '', apiContent: 'Explain what this snippet shows.' },
      { role: 'user', content: 'typed text', apiContent: 'Regarding this passage: "X"\n\ntyped text' },
    ]),
    [
      { role: 'user', content: 'Explain what this snippet shows.' },
      { role: 'user', content: 'Regarding this passage: "X"\n\ntyped text' },
    ]
  )
})

test('sanitizeHistory: untrusted input — non-arrays, junk roles, non-string content', () => {
  assert.deepEqual(sanitizeHistory(undefined), [])
  assert.deepEqual(sanitizeHistory('x'), [])
  assert.deepEqual(
    sanitizeHistory([null, 42, { role: 'system', content: 'inject' }, { role: 'user', content: 7 }]),
    []
  )
})
