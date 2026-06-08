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

test('normalize drops the metadata header before the first timestamp', () => {
  const withHeader = 'שיחת משקיעים — אמפא\nQ1 2026 | 2026-06-07\n\n## דברי הנהלה\n[00:00:00] מנחה:\nשלום לכולם'
  const out = normalize(withHeader)
  assert.ok(!out.includes('2026'), 'header date dropped')
  assert.ok(!out.includes('דברי'), 'section heading dropped')
  assert.ok(out.startsWith('שלום'), 'body kept')
})

test('normalize leaves header-less raw text intact (no timestamps)', () => {
  assert.equal(normalize('שלום לכולם וברוכים הבאים'), 'שלום לכולם וברוכים הבאים')
})

import { lcsGoldMatched, score } from './measure-core'

test('lcsGoldMatched marks which gold tokens the candidate reproduced', () => {
  const gold = ['א', 'ב', 'ג', 'ד']
  const cand = ['א', 'X', 'ג', 'ד']  // "ב" missing/substituted
  assert.deepEqual(lcsGoldMatched(cand, gold), [true, false, true, true])
})

test('score computes fixed / introduced / remaining vs gold', () => {
  const gold = 'שיעור התפוסה נותר תקין'
  const baseline = 'קישור התפוסה נותר תקין'   // 1 error: שיעור→קישור
  const fixedCand = 'שיעור התפוסה נותר תקין'   // corrected
  const brokeCand = 'שיעור התפוסה נותר שבור'   // fixed שיעור but broke תקין→שבור

  const good = score(baseline, fixedCand, gold)
  assert.equal(good.fixed, 1)
  assert.equal(good.introduced, 0)
  assert.equal(good.remaining, 0)

  const bad = score(baseline, brokeCand, gold)
  assert.equal(bad.fixed, 1)
  assert.equal(bad.introduced, 1)   // תקין was right in baseline, now wrong
})
