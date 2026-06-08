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

test('confident name is applied ONLY when it matches a provided entity (else flagged)', () => {
  const items = [
    { original: 'אמפתי', corrected: 'אמפא TLV', kind: 'name', certainty: 'confident', reason: '' },
    { original: 'שייקס רובר', corrected: 'שייקספיר', kind: 'name', certainty: 'confident', reason: '' },
  ] as any
  const r = routeItems('דיברנו על אמפתי ועל שייקס רובר', items, ['אמפא TLV'])
  assert.ok(r.text.includes('אמפא TLV'), 'name matching the entity list is applied')
  assert.ok(r.text.includes('שייקס רובר'), 'name NOT in the list is left unchanged (never guessed)')
  assert.ok(r.flags.some(f => f.text === 'שייקס רובר'), 'unmatched name is flagged instead')
})

test('flags spanning a whole clause (>8 words) are dropped (kept precise)', () => {
  const long = Array.from({ length: 11 }, (_, i) => `מ${i}`).join(' ')
  const items = [{ original: long, kind: 'homophone', certainty: 'uncertain', reason: '' }] as any
  const r = routeItems(`לפני ${long} אחרי`, items, [])
  assert.equal(r.flags.length, 0)
})

test('a name correction may not reduce word count (never drops "ראול")', () => {
  const items = [
    { original: 'ראול סרוגו', corrected: 'סרוגו', kind: 'name', certainty: 'confident', reason: '' },
  ] as any
  const r = routeItems('עובד עם ראול סרוגו שנים', items, ['סרוגו'])
  assert.ok(r.text.includes('ראול סרוגו'), 'word-dropping name fix is NOT applied')
  assert.ok(r.flags.some(f => f.text === 'ראול סרוגו'), 'it is flagged instead')
})

import { correctTranscript, buildCorrectionPrompt, attachFlags } from './correction'

test('buildCorrectionPrompt includes profile, entities, chunk and the JSON contract', () => {
  const p = buildCorrectionPrompt(
    { company: 'אמפא', business: 'נדל"ן מניב', quarter: 'Q1 2026', speakers: 'זוהר רדי (ceo)' },
    ['ToHa', 'אמפא TLV'],
    'דרך אישר משקיעים',
  )
  assert.ok(p.includes('אמפא'))
  assert.ok(p.includes('ToHa'))
  assert.ok(p.includes('דרך אישר משקיעים'))
  assert.ok(/items/.test(p) && /certainty/.test(p))
})

test('correctTranscript applies confident fixes from a fake GPT and collects flags', async () => {
  const fakeGpt = async () => JSON.stringify({ items: [
    { original: 'אישר משקיעים', corrected: 'קשרי משקיעים', kind: 'homophone', certainty: 'confident', reason: '' },
    { original: '180%', kind: 'number', certainty: 'confident', reason: 'מעל 100%' },
  ] })
  const profile = { company: 'אמפא', business: '', quarter: '', speakers: '' }
  const r = await correctTranscript('דרך אישר משקיעים ל180% מההכנסות', profile, [], fakeGpt)
  assert.ok(r.text.includes('קשרי משקיעים'))
  assert.ok(r.text.includes('180%'))
  assert.equal(r.flags.length, 1)
})

test('attachFlags puts each flag on the first line containing its text', () => {
  const lines = [{ id: 'L1', text: 'שורה אחת' }, { id: 'L2', text: 'יש כאן 180% מההכנסות' }] as any
  attachFlags(lines, [{ text: '180%', reason: 'בדיקה' }])
  assert.equal(lines[0].flags, undefined)
  assert.equal(lines[1].flags.length, 1)
  assert.equal(lines[1].flags[0].text, '180%')
})
