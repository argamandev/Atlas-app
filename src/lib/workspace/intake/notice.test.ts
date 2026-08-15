import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseIntakeNotice, type IntakeNotice } from './notice'
import type { IntakeResponse } from './types'

/**
 * Every combination the panel can be handed, swept — because this decides what
 * a screen SAYS, and 09b's review found the previous version of this decision
 * spread across three branches with no test on any of them.
 */
const ALL_SOURCE_ERRORS: IntakeResponse['sourceError'][] = [
  null,
  'maya_unreachable',
  'request_not_understood',
  'request_partly_understood',
]

function pick(o: Partial<Parameters<typeof chooseIntakeNotice>[0]>): IntakeNotice {
  return chooseIntakeNotice({
    unknownCompany: null,
    sourceError: null,
    hasUnresolvedLine: false,
    hasReply: false,
    ...o,
  })
}

test('a named-but-unreachable company outranks every other caveat', () => {
  for (const sourceError of ALL_SOURCE_ERRORS) {
    assert.equal(
      pick({ unknownCompany: 'בז"א', sourceError, hasUnresolvedLine: true, hasReply: true }),
      'unknown_company',
      `sourceError=${sourceError} must not displace the company answer`
    )
  }
})

test('an EMPTY company name is still a degradation, not silence', () => {
  // The falsy-value hole: `''` is a company that was named and not reached.
  assert.equal(pick({ unknownCompany: '' }), 'unknown_company')
})

test('each source error maps to its own line', () => {
  assert.equal(pick({ sourceError: 'maya_unreachable' }), 'maya_unreachable')
  assert.equal(pick({ sourceError: 'request_not_understood' }), 'request_not_understood')
  assert.equal(pick({ sourceError: 'request_partly_understood' }), 'request_partly_understood')
})

/**
 * The two request failures must never be confusable: one says the COMPANY could
 * not be worked out, the other says only the period/kind could not — and 09b
 * shipped a version where the pinned case said NOTHING AT ALL, so a pinned
 * request whose filter timed out searched a default year window and reported no
 * caveat. That is the case this pins.
 */
test('the pinned request failure is a DIFFERENT line, and is never silence', () => {
  const partly = pick({ sourceError: 'request_partly_understood' })
  assert.notEqual(partly, null, 'a failed interpretation must never be silent')
  assert.notEqual(partly, pick({ sourceError: 'request_not_understood' }))
})

test('the unresolved line is said only beside the model’s own sentence', () => {
  assert.equal(pick({ hasUnresolvedLine: true, hasReply: true }), 'unresolved')
  // With no reply the same words become the spoken turn — saying them here too
  // would print them twice.
  assert.equal(pick({ hasUnresolvedLine: true, hasReply: false }), null)
  assert.equal(pick({ hasUnresolvedLine: false, hasReply: true }), null)
})

test('nothing wrong, nothing said', () => {
  assert.equal(pick({}), null)
})
