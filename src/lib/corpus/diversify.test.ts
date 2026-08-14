import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diversifyByCompany } from './diversify'

/** Minimal stand-in — diversification reads only `companyId`; order is the caller's ranking. */
const chunk = (id: string, companyId: string) => ({ id, companyId })
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

test('diversifying is a no-op when every company already appears at most once', () => {
  const rows = [chunk('a', 'C1'), chunk('b', 'C2'), chunk('c', 'C3')]
  assert.deepEqual(ids(diversifyByCompany(rows, { limit: 20, perCompany: 3 })), ['a', 'b', 'c'])
})

test('a single company monopolising the head of the ranking is broken up', () => {
  // The measured defect (spec §2.5.6, eval case 04): a market-wide question
  // answered about one issuer, because similarity clusters.
  const rows = [
    chunk('a1', 'C1'),
    chunk('a2', 'C1'),
    chunk('a3', 'C1'),
    chunk('a4', 'C1'),
    chunk('b1', 'C2'),
    chunk('c1', 'C3'),
  ]
  const out = diversifyByCompany(rows, { limit: 6, perCompany: 2 })
  assert.deepEqual(ids(out), ['a1', 'b1', 'c1', 'a2'])
})

test('no company ever exceeds perCompany rows', () => {
  const rows = Array.from({ length: 10 }, (_, i) => chunk(`a${i}`, 'C1'))
  assert.equal(diversifyByCompany(rows, { limit: 20, perCompany: 3 }).length, 3)
})

test('limit is respected across all companies', () => {
  const rows = ['C1', 'C2', 'C3', 'C4', 'C5'].map((c, i) => chunk(`x${i}`, c))
  assert.equal(diversifyByCompany(rows, { limit: 3, perCompany: 2 }).length, 3)
})

test("the caller's ranking is preserved WITHIN a company", () => {
  // Diversification may only interleave companies. Promoting a worse-ranked row
  // above a better one from the same company would be trading one wrong answer
  // for another.
  const rows = [chunk('a1', 'C1'), chunk('a2', 'C1'), chunk('a3', 'C1'), chunk('b1', 'C2')]
  const out = diversifyByCompany(rows, { limit: 10, perCompany: 3 })
  assert.deepEqual(ids(out.filter((r) => r.companyId === 'C1')), ['a1', 'a2', 'a3'])
})

test('the single best-ranked row is still first', () => {
  // Companies enter the rotation in the order their BEST row appeared, so the
  // head of the list is never reordered away from the top result.
  const rows = [chunk('b1', 'C2'), chunk('a1', 'C1'), chunk('a2', 'C1')]
  assert.equal(diversifyByCompany(rows, { limit: 10, perCompany: 2 })[0].id, 'b1')
})

test('nothing is dropped when there is room for everything', () => {
  const rows = [chunk('a1', 'C1'), chunk('a2', 'C1'), chunk('b1', 'C2')]
  assert.equal(diversifyByCompany(rows, { limit: 10, perCompany: 5 }).length, 3)
})

test('an empty ranking diversifies to an empty ranking', () => {
  assert.deepEqual(diversifyByCompany([], { limit: 20, perCompany: 3 }), [])
})
