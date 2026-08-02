import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoReducer, type DemoState } from './reducer'

// The project cases are gone from this reducer as of 2026-08-02 — projects are
// real rows behind RLS now, covered by src/lib/projects/data.test.ts and the
// route/RLS verification. What remains here is the session-only surfaces.

const seed: DemoState = { agents: [], workspaces: [], docHtml: {} }

test('addWorkspace creates a file-less workspace so it lands in intake', () => {
  const next = demoReducer(seed, { type: 'addWorkspace', name: 'New workspace' })
  assert.equal(next.workspaces.length, 1)
  assert.equal(next.workspaces[0].files.length, 0)
})

test('addWorkspace never collides with an id already in state', () => {
  const a = demoReducer(seed, { type: 'addWorkspace', name: 'A' })
  const b = demoReducer(a, { type: 'addWorkspace', name: 'B' })
  assert.equal(b.workspaces.length, 2)
  assert.notEqual(b.workspaces[0].id, b.workspaces[1].id)
})

test('addAgent keeps the supplied fields and assigns an id', () => {
  const next = demoReducer(seed, {
    type: 'addAgent',
    agent: {
      name: 'watcher',
      ini: 'WA',
      domain: '',
      role: '',
      description: 'Watches the tender docket.',
      status: 'idle',
      scopeKind: 'Company',
      scopeTarget: 'Tigbur Group',
      done: false,
      task: '',
      out: '',
      when: 'just now',
      lead: '',
      findings: [],
    },
  })
  assert.equal(next.agents.length, 1)
  assert.equal(next.agents[0].name, 'watcher')
  assert.equal(next.agents[0].scopeTarget, 'Tigbur Group')
  assert.ok(next.agents[0].id.length > 0)
})

test('the reducer never mutates the state it was given', () => {
  const a = demoReducer(seed, { type: 'addWorkspace', name: 'A' })
  const before = JSON.stringify(a)
  demoReducer(a, { type: 'setDocHtml', workspaceId: a.workspaces[0].id, html: '<p>x</p>' })
  assert.equal(JSON.stringify(a), before)
})

test('setDocHtml is keyed per workspace', () => {
  const next = demoReducer(seed, {
    type: 'setDocHtml',
    workspaceId: 'ws-tigbur-privatization',
    html: '<p>hi</p>',
  })
  assert.equal(next.docHtml['ws-tigbur-privatization'], '<p>hi</p>')
  assert.equal(next.docHtml['ws-qualitau-q2'], undefined)
})
