import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getProjects, emptyProject } from './data'

test('demo projects mirror the design seed', async () => {
  const projects = await getProjects()
  assert.equal(projects.length, 3)
  assert.deepEqual(
    projects.map((p) => p.name),
    ['Shipping sector', 'Q2 2026 earnings', 'Defense watch']
  )
  assert.equal(projects[0].pinned, true)
  assert.equal(projects[0].capacity, 14)
  assert.equal(projects[0].context.length, 3)
  assert.equal(projects[0].chats.length, 4)
})

test('context items carry a kind badge the UI can render', async () => {
  const [shipping] = await getProjects()
  assert.deepEqual(
    shipping.context.map((c) => c.kind),
    ['XLSX', 'PDF', 'TEXT']
  )
  for (const c of shipping.context) {
    assert.ok(c.name.length > 0)
    assert.ok(c.meta.length > 0)
  }
})

test('capacity stays within the meter range for every project', async () => {
  const projects = await getProjects()
  for (const p of projects) {
    assert.ok(p.capacity >= 0 && p.capacity <= 100, `${p.name} capacity out of range`)
  }
})

test('a project with no memory still reports when it was last updated', async () => {
  const projects = await getProjects()
  const defenseWatch = projects.find((p) => p.name === 'Defense watch')!
  assert.equal(defenseWatch.memory, '')
  assert.equal(defenseWatch.memWhen, 'Never updated')
})

test('emptyProject starts blank so a new project is visibly empty', () => {
  const p = emptyProject('p9', 'Untitled project')
  assert.equal(p.id, 'p9')
  assert.equal(p.name, 'Untitled project')
  assert.equal(p.instructions, '')
  assert.equal(p.memory, '')
  assert.equal(p.memWhen, 'Never updated')
  assert.equal(p.capacity, 0)
  assert.deepEqual(p.context, [])
  assert.deepEqual(p.chats, [])
})
