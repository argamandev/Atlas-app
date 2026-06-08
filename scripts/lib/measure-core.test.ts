import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, tokenize } from './measure-core'

test('normalize strips speaker headers, timestamps, punctuation', () => {
  const input = '[00:00:00] זוהר רדי:\nשלום, לכולם! האג"ח נותר AA.'
  const out = normalize(input)
  assert.ok(!out.includes('['), 'timestamp removed')
  assert.ok(!out.includes(':'), 'colon removed')
  assert.ok(!out.includes(','), 'comma removed')
  assert.ok(out.includes('שלום'))
})

test('tokenize splits on whitespace, drops empties', () => {
  assert.deepEqual(tokenize('  שלום   לכולם '), ['שלום', 'לכולם'])
})
