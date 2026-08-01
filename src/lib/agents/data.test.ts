import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getAgentsPageData, emptyAgent, AGENT_SCOPE_KINDS } from './data'

test('getAgentsPageData returns agents, scheduled and finished stub sets', async () => {
  const d = await getAgentsPageData()
  assert.equal(d.agents.length, 2)
  assert.deepEqual(
    d.agents.map((a) => a.status),
    ['idle', 'idle']
  )
  assert.ok(
    d.agents[0].name.length > 0 && d.agents[0].domain.length > 0 && d.agents[0].description.length > 0
  )
  assert.equal(d.scheduled.length, 2)
  assert.ok(d.scheduled[0].scheduleLabel.length > 0)
  assert.equal(d.finished.length, 2)
  assert.ok(d.finished[0].title.length > 0 && d.finished[0].meta.length > 0)
})

test('every demo agent carries scoped, cited findings for the dock', async () => {
  const d = await getAgentsPageData()
  for (const a of d.agents) {
    assert.ok(AGENT_SCOPE_KINDS.includes(a.scopeKind), `${a.name} has an unknown scopeKind`)
    assert.ok(a.scopeTarget.length > 0, `${a.name} is scoped to nothing`)
    assert.ok(a.lead.length > 0, `${a.name} has no opening line`)
    assert.ok(a.findings.length > 0, `${a.name} has no findings`)
    for (const f of a.findings) {
      assert.ok(f.text.length > 0)
      // Findings wear the costume of sourced fact — the UI marks them, but the
      // source line must exist for that marking to sit on something.
      assert.ok(f.src.length > 0, `a ${a.name} finding has no src`)
    }
  }
})

test('finished tasks point at the agent whose dock they open', async () => {
  const d = await getAgentsPageData()
  const ids = new Set(d.agents.map((a) => a.id))
  for (const t of d.finished) {
    assert.ok(ids.has(t.agentId), `finished task ${t.id} points at an unknown agent`)
  }
})

test('emptyAgent is idle, unscoped and has found nothing', () => {
  const a = emptyAgent('new-agent-1', 'watcher')
  assert.equal(a.id, 'new-agent-1')
  assert.equal(a.name, 'watcher')
  assert.equal(a.ini, 'WA')
  assert.equal(a.status, 'idle')
  assert.equal(a.done, false)
  assert.deepEqual(a.findings, [])
})
