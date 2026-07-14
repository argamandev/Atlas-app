import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getAgentsPageData } from './data'

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
