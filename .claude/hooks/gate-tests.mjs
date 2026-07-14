// Fire-test matrix for pre-bash-gate.mjs — run + EXTEND this on every hook change:
//   node .claude/hooks/gate-tests.mjs
// Covers: original block/allow set, the 2026-07-02 audit bypasses, and the
// atlas-reviewer round-2 findings (per-statement SQL, rmdir /s, MCP door).
// NB: forbidden phrases are split ('dr'+'op') so running/committing this file
// never trips the gate itself.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pre-bash-gate.mjs')
const MAIN = 'C:/Users/Sagi/Desktop/Atlas'
const LANE = 'C:/Users/Sagi/Desktop/Atlas-frontend'

const bash = (command, cwd = MAIN) => ({ tool_name: 'Bash', tool_input: { command }, cwd })
const mcp = (tool, query) => ({ tool_name: tool, tool_input: { query }, cwd: LANE })
const DR = 'dr' + 'op', TR = 'trunc' + 'ate', D = 'de' + 'lete', U = 'up' + 'date', A = 'al' + 'ter'
const RM = 'rm -' + 'rf', RMD = 'rmdir ' + '/s /q', RESET = 'supabase db ' + 'reset'

const CASES = [
  // --- destructive SQL: block ---
  ['ddl-drop', bash(`echo ${DR} TABLE transcripts`), 2],
  ['ddl-truncate', bash(`${TR} quotes;`), 2],
  ['sql-delete-quoted', bash(`psql -c "${D} from users;"`), 2],
  ['sql-update-nowhere', bash(`psql -c "${U} transcripts set status=1"`), 2],
  ['sql-delete-where-smuggle', bash(`psql -c "${D} from tmp; select 1 where 1=1;"`), 2],
  ['sql-update-where-smuggle', bash(`psql -c "${U} t set x=1; select 1 where 1=1;"`), 2],
  ['db-reset', bash(`npx ${RESET}`, LANE), 2],
  // --- destructive SQL: allow (additive / filtered / comments) ---
  ['sql-delete-where', bash(`psql -c "${D} from quotes where id=1;"`), 0],
  ['sql-update-where', bash(`psql -c "${U} t set x=1 where id=2;"`), 0],
  ['alter-add-then-comment-drop', bash(`psql -c "${A} table t add column c text; -- todo ${DR} later"`), 0],
  // --- MCP door ---
  ['mcp-drop', mcp('mcp__supabase__execute_sql', `${DR} TABLE quotes`), 2],
  ['mcp-migration-drop', mcp('mcp__supabase__apply_migration', `${A} TABLE t ${DR} COLUMN c`), 2],
  ['mcp-delete-nowhere', mcp('mcp__supabase__execute_sql', `${D} from quotes`), 2],
  ['mcp-create-table', mcp('mcp__supabase__apply_migration', 'CREATE TABLE documents (id uuid primary key)'), 0],
  ['mcp-add-column', mcp('mcp__supabase__apply_migration', `${A} TABLE transcripts ADD COLUMN doc_id uuid`), 0],
  ['mcp-select', mcp('mcp__supabase__execute_sql', 'select count(*) from transcripts'), 0],
  ['mcp-no-query-tool', { tool_name: 'mcp__supabase__list_tables', tool_input: { schemas: ['public'] }, cwd: MAIN }, 0],
  // --- recursive deletes ---
  ['rm-src', bash(`${RM} src`), 2],
  ['rm-abs', bash(`${RM} C:/Users/Sagi/Desktop`), 2],
  ['rm-long-flags', bash('rm --recursive --force src'), 2],
  ['psh-flag-order', bash('Remove-Item -Force -Recurse src'), 2],
  ['rmdir-s-q-src', bash(`${RMD} src`), 2],
  ['rm-next', bash(`${RM} .next`), 0],
  ['rm-nodemodules', bash(`${RM} node_modules`, LANE), 0],
  ['rmdir-safe-next', bash(`${RMD} .next`), 0],
  // --- secrets ---
  ['env-cat', bash('cat .env.local'), 2],
  ['env-redirect', bash('echo SECRET=1 > .env.local'), 2],
  ['env-node', bash('node -e "console.log(require(\'fs\').readFileSync(\'.env.local\',\'utf8\'))"'), 2],
  ['env-python', bash('python -c "print(open(\'.env\').read())"'), 2],
  ['env-xxd', bash('xxd .env.local'), 2],
  // --- git safety ---
  ['force-push', bash('git push --force origin main'), 2],
  ['lane-push-main', bash('git push origin main', LANE), 2],
  ['supervisor-push-main', bash('git push origin main'), 0],
  ['lane-push-branch', bash('git push -u origin feat/frontend-import', LANE), 0],
  // --- append-only fleet logs ---
  ['log-truncate-redirect', bash('echo "[ts] ALERT x" > agent-memory/cross-cutting.md'), 2],
  ['log-truncate-queue', bash('echo hi > C:/Users/Sagi/Desktop/Atlas/agent-memory/ready-queue.md'), 2],
  ['log-set-content', bash('Set-Content agent-memory/cross-cutting.md "wiped"'), 2],
  ['log-out-file', bash('"x" | Out-File agent-memory/ready-queue.md'), 2],
  ['log-tee-truncate', bash('echo x | tee agent-memory/cross-cutting.md'), 2],
  ['log-sed-inplace', bash('sed -i "s/old/new/" agent-memory/ready-queue.md'), 2],
  ['log-writefilesync', bash(`node -e "require('fs').writeFileSync('agent-memory/cross-cutting.md','x')"`), 2],
  ['log-append-ok', bash('echo "[ts] ALERT lane — msg" >> agent-memory/cross-cutting.md'), 0],
  ['log-append-queue-ok', bash('cat entry.txt >> C:/Users/Sagi/Desktop/Atlas/agent-memory/ready-queue.md'), 0],
  ['log-appendfilesync-ok', bash(`node -e "require('fs').appendFileSync('agent-memory/ready-queue.md','x')"`), 0],
  ['log-tee-append-ok', bash('echo x | tee -a agent-memory/cross-cutting.md'), 0],
  ['log-read-ok', bash('grep DECISION agent-memory/cross-cutting.md'), 0],
  ['log-tail-ok', bash('tail -20 agent-memory/ready-queue.md'), 0],
  ['log-snapshot-copy-ok', bash('cp agent-memory/cross-cutting.md docs/archive/agent-memory-snapshots/2026-07-14/cross-cutting.md'), 0],
  ['log-heredoc-append-ok', bash('cat >> agent-memory/cross-cutting.md << EOF\n[ts] MERGE supervisor — x\nEOF'), 0],
  // --- everyday work stays free ---
  ['npm-test', bash('npm test'), 0],
  ['normal-grep', bash('grep -rn liveEdge src/lib'), 0],
]

let fail = 0
for (const [name, payload, expected] of CASES) {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify(payload) })
  const ok = r.status === expected
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: exit=${r.status} expected=${expected}${ok ? '' : ' stderr=' + r.stderr}`)
}
console.log(fail === 0 ? `ALL ${CASES.length} GATE TESTS PASS` : `${fail} FAILURES`)
process.exit(fail === 0 ? 0 : 1)
