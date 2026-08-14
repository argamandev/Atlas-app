import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatMode, modeChanged, type ChatMode } from './mode'

// ─── chatMode — deterministic, never a classifier guess ──────────────────────

test('the mode is pinpoint exactly when a company is resolved', () => {
  assert.equal(chatMode({ companyId: '9f1c8b2e-0000-4000-8000-000000000001' }), 'pinpoint')
})

test('the mode is search when no company is resolved', () => {
  assert.equal(chatMode({ companyId: null }), 'search')
  assert.equal(chatMode({ companyId: undefined }), 'search')
  assert.equal(chatMode({}), 'search')
})

test('an empty-string company id is not a resolved company', () => {
  assert.equal(chatMode({ companyId: '' }), 'search')
})

test('the mode cannot depend on the question — there is no text input to depend on', () => {
  // The law (app.md, classifier-visible-failure): this decision must not rest on
  // natural language over an open vocabulary. `ModeFacts` has no `question`
  // field, so "guess the mode from the words" is unrepresentable rather than
  // merely discouraged (M3.3). This test pins the SHAPE, which is the part a
  // future edit would quietly widen.
  const scoped = { companyId: 'a0000000-0000-4000-8000-000000000001' }
  const unscoped = { companyId: null }
  assert.equal(chatMode(scoped), chatMode(scoped))
  assert.equal(chatMode(unscoped), chatMode(unscoped))
  assert.notEqual(chatMode(scoped), chatMode(unscoped))
  // One argument, and it is the scope. If this ever reads 2, someone added the
  // classifier input the law forbids.
  assert.equal(chatMode.length, 1)
})

// ─── modeChanged — what the loop emits a `mode` event for ────────────────────

test('the opening mode is always announced, and unchanged modes are not repeated', () => {
  const cases: Array<[ChatMode | null, ChatMode, boolean]> = [
    // `null` = nothing announced yet. The opening mode MUST go out, or a surface
    // renders its own default until the first resolve_company lands — and a
    // default is a guess.
    [null, 'search', true],
    [null, 'pinpoint', true],
    ['search', 'pinpoint', true], // resolve_company landed mid-turn
    ['pinpoint', 'search', true], // the company was cleared mid-turn
    ['search', 'search', false],
    ['pinpoint', 'pinpoint', false],
  ]
  for (const [prev, next, expected] of cases) {
    assert.equal(modeChanged(prev, next), expected, `${prev} → ${next}`)
  }
})
