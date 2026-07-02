#!/usr/bin/env node
// PreToolUse gate — deterministic safety. Exit 2 blocks the tool call; stderr explains why.
// Input: JSON on stdin { tool_name, tool_input: { command }, cwd }
const MAIN = 'c:/users/sagi/desktop/atlas' // supervisor checkout (lowercase compare)

let raw = ''
for await (const chunk of process.stdin) raw += chunk
let input = {}
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0) // never break the harness on parse issues
}
const cmd = String(input.tool_input?.command ?? '')
const cwd = String(input.cwd ?? '').replaceAll('\\', '/').toLowerCase()

function block(reason) {
  console.error(`BLOCKED by pre-bash-gate: ${reason}`)
  process.exit(2)
}

// 1. Destructive DDL against the shared-with-production DB
if (/\b(drop\s+(table|column|schema|database|index)|truncate\s+|alter\s+table[\s\S]*\bdrop\b|delete\s+from\s+\w+\s*;?\s*$)/i.test(cmd))
  block('destructive SQL (DROP/TRUNCATE/ALTER-DROP/unfiltered DELETE). DB is shared with production. See .claude/rules/db.md')

// 2. Recursive force deletes outside safe targets
const rmMatch = cmd.match(/\brm\s+(-[a-zA-Z]+\s+)*(-[a-zA-Z]*[rR][a-zA-Z]*[fF][a-zA-Z]*|-[a-zA-Z]*[fF][a-zA-Z]*[rR][a-zA-Z]*)\s+(.+)/)
if (rmMatch || /remove-item\s+.*-recurse.*-force/i.test(cmd)) {
  const targets = (rmMatch ? rmMatch[3] : cmd).split(/\s+/).filter((t) => t && !t.startsWith('-'))
  const SAFE = /^\.?\/?(\.next|node_modules|dist|scripts\/out)([/\\]|$)|appdata[/\\]local[/\\]temp[/\\]claude/i
  const unsafe = targets.filter((t) => !SAFE.test(t.replaceAll('\\', '/')))
  if (unsafe.length) block(`recursive force delete of: ${unsafe.join(' ')}. Only .next/node_modules/dist/scripts/out/scratchpad are deletable`)
}

// 3. Shell access to secrets
if (/(^|[\s;|&])(cat|less|more|head|tail|grep|sed|awk|cp|type|get-content|gc)\s+[^|;&>]*\.env/i.test(cmd) || />+\s*\.?\S*\.env/i.test(cmd))
  block('shell read/write of .env* — secret values must never enter transcripts')

// 4. Git safety
if (/git\s+push[^\n]*(--force|-f\b)/.test(cmd)) block('force-push is never allowed')
// Lanes may push their own feature branches; pushing MAIN is supervisor-only.
// NB: exact-or-subdir match — "Atlas-frontend" must NOT pass as a prefix of "Atlas".
const inSupervisor = cwd === MAIN || cwd.startsWith(MAIN + '/')
if (/git\s+push\b[^\n]*\bmain\b/.test(cmd) && !inSupervisor)
  block('pushing main is supervisor-only — finish via /ship and post READY-FOR-REVIEW on the board')

process.exit(0)
