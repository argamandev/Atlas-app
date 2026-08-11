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
  [
    'log-snapshot-copy-ok',
    bash('cp agent-memory/cross-cutting.md docs/archive/agent-memory-snapshots/2026-07-14/cross-cutting.md'),
    0,
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
  // --- everyday work stays free ---
  ['npm-test', bash('npm test'), 0],
  ['normal-grep', bash('grep -rn liveEdge src/lib'), 0],
]

let fail = 0
for (const [name, payload, expected] of CASES) {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify(payload) })
  const ok = r.status === expected
  if (!ok) fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}: exit=${r.status} expected=${expected}${ok ? '' : ' stderr=' + r.stderr}`
  )
}
rmSync(TMP, { recursive: true, force: true })

console.log(fail === 0 ? `ALL ${CASES.length} GATE TESTS PASS` : `${fail} FAILURES`)
process.exit(fail === 0 ? 0 : 1)
