import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkByWords, parseCorrectionItems, isSafeCorrection, routeItems } from './correction'

test('chunkByWords groups words into N-word chunks', () => {
  const text = Array.from({ length: 10 }, (_, i) => `w${i}`).join(' ')
  const chunks = chunkByWords(text, 4)
  assert.equal(chunks.length, 3)
  assert.equal(chunks[0], 'w0 w1 w2 w3')
})

test('parseCorrectionItems reads items, defaults certainty, drops invalid', () => {
  const raw = JSON.stringify({ items: [
    { original: 'אישר', corrected: 'קשרי', kind: 'homophone', certainty: 'confident', reason: 'x' },
    { corrected: 'oops' },                         // no original -> dropped
    { original: '180%', kind: 'number', reason: 'לא הגיוני' }, // certainty defaults
  ] })
  const items = parseCorrectionItems(raw)
  assert.equal(items.length, 2)
  assert.equal(items[1].certainty, 'uncertain')
})

test('isSafeCorrection blocks long and multi-word balloon changes', () => {
  assert.equal(isSafeCorrection('אישר', 'קשרי'), true)
  assert.equal(isSafeCorrection('א', 'א '.repeat(20)), false)
})

test('routeItems applies confident word fixes, flags uncertain + all numbers', () => {
  const text = 'דרך אישר משקיעים והגענו ל180% מההכנסות עם אמפתי'
  const items = [
    { original: 'אישר', corrected: 'קשרי', kind: 'homophone', certainty: 'confident', reason: '' },
    { original: '180%', kind: 'number', certainty: 'confident', reason: 'מעל 100%' }, // number => still flagged, not changed
    { original: 'אמפתי', corrected: 'אמפא', kind: 'name', certainty: 'uncertain', reason: 'שם לא ודאי' },
  ] as const
  const r = routeItems(text, items as any)
  assert.ok(r.text.includes('קשרי משקיעים'), 'confident homophone applied')
  assert.ok(r.text.includes('180%'), 'number NOT changed')
  assert.ok(r.text.includes('אמפתי'), 'uncertain NOT changed')
  assert.equal(r.applied.length, 1)
  assert.equal(r.flags.length, 2) // the number + the uncertain name
  assert.ok(r.flags.some(f => f.text === '180%'))
})
