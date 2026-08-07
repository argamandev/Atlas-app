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

// ─────────────────────────────────────────────────────────────────────────────
// THE BIDI RULE, AS A TEST — occurrence 5 of .claude/rules/app.md's <bdi> rule,
// and the first one caught while it was still on screen rather than a day later.
//
// A confirmation heading is "Delete {name}?" with a name that is routinely
// Hebrew in an English UI or Latin in a Hebrew one. Substituting it into the
// string before rendering leaves ConfirmDialog nothing to isolate: `dir="auto"`
// resolves the WHOLE line from its first strong character, and a neutral that
// belongs to the NAME then gets re-attached to the sentence around it.
//
// PROVEN BY MEASUREMENT in the live page — 4 templates × 8 realistic names, 6
// of the 32 render differently. The clearest is the real workspace called
// `תיגבור קבוצה.`, whose own trailing period is dragged out of the name and
// parked against the "?" without <bdi>; `Q1 דוח` in the Hebrew locale is the
// mirror image. NOTE for anyone re-checking: a trailing YEAR is NOT an
// occurrence — "…לשנת 2021" looks orphaned next to an English verb and is
// simply correct, and calling it a bug from a screenshot is how this fix was
// first mis-diagnosed. Measure before believing your eyes (verify-app law 4).
//
// The fix is structural (template and value passed separately, value wrapped in
// <bdi>), so the guard is structural too: nobody may hand this dialog a
// pre-joined title again. A comment could not hold this — the comment that
// stood in ConfirmDialog asserted the opposite and was believed.
// ─────────────────────────────────────────────────────────────────────────────
test('no caller pre-substitutes a name into a confirmation title', () => {
  for (const file of [
    ['components', 'workspace', 'WorkspaceShell.tsx'],
    ['components', 'workspace', 'WorkspacePicker.tsx'],
  ]) {
    const src = readFileSync(join(process.cwd(), 'src', ...file), 'utf8')
    assert.equal(
      /Title\.replace\(\s*['"]\{name\}['"]/.test(src),
      false,
      `${file.join('/')} joins a name into a dialog title — pass \`titleValue\` so <bdi> can isolate it`
    )
  }
})

test('the confirmation dialog isolates its title value in a <bdi>', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'components', 'workspace', 'ConfirmDialog.tsx'), 'utf8')
  assert.match(src, /<bdi>\{titleValue\}<\/bdi>/, 'the title value is no longer bidi-isolated')
  assert.match(src, /title\.split\(['"]\{name\}['"]\)/, 'the title template is no longer split')
})

test('emptyWorkspace has no files so a new workspace lands in intake', () => {
  const w = emptyWorkspace('new-workspace-1', 'New workspace')
  assert.equal(w.files.length, 0)
  assert.equal(w.fileCount, 0)
  assert.deepEqual(w.agents, [])
  assert.deepEqual(w.actions, [])
})
