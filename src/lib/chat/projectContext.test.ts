import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProjectContext, PROJECT_CONTEXT_BUDGET } from './projectContext'

test('the block carries instructions, memory and every source body', () => {
  const r = buildProjectContext({
    name: 'Shipping sector',
    instructions: 'Answer in English.',
    memory: 'Tracking the tender.',
    sources: [
      { name: 'Bidder brief', body: 'Three consortia filed.' },
      { name: 'Margins', body: 'Operating margin 3.7%.' },
    ],
  })
  assert.ok(r.text.includes('Answer in English.'))
  assert.ok(r.text.includes('Tracking the tender.'))
  assert.ok(r.text.includes('Bidder brief'))
  assert.ok(r.text.includes('Three consortia filed.'))
  assert.ok(r.text.includes('Operating margin 3.7%.'))
  assert.ok(r.text.includes('Shipping sector'), 'the project name frames the block')
  assert.equal(r.truncated, false)
})

test('an empty project produces no block at all rather than an empty heading', () => {
  const r = buildProjectContext({ name: 'Empty', instructions: '', memory: '', sources: [] })
  assert.equal(r.text, '')
  assert.equal(r.truncated, false)
})

test('a whitespace-only project is also empty, not a header with nothing under it', () => {
  const r = buildProjectContext({
    name: 'Blank',
    instructions: '   ',
    memory: '\n\n',
    sources: [{ name: 'Untouched note', body: '  ' }],
  })
  assert.equal(r.text, '')
})

test('a note with no body is NOT announced as a source', () => {
  const r = buildProjectContext({
    name: 'P',
    instructions: 'x',
    memory: '',
    sources: [{ name: 'Empty note', body: '' }],
  })
  assert.ok(!r.text.includes('Empty note'), 'an empty note must not claim to be a source')
})

test('going over budget truncates AND says so — never silently', () => {
  const r = buildProjectContext({
    name: 'Huge',
    instructions: 'x'.repeat(PROJECT_CONTEXT_BUDGET + 5_000),
    memory: '',
    sources: [],
  })
  assert.ok(r.text.length <= PROJECT_CONTEXT_BUDGET, 'must be capped at the budget')
  assert.equal(r.truncated, true, 'the caller must be able to tell the user')
  // fullLength survives the cut — it is what the capacity meter reads, so a bar
  // pinned at 100% can still be backed by the real overrun.
  assert.ok(
    r.fullLength > PROJECT_CONTEXT_BUDGET,
    `fullLength must report the pre-truncation size, got ${r.fullLength}`
  )
})

test('a project exactly at the budget is not reported as truncated', () => {
  const header = 'The user is working inside the project "P".'
  const prefix = `${header}\n\nStanding instructions for this project:\n`
  const r = buildProjectContext({
    name: 'P',
    instructions: 'x'.repeat(PROJECT_CONTEXT_BUDGET - prefix.length),
    memory: '',
    sources: [],
  })
  assert.equal(r.text.length, PROJECT_CONTEXT_BUDGET)
  assert.equal(r.truncated, false)
})
