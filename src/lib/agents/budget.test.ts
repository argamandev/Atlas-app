import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RUN_BUDGET_CENTS, runBudget } from './budget'

test('runBudget is the founder-approved $1.00 per run', () => {
  assert.equal(RUN_BUDGET_CENTS, 100)
})

// The API takes MINOR UNITS as an integer STRING. A decimal form ("1.00") and a
// number (100) are both rejected by the API, and both are what a reader reaches
// for first — which is exactly why this is pinned rather than trusted.
test('runBudget serialises cents as an integer string, never a decimal or a number', () => {
  const b = runBudget()
  assert.equal(b.max_list_cost.amount, '100')
  assert.equal(typeof b.max_list_cost.amount, 'string')
  assert.ok(!b.max_list_cost.amount.includes('.'))
})

test('runBudget is USD, the only supported currency', () => {
  assert.equal(runBudget().max_list_cost.currency, 'USD')
})

test('runBudget is a limit budget', () => {
  assert.equal(runBudget().type, 'limit')
})
