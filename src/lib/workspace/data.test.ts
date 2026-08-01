import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getWorkspaces,
  getWorkspace,
  emptyWorkspace,
  LEGAL_AREAS,
  LEGAL_FINDINGS,
  LEGAL_SEVERITY_STYLE,
  LEGAL_STEPS,
  WS_AGENT_PROFILES,
  WS_SESSIONS,
  WS_THREADS,
  WS_THREAD_GROUPS,
} from './data'

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

test('legal findings are severity-tagged and every one cites a source', () => {
  assert.equal(LEGAL_FINDINGS.length, 6)
  for (const f of LEGAL_FINDINGS) {
    assert.ok(['flag', 'medium', 'clear'].includes(f.k), `unknown severity on: ${f.text}`)
    assert.ok(f.text.length > 0)
    assert.ok(f.src.length > 0, `a legal finding has no src: ${f.text}`)
    assert.ok(LEGAL_SEVERITY_STYLE[f.k], `no style for severity ${f.k}`)
  }
})

test('the legal run has five steps and four scopeable areas', () => {
  assert.equal(LEGAL_STEPS.length, 5)
  assert.equal(LEGAL_AREAS.length, 4)
})

test('workspace threads cover every group the detail column renders', () => {
  for (const g of WS_THREAD_GROUPS) {
    assert.ok(
      WS_THREADS.some((t) => t.group === g),
      `no thread in group ${g}`
    )
  }
  for (const t of WS_THREADS) {
    assert.ok(t.title.length > 0 && t.snippet.length > 0 && t.when.length > 0)
  }
})

test('every deployed agent name has a profile the detail column can show', async () => {
  const ws = await getWorkspaces()
  for (const w of ws) {
    for (const name of w.agents) {
      assert.ok(WS_AGENT_PROFILES[name], `no profile for agent ${name}`)
    }
  }
})

test('session actions use only the four dot kinds', () => {
  for (const s of WS_SESSIONS) {
    assert.ok(s.label.length > 0)
    for (const a of s.items) {
      assert.ok(['open', 'build', 'agent', 'doc'].includes(a.kind), `unknown action kind ${a.kind}`)
    }
  }
})

test('emptyWorkspace has no files so a new workspace lands in intake', () => {
  const w = emptyWorkspace('new-workspace-1', 'New workspace')
  assert.equal(w.files.length, 0)
  assert.equal(w.fileCount, 0)
  assert.deepEqual(w.agents, [])
  assert.deepEqual(w.actions, [])
})
