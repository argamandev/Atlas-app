import { test } from 'node:test'
import assert from 'node:assert/strict'
import { companyOverviewStub } from './overview-stub'

test('stub carries the design demo identity extras', () => {
  const s = companyOverviewStub('any-company')
  assert.ok(s.irName.length > 0)
  assert.equal(s.indices.length, 2)
  assert.deepEqual(s.indices, ['TA-125', 'TA-90'])
})

test('reported quarter has a Hebrew quote, speaker role and a positive jump anchor', () => {
  const { reported } = companyOverviewStub('any-company')
  assert.ok(reported.quoteHe.length > 20)
  assert.ok(/[֐-׿]/.test(reported.quoteHe), 'quote must be Hebrew')
  assert.ok(reported.speakerRole.length > 0)
  assert.ok(reported.jumpSeconds > 0)
  assert.match(reported.quarter, /^Q[1-4] \d{4}$/)
})

test('announcements: at least 3 rows, valid tags, Hebrew titles, ISO dates', () => {
  const { announcements } = companyOverviewStub('any-company')
  assert.ok(announcements.length >= 3)
  for (const a of announcements) {
    assert.ok(['IMMEDIATE', 'TRANSACTION', 'FINANCIALS'].includes(a.tag))
    assert.ok(/[֐-׿]/.test(a.titleHe))
    assert.ok(!Number.isNaN(Date.parse(a.dateIso)))
  }
})
