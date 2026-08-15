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
    unknownCompanyFrom: null,
    sourceError: null,
    hasUnresolvedLine: false,
    hasReply: false,
    ...o,
  })
}

/**
 * THE TWO DEAD ENDS ARE NOT THE SAME SENTENCE.
 *
 * A typed name that matched nothing is answered with "pick it with @". A
 * company they ALREADY picked with `@`, whose row has no MAYA issuer id, must
 * NOT be — that advises the action that just failed. One state each, and the
 * copy for them is asserted to be different at the component's map, not here.
 */
test('a PICKED company that cannot be searched gets its own line, never the "use @" one', () => {
  assert.equal(
    pick({ unknownCompany: 'חברה בלי מנפיק', unknownCompanyFrom: 'pin' }),
    'pinned_company_unreachable'
  )
  assert.equal(pick({ unknownCompany: 'בז"א', unknownCompanyFrom: 'name' }), 'unknown_company')
  // An unknown company with no recorded source is treated as typed — the older
  // and safer of the two, since "@" is advice rather than a claim.
  assert.equal(pick({ unknownCompany: 'בז"א', unknownCompanyFrom: null }), 'unknown_company')
})

test('a named-but-unreachable company outranks every other caveat', () => {
  for (const sourceError of ALL_SOURCE_ERRORS) {
    assert.equal(
      pick({ unknownCompany: 'בז"א', unknownCompanyFrom: 'name', sourceError, hasUnresolvedLine: true, hasReply: true }),
      'unknown_company',
      `sourceError=${sourceError} must not displace the company answer`
    )
  }
})

test('an EMPTY company name is still a degradation, not silence', () => {
  // The falsy-value hole: `''` is a company that was named and not reached.
  assert.equal(pick({ unknownCompany: '', unknownCompanyFrom: 'name' }), 'unknown_company')
  assert.equal(pick({ unknownCompany: '', unknownCompanyFrom: 'pin' }), 'pinned_company_unreachable')
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
