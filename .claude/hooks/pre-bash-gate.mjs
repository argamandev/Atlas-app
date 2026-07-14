#!/usr/bin/env node
// PreToolUse gate — deterministic safety. Exit 2 blocks the tool call; stderr explains why.
// Wired for BOTH doors to the DB: Bash commands AND the Supabase MCP tools.
// Input: JSON on stdin { tool_name, tool_input, cwd }
import { execSync } from 'node:child_process'

const MAIN = 'c:/users/sagi/desktop/atlas' // supervisor checkout (lowercase compare)

let raw = ''
for await (const chunk of process.stdin) raw += chunk
let input = {}
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0) // never break the harness on parse issues
}
const toolName = String(input.tool_name ?? '')
const cwd = String(input.cwd ?? '').replaceAll('\\', '/').toLowerCase()
const inSupervisor = cwd === MAIN || cwd.startsWith(MAIN + '/')

function block(reason) {
  console.error(`BLOCKED by pre-bash-gate: ${reason}`)
  process.exit(2)
}

// Destructive-SQL detector — shared by the Bash door and the MCP door.
// Additive DDL (CREATE TABLE / ADD COLUMN / CREATE INDEX) passes; destruction does not.
// Checks run PER STATEMENT so a later WHERE can't shadow an earlier bare DELETE/UPDATE,
// and an additive ALTER isn't blocked by the word "drop" in a later statement or comment.
function sqlIsDestructive(text) {
  if (/\b(drop\s+(table|column|schema|database|index|trigger|function|policy)|truncate\s+)/i.test(text)) return true
  for (const stmt of text.split(';')) {
    if (/\balter\s+table\b[^]*\bdrop\b/i.test(stmt)) return true
    if (/\bdelete\s+from\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) return true
    if (/\bupdate\s+[\w".]+\s+set\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) return true
  }
  return false
}

// ---- Door 2: Supabase MCP tools (execute_sql / apply_migration) ----
if (toolName.startsWith('mcp__supabase__')) {
  const sql = String(input.tool_input?.query ?? input.tool_input?.sql ?? JSON.stringify(input.tool_input ?? {}))
  if (sqlIsDestructive(sql))
    block('destructive SQL via Supabase MCP. DB is shared with production Timlul — additive-only. See .claude/rules/db.md')
  process.exit(0)
}

// ---- Door 1: Bash ----
const cmd = String(input.tool_input?.command ?? '')

// 1. Destructive SQL in shell commands (psql, supabase, node -e, heredocs…)
if (sqlIsDestructive(cmd))
  block('destructive SQL (DROP/TRUNCATE/ALTER-DROP/unfiltered DELETE/UPDATE). DB is shared with production. See .claude/rules/db.md')
if (/\bsupabase\s+db\s+reset\b/i.test(cmd)) block('supabase db reset would wipe the shared-with-production database')

// 2. Recursive force deletes outside safe targets (short OR long flags, any order; PowerShell + cmd too)
const isRm = /\brm\b/.test(cmd) || /\bremove-item\b/i.test(cmd)
const hasRecursive = /(^|\s)-[a-zA-Z]*[rR]|--recursive|-Recurse/i.test(cmd)
const hasForce = /(^|\s)-[a-zA-Z]*[fF]\b|--force|-Force/i.test(cmd)
const isRmdirS = /\brmdir\b/i.test(cmd) && /\s\/s\b/i.test(cmd) // Windows cmd recursive delete
if ((isRm && hasRecursive && hasForce) || isRmdirS) {
  const targets = cmd
    .replace(/^.*\b(rm|remove-item|rmdir)\b/i, '')
    .replace(/\s\/[sq]\b/gi, '')
    .split(/\s+/)
    .filter((t) => t && !t.startsWith('-'))
  const SAFE = /^\.?\/?(\.next|node_modules|dist|scripts\/out)([/\\]|$)|appdata[/\\]local[/\\]temp[/\\]claude/i
  const unsafe = targets.filter((t) => !SAFE.test(t.replaceAll('\\', '/')))
  if (unsafe.length) block(`recursive force delete of: ${unsafe.join(' ')}. Only .next/node_modules/dist/scripts/out/scratchpad are deletable`)
}

// 3. Shell access to secrets — readers, interpreters, dumpers, and redirects
if (
  /(^|[\s;|&])(cat|less|more|head|tail|grep|sed|awk|cp|mv|type|get-content|gc|xxd|strings|od|dd|hexdump|base64)\s+[^|;&>]*\.env/i.test(cmd) ||
  /(^|[\s;|&])(node|python3?|perl|ruby|php)\b[^\n]*\.env/i.test(cmd) ||
  /readfilesync[^\n]*\.env/i.test(cmd) ||
  />+\s*\.?\S*\.env/i.test(cmd)
)
  block('shell access to .env* — secret values must never enter transcripts')

// 4. Append-only fleet logs — >> (append) is the only allowed shell write to the two logs.
// Truncating redirects, rewriting cmdlets, tee-without-append, and in-place editors are blocked;
// reading and copying FROM the logs stays free (fleet-lint snapshots them).
const LOGRE = '(cross-cutting|ready-queue)\\.md'
if (new RegExp(LOGRE, 'i').test(cmd)) {
  if (new RegExp(`(^|[^>])>(?!>)\\|?\\s*"?[^\\s"'|&;]*${LOGRE}`, 'i').test(cmd))
    block('single-> truncates an append-only fleet log — append with >> instead (rules/parallel-work.md)')
  if (new RegExp(`\\b(set-content|out-file)\\b[^\\n;|]*${LOGRE}`, 'i').test(cmd))
    block('Set-Content/Out-File rewrite an append-only fleet log — use Add-Content or bash >>')
  if (new RegExp(`(^|[\\s;|&])tee\\s+(?!-a\\b|--append\\b)[^\\n|]*${LOGRE}`, 'i').test(cmd))
    block('tee without -a truncates an append-only fleet log — use tee -a')
  if (new RegExp(`\\bsed\\s[^\\n]*-i[^\\n]*${LOGRE}`, 'i').test(cmd))
    block('sed -i rewrites an append-only fleet log — the logs are never edited in place')
  if (new RegExp(`writefilesync[^\\n]*${LOGRE}`, 'i').test(cmd))
    block('writeFileSync overwrites an append-only fleet log — use fs.appendFileSync')
  if (new RegExp(`(^|[\\s;|&])(rm|del|remove-item)\\b[^\\n|;]*${LOGRE}`, 'i').test(cmd))
    block('deleting an append-only fleet log is never allowed')
  if (new RegExp(`\\bdd\\b[^\\n;|]*\\bof=[^\\s]*${LOGRE}`, 'i').test(cmd))
    block('dd onto an append-only fleet log overwrites it')
  // cp/mv TO a log = whole-file rewrite; copying FROM the logs (snapshots keep the same
  // filename under docs/archive/, so only the real agent-memory/ location counts as a hit).
  const LOGDEST = new RegExp(`((^|[/\\\\])agent-memory[/\\\\]|^)(cross-cutting|ready-queue)\\.md$`, 'i')
  for (const seg of cmd.split(/&&|\|\||;|\|/)) {
    if (/(^|\s)(cp|mv|copy-item|move-item)\b/i.test(seg)) {
      const toks = seg.trim().split(/\s+/).filter((t) => t && !t.startsWith('-'))
      const last = (toks[toks.length - 1] || '').replace(/["']/g, '')
      if (LOGDEST.test(last))
        block('cp/mv onto an append-only fleet log replaces its history — appends only')
    }
  }
}

// 5. Git safety
if (/git\s+push[^\n]*(--force|-f\b)/.test(cmd)) block('force-push is never allowed')
if (/git\s+push\b/.test(cmd) && !inSupervisor) {
  // Explicit main target from a lane — always blocked.
  if (/git\s+push\b[^\n]*\bmain\b/.test(cmd))
    block('pushing main is supervisor-only — finish via /ship and post to the ready queue')
  // Bare push (no explicit main) — block if the lane is actually ON main.
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: input.cwd, timeout: 5000 }).toString().trim()
    if (branch === 'main') block('this worktree is on main — lanes never push main. Check out your feature branch')
  } catch {
    /* not a repo / git unavailable → let permissions handle it */
  }
}

process.exit(0)
