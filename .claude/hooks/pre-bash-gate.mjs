#!/usr/bin/env node
// PreToolUse gate — deterministic safety. Exit 2 blocks the tool call; stderr explains why.
// Wired for BOTH doors to the DB: Bash commands AND the Supabase MCP tools.
// Input: JSON on stdin { tool_name, tool_input, cwd }
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
let input = {}
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0) // never break the harness on parse issues
}
const toolName = String(input.tool_name ?? '')

/**
 * Is this the PRIMARY checkout, or a linked worktree?
 *
 * This used to be a string compare against a hard-coded absolute path to the
 * supervisor's checkout. That constant was a fact about one machine's disk layout,
 * and the layout is exactly what ADR-0001 removes — so the guard would have gone on
 * comparing against a directory that no longer meant anything, and quietly stopped
 * distinguishing anything at all. Ask git instead: in the primary checkout
 * `--git-dir` and `--git-common-dir` are the same place; in a linked worktree the
 * first points inside `.git/worktrees/<name>` and the second at the shared `.git`.
 * Same protection, located by a property rather than by an address.
 *
 * FAILS CLOSED. If git cannot answer — not a repo, git missing, anything — this
 * returns false, which is the STRICTER direction: an unknown checkout is treated as
 * a worktree and may not push main. The old constant failed closed for the same
 * inputs (any path that was not the supervisor's), so this preserves the behaviour
 * rather than trading it for convenience.
 *
 * THE MISSING-`cwd` CASE IS EXPLICIT, and it is the one that bit. An absent `cwd`
 * handed to `execSync` does not error — it silently inherits the HOOK's own working
 * directory, so the gate would answer for whatever checkout it happened to be
 * running in rather than for the caller. Written the obvious way this is fail-OPEN
 * on the one input the paragraph above promises is safe, and the fire-test matrix
 * did not measure it (M1). `no-cwd-push-main` now does.
 */
function isPrimaryCheckout(cwd) {
  if (!cwd) return false
  try {
    const out = execSync('git rev-parse --git-dir --git-common-dir', { cwd, timeout: 5000 })
      .toString()
      .trim()
      .split('\n')
    if (out.length < 2) return false
    const norm = (p) =>
      path
        .resolve(cwd ?? '.', p.trim())
        .replaceAll('\\', '/')
        .toLowerCase()
    return norm(out[0]) === norm(out[1])
  } catch {
    return false
  }
}

function block(reason) {
  console.error(`BLOCKED by pre-bash-gate: ${reason}`)
  process.exit(2)
}

// Destructive-SQL detector — shared by the Bash door and the MCP door.
// Additive DDL (CREATE TABLE / ADD COLUMN / CREATE INDEX) passes; destruction does not.
// Checks run PER STATEMENT so a later WHERE can't shadow an earlier bare DELETE/UPDATE,
// and an additive ALTER isn't blocked by the word "drop" in a later statement or comment.
function sqlIsDestructive(text) {
  if (/\b(drop\s+(table|column|schema|database|index|trigger|function|policy)|truncate\s+)/i.test(text))
    return true
  for (const stmt of text.split(';')) {
    if (/\balter\s+table\b[^]*\bdrop\b/i.test(stmt)) return true
    if (/\bdelete\s+from\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) return true
    if (/\bupdate\s+[\w".]+\s+set\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) return true
  }
  return false
}

// ---- Door 2: Supabase MCP tools (execute_sql / apply_migration) ----
if (toolName.startsWith('mcp__supabase__')) {
  const sql = String(
    input.tool_input?.query ?? input.tool_input?.sql ?? JSON.stringify(input.tool_input ?? {})
  )
  if (sqlIsDestructive(sql))
    block(
      'destructive SQL via Supabase MCP. DB is shared with production Timlul — additive-only. See .claude/rules/db.md'
    )
  process.exit(0)
}

// ---- Door 3: Railway MCP tools (added 2026-08-08, the day Atlas went live on Railway) ----
// Railway is a THIRD door, and it has NONE of the other two's protections. Its destructive
// operations are not SQL, so sqlIsDestructive() is blind to them; and its variable tools would
// hand the deployment's secrets straight into a transcript — precisely what the .env* rule on
// the Bash door below exists to prevent. Writing a blocklist of dangerous verbs over a tool
// vocabulary nobody has read is the exact failure rules/app.md has now filed twice (a guessed
// word list, and a probe written against a stale signature). So this door is DEFAULT-DENY.
const RAILWAY_READONLY = new Set([
  // EMPTY ON PURPOSE. The Railway MCP server was not installed when this door was written, so
  // any name here would have been guessed rather than verified. Populate it at connect time,
  // ONE NAME AT A TIME, each read off the installed server's own tool list and each confirmed
  // unable to mutate infrastructure or reveal a variable's value. An empty set blocks every
  // Railway tool, which is the correct direction to fail in.
  //
  // The one entry below is NOT a Railway tool and never will be. It exists so gate-tests can
  // prove this allowlist is actually consulted and the name-strip above works: without it, a
  // broken strip is indistinguishable from a working default-deny, and the breakage would only
  // surface the day someone adds a real name and quietly gets nothing.
  '__gate_selftest__',
])
if (toolName.startsWith('mcp__railway')) {
  const tool = toolName.replace(/^mcp__railway[^_]*__/, '')
  // (a) Secrets. Kept ABOVE the allowlist deliberately: it must stay impossible to allowlist a
  //     variable reader by accident. Values live in the Railway dashboard, for human eyes.
  if (/var(iable)?|secret|credential|token|password|apikey|api_key/i.test(tool))
    block(
      `Railway MCP "${tool}" can read deployment variables. Secret values must never enter a ` +
        `transcript — same law as .env* on the Bash door. Read them in the Railway dashboard.`
    )
  // (b) Mutation/destruction of live infrastructure. Atlas is in production; these go through
  //     the founder in the dashboard, where the blast radius is visible before it is chosen.
  if (/delete|destroy|remove|teardown|wipe|purge|restart|redeploy|rollback|scale|detach/i.test(tool))
    block(
      `Railway MCP "${tool}" mutates or destroys live infrastructure, and Atlas is in ` +
        `production at www.timlul-ai.com. This one goes through the founder in the dashboard.`
    )
  if (!RAILWAY_READONLY.has(tool))
    block(
      `Railway MCP "${tool}" is not on the verified read-only allowlist in ` +
        `.claude/hooks/pre-bash-gate.mjs (default-deny). Add it only after reading the ` +
        `installed server's own tool list and confirming it can neither mutate nor reveal.`
    )
  process.exit(0)
}

// ---- Door 1: Bash ----
const cmd = String(input.tool_input?.command ?? '')

// 1. Destructive SQL in shell commands (psql, supabase, node -e, heredocs…)
if (sqlIsDestructive(cmd))
  block(
    'destructive SQL (DROP/TRUNCATE/ALTER-DROP/unfiltered DELETE/UPDATE). DB is shared with production. See .claude/rules/db.md'
  )
if (/\bsupabase\s+db\s+reset\b/i.test(cmd))
  block('supabase db reset would wipe the shared-with-production database')

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
  const SAFE =
    /^\.?\/?(\.next|node_modules|dist|scripts\/out)([/\\]|$)|appdata[/\\]local[/\\]temp[/\\]claude/i
  const unsafe = targets.filter((t) => !SAFE.test(t.replaceAll('\\', '/')))
  if (unsafe.length)
    block(
      `recursive force delete of: ${unsafe.join(' ')}. Only .next/node_modules/dist/scripts/out/scratchpad are deletable`
    )
}

// 3. Shell access to secrets — readers, interpreters, dumpers, and redirects
if (
  /(^|[\s;|&])(cat|less|more|head|tail|grep|sed|awk|cp|mv|type|get-content|gc|xxd|strings|od|dd|hexdump|base64)\s+[^|;&>]*\.env/i.test(
    cmd
  ) ||
  /(^|[\s;|&])(node|python3?|perl|ruby|php)\b[^\n]*\.env/i.test(cmd) ||
  /readfilesync[^\n]*\.env/i.test(cmd) ||
  />+\s*\.?\S*\.env/i.test(cmd)
)
  block('shell access to .env* — secret values must never enter transcripts')

// 4. The append-only log — >> (append) is the only allowed shell write to it.
// Truncating redirects, rewriting cmdlets, tee-without-append, and in-place editors are blocked;
// reading and copying FROM it stays free (that is how it gets archived).
//
// THE FLEET'S TWO LOGS ARE STILL NAMED HERE, and deliberately. `COLLISIONS.md` replaced
// `cross-cutting.md` when the fleet retired (ADR-0001), but `cross-cutting.md` and
// `ready-queue.md` survive verbatim under docs/archive/ as the record of how every law was
// learned — history is exactly the thing that must not be rewritten. Dropping their names
// when the live files moved would have retired the protection along with the apparatus.
// One list, two consumers (LOGRE below and LOGDEST further down). Written twice, they
// drift, and the half that drifts is the half nobody tests.
const LOG_NAMES = 'cross-cutting|ready-queue|COLLISIONS'
const LOGRE = `(${LOG_NAMES})\\.md`
if (new RegExp(LOGRE, 'i').test(cmd)) {
  if (new RegExp(`(^|[^>])>(?!>)\\|?\\s*"?[^\\s"'|&;]*${LOGRE}`, 'i').test(cmd))
    block('single-> truncates an append-only log — append with >> instead (COLLISIONS.md)')
  if (new RegExp(`\\b(set-content|out-file)\\b[^\\n;|]*${LOGRE}`, 'i').test(cmd))
    block('Set-Content/Out-File rewrite an append-only log — use Add-Content or bash >>')
  if (new RegExp(`(^|[\\s;|&])tee\\s+(?!-a\\b|--append\\b)[^\\n|]*${LOGRE}`, 'i').test(cmd))
    block('tee without -a truncates an append-only log — use tee -a')
  if (new RegExp(`\\bsed\\s[^\\n]*-i[^\\n]*${LOGRE}`, 'i').test(cmd))
    block('sed -i rewrites an append-only log — it is never edited in place')
  if (new RegExp(`writefilesync[^\\n]*${LOGRE}`, 'i').test(cmd))
    block('writeFileSync overwrites an append-only log — use fs.appendFileSync')
  if (new RegExp(`(^|[\\s;|&])(rm|del|remove-item)\\b[^\\n|;]*${LOGRE}`, 'i').test(cmd))
    block('deleting an append-only log is never allowed')
  if (new RegExp(`\\bdd\\b[^\\n;|]*\\bof=[^\\s]*${LOGRE}`, 'i').test(cmd))
    block('dd onto an append-only log overwrites it')
  // cp/mv TO a log = whole-file rewrite. Matched on the BASENAME, not on one directory
  // prefix: the previous form only recognised `agent-memory/cross-cutting.md`, so a bare
  // `./cross-cutting.md` walked straight past it, and after the move to the repo root that
  // near-miss is the ordinary way to write the path.
  const LOGDEST = new RegExp(`(^|[/\\\\])(${LOG_NAMES})\\.md$`, 'i')

  /**
   * The ONE allowed cp/mv onto a log name: CREATING a copy under docs/archive/.
   * That is how a closed era becomes history, and the snapshot the fleet retirement
   * itself took.
   *
   * THE PATH IS RESOLVED, NEVER PATTERN-MATCHED. The first version of this hatch
   * tested `/docs[/\\]archive[/\\]/` against the raw string, so any destination
   * merely CONTAINING the prefix was exempted no matter where it landed:
   * `cp evil.md docs/archive/../../COLLISIONS.md` exited 0. That is `rules/app.md`
   * M3.2 exactly — the choke point was handed a proxy (a substring) instead of the
   * fact (where the bytes go), so it decided confidently and wrongly.
   *
   * And it must not already EXIST. Creating history is allowed; overwriting it is
   * not, which is also what `.claude/settings.json` says by denying Edit/Write on
   * the archived logs. Two doors that disagree about the same file are a hole with
   * a second opinion.
   *
   * No cwd, no answer, no exemption — the same direction every unknown fails in here.
   */
  const isNewArchiveFile = (dest) => {
    if (!input.cwd) return false
    const abs = path.resolve(input.cwd, dest)
    const archiveRoot = path.resolve(input.cwd, 'docs', 'archive')
    const rel = path.relative(archiveRoot, abs)
    const inside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    return inside && !existsSync(abs)
  }

  for (const seg of cmd.split(/&&|\|\||;|\|/)) {
    if (/(^|\s)(cp|mv|copy-item|move-item)\b/i.test(seg)) {
      const toks = seg
        .trim()
        .split(/\s+/)
        .filter((t) => t && !t.startsWith('-'))
      const last = (toks[toks.length - 1] || '').replace(/["']/g, '')
      if (LOGDEST.test(last) && !isNewArchiveFile(last))
        block('cp/mv onto an append-only log replaces its history — appends only')
    }
  }
}

// 5. Git safety
if (/git\s+push[^\n]*(--force|-f\b)/.test(cmd)) block('force-push is never allowed')
if (/git\s+push\b/.test(cmd) && !isPrimaryCheckout(input.cwd)) {
  // Explicit main target from a worktree — always blocked.
  if (/git\s+push\b[^\n]*\bmain\b/.test(cmd))
    block('main is pushed from the primary checkout, not from a worktree — finish via /ship')
  // The branch probe below has the same inherit-the-hook's-directory hazard as the
  // check above: without a cwd it would report the branch of whatever checkout the
  // hook is running in, and answer confidently about the wrong one (M3 — give the
  // choke point the fact, never a proxy for it). No cwd, no answer, no push.
  if (!input.cwd) block('cannot tell which checkout this push comes from, so it does not run')
  // Bare push (no explicit main) — block if this worktree is actually ON main.
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: input.cwd, timeout: 5000 })
      .toString()
      .trim()
    if (branch === 'main')
      block(
        'this worktree is on main, and main is pushed from the primary checkout. Check out your feature branch'
      )
  } catch {
    /* not a repo / git unavailable → let permissions handle it */
  }
}

process.exit(0)
