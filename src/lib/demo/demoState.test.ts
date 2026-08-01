import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoReducer, type DemoState } from './reducer'

const seed: DemoState = { projects: [], agents: [], workspaces: [], docHtml: {} }

test('addProject appends a project and returns a fresh id', () => {
  const next = demoReducer(seed, { type: 'addProject', name: 'Shipping sector' })
  assert.equal(next.projects.length, 1)
  assert.equal(next.projects[0].name, 'Shipping sector')
  assert.ok(next.projects[0].id.length > 0)
})

test('addProject never collides with an id already in state', () => {
  const withSeeded: DemoState = {
    ...seed,
    projects: [{ ...demoReducer(seed, { type: 'addProject', name: 'A' }).projects[0] }],
  }
  const next = demoReducer(withSeeded, { type: 'addProject', name: 'B' })
  assert.equal(next.projects.length, 2)
  assert.notEqual(next.projects[0].id, next.projects[1].id)
})

test('patchProject edits only the addressed project', () => {
  const a = demoReducer(seed, { type: 'addProject', name: 'A' })
  const b = demoReducer(a, { type: 'addProject', name: 'B' })
  const id = b.projects[0].id
  const next = demoReducer(b, { type: 'patchProject', id, patch: { instructions: 'x' } })
  assert.equal(next.projects[0].instructions, 'x')
  assert.equal(next.projects[1].instructions, '')
})

test('patchProject on an unknown id changes nothing', () => {
  const a = demoReducer(seed, { type: 'addProject', name: 'A' })
  const next = demoReducer(a, { type: 'patchProject', id: 'nope', patch: { memory: 'x' } })
  assert.deepEqual(next.projects, a.projects)
})

test('the reducer never mutates the state it was given', () => {
  const a = demoReducer(seed, { type: 'addProject', name: 'A' })
  const before = JSON.stringify(a)
  demoReducer(a, { type: 'patchProject', id: a.projects[0].id, patch: { memory: 'changed' } })
  assert.equal(JSON.stringify(a), before)
})

test('addWorkspace creates a file-less workspace so it lands in intake', () => {
  const next = demoReducer(seed, { type: 'addWorkspace', name: 'New workspace' })
  assert.equal(next.workspaces.length, 1)
  assert.equal(next.workspaces[0].files.length, 0)
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

test('setDocHtml is keyed per workspace', () => {
  const next = demoReducer(seed, {
    type: 'setDocHtml',
    workspaceId: 'ws-tigbur-privatization',
    html: '<p>hi</p>',
  })
  assert.equal(next.docHtml['ws-tigbur-privatization'], '<p>hi</p>')
  assert.equal(next.docHtml['ws-qualitau-q2'], undefined)
})
