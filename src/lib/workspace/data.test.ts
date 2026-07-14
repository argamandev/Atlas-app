import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getWorkspaces } from './data'

test('getWorkspaces returns the design demo workspaces with complete fields', async () => {
  const ws = await getWorkspaces()
  assert.equal(ws.length, 3)
  for (const w of ws) {
    assert.ok(w.id.length > 0)
    assert.ok(w.name.length > 0)
    assert.ok(w.subtitle.length > 0)
    assert.ok(w.fileCount >= 1)
    assert.ok(w.updatedLabel.length > 0)
    assert.ok(w.initial.length > 0)
  }
  assert.ok(ws[0].name.includes('Tigbur'))
})
