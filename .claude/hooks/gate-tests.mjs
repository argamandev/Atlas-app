// Fire-test matrix for pre-bash-gate.mjs — run + EXTEND this on every hook change:
//   node .claude/hooks/gate-tests.mjs
// Covers: original block/allow set, the 2026-07-02 audit bypasses, and the
// atlas-reviewer round-2 findings (per-statement SQL, rmdir /s, MCP door).
// NB: forbidden phrases are split ('dr'+'op') so running/committing this file
// never trips the gate itself.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pre-bash-gate.mjs')

// ── Fixtures ─────────────────────────────────────────────────────────────────
// These used to be two absolute paths on the founder's disk — the supervisor's
// checkout and one lane's worktree. The gate no longer recognises a checkout by
// its address (it asks git whether the checkout is primary or linked), and those
// directories are being removed anyway, so the matrix builds the two shapes for
// real: a primary checkout, and a linked worktree of it.
//
// Three checkouts, because the gate distinguishes three situations: the PRIMARY
// checkout, a LINKED worktree on its own feature branch (the ordinary case), and a
// linked worktree that is sitting ON MAIN (the case the bare-`git push` rule exists
// for). Git will not check one branch out in two worktrees, so this needs three
// directories rather than two.
const TMP = mkdtempSync(path.join(os.tmpdir(), 'atlas-gate-'))
const PRIMARY = path.join(TMP, 'primary')
const LINKED = path.join(TMP, 'linked')
const ON_MAIN = path.join(TMP, 'onmain')
const NOT_A_REPO = path.join(TMP, 'loose')

const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr || r.stdout}`)
}
const ID = ['-c', 'user.email=gate@test', '-c', 'user.name=Gate Test']

mkdirSync(PRIMARY, { recursive: true })
mkdirSync(NOT_A_REPO, { recursive: true })
git(['init', '-b', 'feat/keep', PRIMARY], TMP)
writeFileSync(path.join(PRIMARY, 'seed.txt'), 'seed\n')
git(['add', '.'], PRIMARY)
git([...ID, 'commit', '-m', 'seed'], PRIMARY)
git(['worktree', 'add', '-b', 'feat/x', LINKED], PRIMARY)
git(['worktree', 'add', '-b', 'main', ON_MAIN], PRIMARY)

// An ALREADY-ARCHIVED log, so the "overwriting history is not archiving it" case is a real
// measurement rather than a path that happens not to exist. Without this the fixture answers
// "nothing exists here", every archive destination reads as a creation, and the overwrite
// branch is never exercised — a matrix measuring the shapes typed, not the rule (M1).
const ARCHIVED_LOG = path.join(PRIMARY, 'docs', 'archive', 'agent-memory-snapshots', '2026-07-14')
mkdirSync(ARCHIVED_LOG, { recursive: true })
writeFileSync(path.join(ARCHIVED_LOG, 'cross-cutting.md'), '[2026-07-14] frozen history\n')

// A STAND-IN ship gate for the merge door, and it is a stand-in on purpose.
//
// The hook's job at a merge is narrow: notice that this checkout is on main, work
// out which single branch is being merged, run the gate, and pass its verdict
// through. What the gate then DECIDES is the business of `src/lib/shipGate.test.ts`,
// which drives those rules through their failing cases directly. Copying the real
// script in here would need its whole lib and would measure the same rules twice
// while leaving the hook's own wiring — the ref parse, the on-main test, the
// fail-closed paths — measured by nothing.
//
// So the stub answers on the branch NAME, which lets the matrix prove the hook
// passed the right ref through and propagated the right exit code.
const gateStub = (dir) => {
  mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  writeFileSync(
    path.join(dir, 'scripts', 'ship-gate.mjs'),
    'process.stderr.write("stub gate: " + process.argv.join(" ") + "\\n")\n' +
      'process.exit(process.argv.includes("feat/blocked") ? 1 : 0)\n'
  )
}
gateStub(ON_MAIN)

// A separate repo that is ON MAIN and has NO gate script — the fail-closed path. It
// cannot be a worktree of PRIMARY, because git will not check main out twice.
const ON_MAIN_NOGATE = path.join(TMP, 'nogate')
mkdirSync(ON_MAIN_NOGATE, { recursive: true })
git(['init', '-b', 'main', ON_MAIN_NOGATE], TMP)
writeFileSync(path.join(ON_MAIN_NOGATE, 'seed.txt'), 'seed\n')
git(['add', '.'], ON_MAIN_NOGATE)
git([...ID, 'commit', '-m', 'seed'], ON_MAIN_NOGATE)

const bash = (command, cwd = PRIMARY) => ({ tool_name: 'Bash', tool_input: { command }, cwd })
const mcp = (tool, query) => ({ tool_name: tool, tool_input: { query }, cwd: LINKED })
const rail = (tool) => ({ tool_name: 'mcp__railway__' + tool, tool_input: {}, cwd: PRIMARY })
const DR = 'dr' + 'op',
  TR = 'trunc' + 'ate',
  D = 'de' + 'lete',
  U = 'up' + 'date',
  A = 'al' + 'ter'
const RM = 'rm -' + 'rf',
  RMD = 'rmdir ' + '/s /q',
  RESET = 'supabase db ' + 'reset'

const CASES = [
  // --- destructive SQL: block ---
  ['ddl-drop', bash(`echo ${DR} TABLE transcripts`), 2],
  ['ddl-truncate', bash(`${TR} quotes;`), 2],
  ['sql-delete-quoted', bash(`psql -c "${D} from users;"`), 2],
  ['sql-update-nowhere', bash(`psql -c "${U} transcripts set status=1"`), 2],
  ['sql-delete-where-smuggle', bash(`psql -c "${D} from tmp; select 1 where 1=1;"`), 2],
  ['sql-update-where-smuggle', bash(`psql -c "${U} t set x=1; select 1 where 1=1;"`), 2],
  ['db-reset', bash(`npx ${RESET}`, LINKED), 2],
  // --- destructive SQL: allow (additive / filtered / comments) ---
  ['sql-delete-where', bash(`psql -c "${D} from quotes where id=1;"`), 0],
  ['sql-update-where', bash(`psql -c "${U} t set x=1 where id=2;"`), 0],
  ['alter-add-then-comment-drop', bash(`psql -c "${A} table t add column c text; -- todo ${DR} later"`), 0],
  // --- MCP door ---
  ['mcp-drop', mcp('mcp__supabase__execute_sql', `${DR} TABLE quotes`), 2],
  ['mcp-migration-drop', mcp('mcp__supabase__apply_migration', `${A} TABLE t ${DR} COLUMN c`), 2],
  ['mcp-delete-nowhere', mcp('mcp__supabase__execute_sql', `${D} from quotes`), 2],
  [
    'mcp-create-table',
    mcp('mcp__supabase__apply_migration', 'CREATE TABLE documents (id uuid primary key)'),
    0,
  ],
  [
    'mcp-add-column',
    mcp('mcp__supabase__apply_migration', `${A} TABLE transcripts ADD COLUMN doc_id uuid`),
    0,
  ],
  ['mcp-select', mcp('mcp__supabase__execute_sql', 'select count(*) from transcripts'), 0],
  [
    'mcp-no-query-tool',
    { tool_name: 'mcp__supabase__list_tables', tool_input: { schemas: ['public'] }, cwd: PRIMARY },
    0,
  ],
  // --- Railway MCP door (default-deny; allowlist is empty until the real tool list is read) ---
  ['rail-var-get', rail('get_variables'), 2],
  ['rail-var-singular', rail('service_variable'), 2],
  ['rail-secret', rail('read_secret'), 2],
  ['rail-delete-service', rail('service_delete'), 2],
  ['rail-destroy-project', rail('project_destroy'), 2],
  ['rail-redeploy', rail('deployment_redeploy'), 2],
  // Not destructive, not a secret — still blocked, because default-deny is the point:
  // an unverified name has no business running just for looking harmless.
  ['rail-list-logs-unverified', rail('deployment_logs'), 2],
  ['rail-list-envs-unverified', rail('list_environments'), 2],
  // The matcher must survive a server named railway-mcp / railwayapp, not just "railway".
  ['rail-alt-server-name', { tool_name: 'mcp__railway-mcp__get_variables', tool_input: {}, cwd: PRIMARY }, 2],
  // Proves the allowlist is actually CONSULTED and the tool-name extraction works. Without this,
  // a broken name-strip would look identical to a working default-deny — and the breakage would
  // only surface later, as "the allowlist does nothing", by which time someone trusts it.
  ['rail-allowlist-is-reachable', rail('__gate_selftest__'), 0],
  // --- recursive deletes ---
  ['rm-src', bash(`${RM} src`), 2],
  ['rm-abs', bash(`${RM} C:/Users/Sagi/Desktop`), 2],
  ['rm-long-flags', bash('rm --recursive --force src'), 2],
  ['psh-flag-order', bash('Remove-Item -Force -Recurse src'), 2],
  ['rmdir-s-q-src', bash(`${RMD} src`), 2],
  ['rm-next', bash(`${RM} .next`), 0],
  ['rm-nodemodules', bash(`${RM} node_modules`, LINKED), 0],
  ['rmdir-safe-next', bash(`${RMD} .next`), 0],
  // --- secrets ---
  ['env-cat', bash('cat .env.local'), 2],
  ['env-redirect', bash('echo SECRET=1 > .env.local'), 2],
  ['env-node', bash("node -e \"console.log(require('fs').readFileSync('.env.local','utf8'))\""), 2],
  ['env-python', bash('python -c "print(open(\'.env\').read())"'), 2],
  ['env-xxd', bash('xxd .env.local'), 2],
  // --- git safety ---
  // Same protections as before the gate stopped hard-coding checkout paths: main is
  // pushed from the primary checkout only, and a worktree may push its own branch.
  // What changed is only how the gate tells the two apart, so these cases are the
  // regression evidence for that swap — they are run against real git fixtures.
  ['force-push', bash('git push --force origin main'), 2],
  ['worktree-push-main', bash('git push origin main', LINKED), 2],
  ['primary-push-main', bash('git push origin main'), 0],
  ['worktree-push-branch', bash('git push -u origin feat/x', LINKED), 0],
  ['worktree-bare-push-on-feature-branch', bash('git push', LINKED), 0],
  // Bare push with no explicit target, from a worktree sitting on main.
  ['worktree-bare-push-while-on-main', bash('git push', ON_MAIN), 2],
  // Documents pre-existing conservative behaviour rather than asserting it is ideal:
  // once a worktree is ON main, even an explicit feature-branch push is refused. That
  // is the gate as it has always been; this case exists so a future change to it is a
  // visible decision instead of a silent one.
  ['worktree-on-main-push-branch', bash('git push -u origin feat/other', ON_MAIN), 2],
  ['primary-bare-push', bash('git push', PRIMARY), 0],
  // FAILS CLOSED: a directory git knows nothing about is treated as a worktree, not
  // as the primary checkout. The old path constant behaved the same way for the same
  // input, and this is the direction an unknown must fail in.
  ['non-repo-push-main', bash('git push origin main', NOT_A_REPO), 2],
  // An ABSENT cwd is the sharpest version of the same case, and the one the first
  // draft of the git-based check got wrong: `execSync` with no cwd inherits the
  // HOOK's own directory, so the gate silently answered for the wrong checkout. The
  // old path constant read that as '' and blocked. These two keep it blocking.
  ['no-cwd-push-main', { tool_name: 'Bash', tool_input: { command: 'git push origin main' } }, 2],
  ['empty-cwd-push-main', { tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: '' }, 2],
  // --- append-only fleet logs ---
  ['log-truncate-redirect', bash('echo "[ts] ALERT x" > agent-memory/cross-cutting.md'), 2],
  ['log-truncate-queue', bash('echo hi > C:/Users/Sagi/Desktop/Atlas/agent-memory/ready-queue.md'), 2],
  ['log-set-content', bash('Set-Content agent-memory/cross-cutting.md "wiped"'), 2],
  ['log-out-file', bash('"x" | Out-File agent-memory/ready-queue.md'), 2],
  ['log-tee-truncate', bash('echo x | tee agent-memory/cross-cutting.md'), 2],
  ['log-sed-inplace', bash('sed -i "s/old/new/" agent-memory/ready-queue.md'), 2],
  [
    'log-writefilesync',
    bash(`node -e "require('fs').writeFileSync('agent-memory/cross-cutting.md','x')"`),
    2,
  ],
  ['log-append-ok', bash('echo "[ts] ALERT lane — msg" >> agent-memory/cross-cutting.md'), 0],
  [
    'log-append-queue-ok',
    bash('cat entry.txt >> C:/Users/Sagi/Desktop/Atlas/agent-memory/ready-queue.md'),
    0,
  ],
  [
    'log-appendfilesync-ok',
    bash(`node -e "require('fs').appendFileSync('agent-memory/ready-queue.md','x')"`),
    0,
  ],
  ['log-tee-append-ok', bash('echo x | tee -a agent-memory/cross-cutting.md'), 0],
  ['log-read-ok', bash('grep DECISION agent-memory/cross-cutting.md'), 0],
  ['log-tail-ok', bash('tail -20 agent-memory/ready-queue.md'), 0],
  // Archiving a log = CREATING a copy under docs/archive/, which is always a new dated
  // folder. This case used to name 2026-07-14, a folder that already holds a frozen copy;
  // it now names a new one, because "snapshot into a folder that already has one" is an
  // overwrite of history and is asserted as blocked two cases below.
  [
    'log-snapshot-copy-ok',
    bash('cp agent-memory/cross-cutting.md docs/archive/agent-memory-snapshots/2026-08-20/cross-cutting.md'),
    0,
  ],
  [
    'log-snapshot-overwrite-existing',
    bash('cp other.md docs/archive/agent-memory-snapshots/2026-07-14/cross-cutting.md'),
    2,
  ],
  [
    'log-heredoc-append-ok',
    bash('cat >> agent-memory/cross-cutting.md << EOF\n[ts] MERGE supervisor — x\nEOF'),
    0,
  ],
  ['log-rm', bash('rm agent-memory/cross-cutting.md'), 2],
  ['log-remove-item', bash('Remove-Item agent-memory/ready-queue.md'), 2],
  ['log-del', bash('del agent-memory\\ready-queue.md'), 2],
  ['log-cp-onto', bash('cp other.md agent-memory/cross-cutting.md'), 2],
  ['log-mv-onto', bash('mv rewritten.md C:/Users/Sagi/Desktop/Atlas/agent-memory/ready-queue.md'), 2],
  ['log-dd-onto', bash('dd if=/dev/zero of=agent-memory/ready-queue.md'), 2],
  ['log-noclobber', bash('echo x >| agent-memory/cross-cutting.md'), 2],
  ['log-tee-long-append-ok', bash('echo x | tee --append agent-memory/cross-cutting.md'), 0],
  ['log-cp-from-then-work-ok', bash('cp agent-memory/ready-queue.md /tmp/q.md && wc -l /tmp/q.md'), 0],
  // --- COLLISIONS.md, the log that replaced cross-cutting.md when the fleet retired ---
  // The cases above are kept verbatim rather than renamed: the fleet's two logs still
  // exist verbatim under docs/archive/, and history is the thing that must not be
  // rewritten. These add the new name at the new location — the repo root, which is why
  // every one of them is written the way the path is actually written now.
  ['collisions-truncate-redirect', bash('echo "[2026-08-12] MIGRATION 022" > COLLISIONS.md'), 2],
  ['collisions-truncate-dotslash', bash('echo x > ./COLLISIONS.md'), 2],
  ['collisions-set-content', bash('Set-Content COLLISIONS.md "wiped"'), 2],
  ['collisions-out-file', bash('"x" | Out-File COLLISIONS.md'), 2],
  ['collisions-tee-truncate', bash('echo x | tee COLLISIONS.md'), 2],
  ['collisions-sed-inplace', bash('sed -i "s/old/new/" COLLISIONS.md'), 2],
  ['collisions-writefilesync', bash(`node -e "require('fs').writeFileSync('COLLISIONS.md','x')"`), 2],
  ['collisions-rm', bash('rm COLLISIONS.md'), 2],
  ['collisions-remove-item', bash('Remove-Item ./COLLISIONS.md'), 2],
  ['collisions-dd-onto', bash('dd if=/dev/zero of=COLLISIONS.md'), 2],
  ['collisions-noclobber', bash('echo x >| COLLISIONS.md'), 2],
  ['collisions-cp-onto', bash('cp other.md COLLISIONS.md'), 2],
  ['collisions-mv-onto', bash('mv rewritten.md ./COLLISIONS.md'), 2],
  ['collisions-append-ok', bash('echo "[2026-08-12] MIGRATION 022 — additive" >> COLLISIONS.md'), 0],
  ['collisions-tee-append-ok', bash('echo x | tee -a ./COLLISIONS.md'), 0],
  ['collisions-appendfilesync-ok', bash(`node -e "require('fs').appendFileSync('COLLISIONS.md','x')"`), 0],
  ['collisions-read-ok', bash('grep MIGRATION COLLISIONS.md'), 0],
  ['collisions-archive-copy-ok', bash('cp COLLISIONS.md docs/archive/COLLISIONS-2026-08.md'), 0],
  // The near-miss the old destination pattern let through: it required the literal
  // `agent-memory/` prefix, so the ordinary way to write a repo-root path walked past it.
  ['log-cp-onto-dotslash', bash('cp other.md ./cross-cutting.md'), 2],
  // --- the docs/archive/ hatch, and the hole its first version opened ---
  // Found by cold review, reproduced, and fixed: the hatch matched `docs/archive/` as a
  // SUBSTRING of the raw destination, so anything merely containing the prefix was
  // exempted regardless of where the bytes actually landed. Three traversal shapes all
  // exited 0. These cases exist because the previous eighteen measured the shapes that
  // were typed, not the branch that was added (M1).
  ['archive-hatch-traversal-up2', bash('cp evil.md docs/archive/../../COLLISIONS.md'), 2],
  ['archive-hatch-traversal-up1', bash('cp evil.md ./docs/archive/../COLLISIONS.md'), 2],
  ['archive-hatch-traversal-mid', bash('cp evil.md docs/archive/x/../../COLLISIONS.md'), 2],
  // Overwriting history is not archiving it. This file exists, and settings.json denies
  // Edit/Write on the very same path — two doors must not disagree about one file.
  [
    'archive-hatch-overwrite-existing',
    bash('mv evil.md ./docs/archive/agent-memory-snapshots/2026-07-14/cross-cutting.md'),
    2,
  ],
  // CREATING a new copy under docs/archive/ is the legitimate case the hatch is for.
  [
    'archive-hatch-new-file-ok',
    bash('cp COLLISIONS.md docs/archive/agent-memory-snapshots/2026-99-99-new/cross-cutting.md'),
    0,
  ],
  // No cwd, no answer: the hatch cannot resolve a path, so it must not grant an exemption.
  [
    'archive-hatch-no-cwd',
    { tool_name: 'Bash', tool_input: { command: 'cp evil.md docs/archive/x/cross-cutting.md' } },
    2,
  ],
  // --- the merge door: the ship gate (ticket 03) ---
  // Each blocking case carries the phrase it must block FOR. Exit 2 on its own is a
  // weak measurement here: every one of these commands could block for a reason that
  // has nothing to do with the merge door, and the matrix would read that as proof the
  // door works (M1).
  ['merge-to-main-gate-passes', bash('git merge --no-ff feat/ok', ON_MAIN), 0],
  ['merge-to-main-gate-fails', bash('git merge --no-ff feat/blocked', ON_MAIN), 2, /ship gate refused/],
  // -m's value is a message, not a ref. Parsed wrongly, the gate judges "shipping" and
  // the real branch walks through unexamined.
  [
    'merge-to-main-message-is-not-a-ref',
    bash('git merge --no-ff -m "shipping feat/blocked" feat/blocked', ON_MAIN),
    2,
    /ship gate refused/,
  ],
  // A bare `git merge` with a MERGE_HEAD present CONCLUDES a merge onto main. Zero refs
  // is the shape that would otherwise walk straight past the door.
  ['merge-to-main-no-ref', bash('git merge', ON_MAIN), 2, /0 source refs/],
  ['merge-to-main-octopus', bash('git merge feat/a feat/b', ON_MAIN), 2, /2 source refs/],
  // Step 2 of the ritual: origin/main INTO the feature branch. Nothing lands in that
  // direction, and gating it would make the ritual impossible to perform.
  ['merge-into-feature-branch-ok', bash('git merge origin/main', LINKED), 0],
  ['merge-abort-ok', bash('git merge --abort', ON_MAIN), 0],
  ['merge-continue-ok', bash('git merge --continue', ON_MAIN), 0],
  // The hatch: a stated reason, in the command, so it lands in the transcript.
  [
    'merge-override-ok',
    bash(
      'ATLAS_SHIP_OVERRIDE="a revert of a bad merge, nothing new lands" git merge --no-ff feat/blocked',
      ON_MAIN
    ),
    0,
  ],
  [
    'merge-override-too-short',
    bash('ATLAS_SHIP_OVERRIDE="fine" git merge --no-ff feat/blocked', ON_MAIN),
    2,
    /real reason/,
  ],
  // Fail closed: no gate script, and no cwd to find one with.
  ['merge-no-gate-script', bash('git merge --no-ff feat/ok', ON_MAIN_NOGATE), 2, /not there/],
  [
    'merge-no-cwd',
    { tool_name: 'Bash', tool_input: { command: 'git merge --no-ff feat/ok' } },
    2,
    /cannot tell/,
  ],
  // --- everyday work stays free ---
  ['npm-test', bash('npm test'), 0],
  ['normal-grep', bash('grep -rn liveEdge src/lib'), 0],
  ['normal-grep-mentions-merge', bash('grep -rn "git merge" docs'), 0],
]

let fail = 0
for (const [name, payload, expected, expectedStderr] of CASES) {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify(payload) })
  const stderr = String(r.stderr ?? '')
  // A blocking case that names the phrase it must block FOR is measuring the rule;
  // one that only checks exit=2 is measuring that SOMETHING objected.
  const reasonOk = !expectedStderr || expectedStderr.test(stderr)
  const ok = r.status === expected && reasonOk
  if (!ok) fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}: exit=${r.status} expected=${expected}` +
      `${expectedStderr ? ` reason=${reasonOk ? 'ok' : 'WRONG'}` : ''}${ok ? '' : ' stderr=' + stderr}`
  )
}
rmSync(TMP, { recursive: true, force: true })

console.log(fail === 0 ? `ALL ${CASES.length} GATE TESTS PASS` : `${fail} FAILURES`)
process.exit(fail === 0 ? 0 : 1)
