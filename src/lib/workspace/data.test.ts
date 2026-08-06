import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getWorkspaces, getWorkspace, emptyWorkspace } from './data'

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

test('getWorkspace resolves a workspace by id and returns null for unknown ids', async () => {
  const tigbur = await getWorkspace('ws-tigbur-privatization')
  assert.ok(tigbur)
  assert.equal(tigbur!.files.length, 6)
  assert.equal(tigbur!.fileCount, 6)
  assert.deepEqual(tigbur!.agents, ['Doc reader', 'Tabulator'])
  assert.equal(await getWorkspace('does-not-exist'), null)
})

test('every workspace file declares a kind the tab bar can badge', async () => {
  const ws = await getWorkspaces()
  for (const w of ws) {
    for (const f of w.files) {
      assert.ok(['pdf', 'xlsx', 'slide'].includes(f.kind), `${f.name} has an unknown kind`)
      assert.ok(f.id.length > 0 && f.name.length > 0)
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// THE FABRICATED CONSTANTS ARE GONE, AND STAY GONE.
//
// Five tests stood here asserting the SHAPE of invented content — that six legal
// findings each cited a source, that every thread group had a thread, that the
// five run-steps were five. They were good tests of a thing that should not have
// been on screen, and deleting the data made them fail, which is the system
// working. The guard below replaces all five: it is the one assertion that still
// means something once the content is gone.
//
// Founder, 2026-08-06: *"remove the mislabbaled documents and the 'demo
// content'"*. A file-level check rather than a type-level one because the risk
// is REINTRODUCTION — nothing stops a later round from pasting a plausible
// findings array back in, and by then a real workspace is rendering it.
// ─────────────────────────────────────────────────────────────────────────────
test('the workspace data module carries no fabricated agent, thread, activity or legal content', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'workspace', 'data.ts'), 'utf8')
  for (const banned of [
    'WS_THREADS',
    'WS_THREAD_GROUPS',
    'WS_AGENT_PROFILES',
    'WS_SESSIONS',
    'workspaceSessions',
    'LEGAL_FINDINGS',
    'LEGAL_AREAS',
    'LEGAL_STEPS',
    'LEGAL_SEVERITY_STYLE',
  ]) {
    assert.ok(
      !new RegExp(`export (const|function) ${banned}\\b`).test(src),
      `${banned} is back — it renders invented content inside a workspace holding real filings`
    )
  }
})

test('the workspace shell renders no demo banner, because nothing under it is demo', () => {
  // The banner was honest while the shelf was stubbed. It stopped being honest
  // the moment a real MAYA filing rendered underneath it.
  const shell = readFileSync(
    join(process.cwd(), 'src', 'components', 'workspace', 'WorkspaceShell.tsx'),
    'utf8'
  )
  assert.ok(!/<DemoBanner\b/.test(shell), 'the workspace shell is showing a demo banner again')
})

test('emptyWorkspace has no files so a new workspace lands in intake', () => {
  const w = emptyWorkspace('new-workspace-1', 'New workspace')
  assert.equal(w.files.length, 0)
  assert.equal(w.fileCount, 0)
  assert.deepEqual(w.agents, [])
  assert.deepEqual(w.actions, [])
})
