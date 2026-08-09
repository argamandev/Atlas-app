import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { cacheGet, cacheSet, cacheClear, catalogKey, CATALOG_TTL_MS } from './catalogCache'

beforeEach(() => cacheClear())

test('what went in comes back out', () => {
  cacheSet(catalogKey(1460, 2025), [{ period: 'Q1 2025' }])
  assert.deepEqual(cacheGet(catalogKey(1460, 2025)), [{ period: 'Q1 2025' }])
})

test('a key never stored is a miss, not an empty result', () => {
  // The difference matters: an empty array would be a CATALOG saying the company
  // filed nothing, which is the confident-and-wrong shape this repo keeps filing.
  assert.equal(cacheGet(catalogKey(1460, 2019)), null)
})

test('one issuer-year does not answer for another', () => {
  cacheSet(catalogKey(1460, 2025), ['tigbur-2025'])
  assert.equal(cacheGet(catalogKey(1460, 2024)), null)
  assert.equal(cacheGet(catalogKey(373, 2025)), null)
})

test('an entry past its TTL is a miss', () => {
  cacheSet('k', 1)
  const realNow = Date.now
  try {
    Date.now = () => realNow() + CATALOG_TTL_MS + 1
    assert.equal(cacheGet('k'), null)
  } finally {
    Date.now = realNow
  }
})

test('an entry inside its TTL still hits', () => {
  cacheSet('k', 1)
  const realNow = Date.now
  try {
    Date.now = () => realNow() + CATALOG_TTL_MS - 1_000
    assert.equal(cacheGet('k'), 1)
  } finally {
    Date.now = realNow
  }
})
