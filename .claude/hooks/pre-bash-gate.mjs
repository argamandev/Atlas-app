#!/usr/bin/env node
// PreToolUse gate — deterministic safety. Exit 2 blocks the tool call; stderr explains why.
// Wired to three PreToolUse matchers in settings.json — `Bash`, `mcp__supabase__.*` and
// `mcp__railway.*`. Matchers are explicit, so a new door to the DB needs a new matcher here.
// Input: JSON on stdin { tool_name, tool_input, cwd }
import { execSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Kept in sync with MIN_REASON in scripts/lib/ship-gate.mjs by a test there, and
// deliberately NOT imported from it: this hook guards destructive SQL, and an import
// that fails to resolve would crash it with exit 1 rather than 2 — which the harness
// reads as 'allow'. A missing module must never be able to open every door at once.
const MIN_REASON = 25

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

// 6. The merge door — eviction and promotion, at the moment they are cheap.
//
// WHY A HOOK AND NOT THE SKILL. Both rituals were written out carefully in
// `.claude/skills/ship/SKILL.md`, and `CONTEXT.md` counts prose as the weakest tier
// and NOT as enforcement. ADR-0002 is the ruling that a lesson is not learned until
// a mechanism enforces it, and the workflow does not get to exempt itself from the
// rule it imposes on the product. So a merge onto main runs
// `scripts/ship-gate.mjs`, which asks whether this branch rewrote STATUS.md, filed
// its PROGRESS.md entry, sent its closed working notes to history, and answered the
// recurrence question for every review finding.
//
// SCOPE, and it is stated because the first version's comment overclaimed it. This
// catches `git merge` and `git pull` SPELLED THAT WAY, in their own statement, while
// the checkout is on main. Step 2 of the ship ritual merges `origin/main` INTO the
// feature branch and stays free — that is the direction nothing lands in. What it does
// NOT catch: a merge performed by something that is not the `git` binary, an alias, or
// a script that wraps one. Regex over a shell string cannot; the gate's own
// `npm run ship:gate` is what covers the deliberate path, and this door covers the
// ordinary one.
//
// EVERY QUESTION BELOW IS ASKED OF THE MERGE'S OWN STATEMENT, never of the whole
// command. Cold review found three bypasses in one family here, all from testing the
// raw string: `git merge X # --abort`, `git merge X && echo --abort`, and an
// ATLAS_SHIP_OVERRIDE mentioned in a LATER command all walked straight through. That
// is `rules/app.md` M3.2 — the choke point was handed a proxy (does this string
// contain the word) instead of the fact (is this merge exempt) — and it is the second
// time this file has filed it; the archive hatch in section 4 was the first.
//
// A NEWLINE IS A STATEMENT SEPARATOR, and leaving it out was the same defect a third
// time. Round 2 of cold review: `ls # look` + newline + `git merge --no-ff feat/x` was
// ALLOWED, because the split produced one blob and the comment-strip then deleted the
// merge along with the comment. Newline is the separator the harness's own Bash calls
// are written with, so it was not an exotic case; it was the ordinary one.
for (const rawStatement of cmd.split(/&&|\|\||;|\||\r?\n/)) {
  // A `#` INSIDE A QUOTED ARGUMENT IS NOT A COMMENT. Quoted spans are masked before the
  // comment is found, so `-m "fix #12"` keeps its message. If quoting is unbalanced the
  // cut lands mid-token, the ref parse comes up empty and the merge is BLOCKED for
  // naming no source — which is the direction an unparseable command should fail in.
  const masked = rawStatement.replace(/"[^"]*"|'[^']*'/g, (m) => ' '.repeat(m.length))
  const hash = masked.search(/(^|\s)#/)
  const stmt = hash === -1 ? rawStatement : rawStatement.slice(0, hash)
  // The backtick is in this class because ``echo `git merge x` `` was allowed while the
  // `$(…)` and `(…)` forms both blocked — an anchor is a list of the ways someone might
  // write it, and a list is never complete. What keeps this honest is that everything
  // it MISSES fails open, so the anchor is deliberately generous.
  const at = stmt.search(/(^|[\s($`])git(\.exe)?\s/i)
  if (at === -1) continue
  // Quoted spans stay one token; the shell punctuation that WRAPS a command substitution
  // is then peeled off both ends. Without the peel, ``echo `git merge feat/x` `` yields
  // the ref "feat/x`" and the gate goes off and judges a branch by the wrong name — it
  // still runs, and still answers about something that does not exist, which is worse
  // than not running.
  const toks = (stmt.slice(at).match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) =>
    t.replace(/^[`("']+/, '').replace(/[`)"']+$/, '')
  )
  // The SUBCOMMAND is the first non-option token, which is not necessarily toks[1]:
  // `git -C dir merge x` and `git -c user.name=x merge y` both put global options
  // first. Reading toks[1] as the verb, `git -C ../other merge feat/ok` was not a merge
  // at all as far as this door was concerned — a hole the matrix found by naming the
  // case rather than by anyone re-reading the loop.
  const TAKES_A_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])
  const REDIRECTS = new Set(['-C', '--git-dir', '--work-tree'])
  let v = 1
  let elsewhere = false
  while (v < toks.length && toks[v].startsWith('-')) {
    if (REDIRECTS.has(toks[v].split('=')[0])) elsewhere = true
    v += TAKES_A_VALUE.has(toks[v]) ? 2 : 1
  }
  const verb = toks[v]
  if (verb !== 'merge' && verb !== 'pull') continue

  // Those three options change WHICH repository is acted on, so the on-main probe below
  // would answer confidently about a different one — the same fact-vs-proxy error, one
  // level up. No answer, no merge.
  if (elsewhere)
    block(
      'git -C / --git-dir / --work-tree points at another checkout, so this gate cannot tell which ' +
        'repository is being merged. Run the merge from inside that checkout.'
    )

  // Options and source refs, separated in ONE pass — because `-m`'s value is neither.
  // Round 2 found `git merge --no-ff -m "--abort" feat/x` walking straight through: the
  // exemption test ran over the raw argument list, after quote-stripping, so a commit
  // message reading "--abort" exempted the merge. The `-m` skip existed for the ref
  // parse and had never been applied to the exemption, which is the same lie through a
  // second surface (M3.2).
  const flags = []
  const refs = []
  for (let i = 0; i < toks.length - v - 1; i++) {
    const t = toks[v + 1 + i]
    if (t === '-m' || t === '--message')
      i++ // its value is a message: not a flag, not a ref
    else if (t.startsWith('-')) flags.push(t)
    else if (t !== '') refs.push(t)
  }
  if (flags.some((t) => /^--(abort|continue|quit)$/.test(t))) continue // not a merge, a resolution

  // The same inherit-the-hook's-directory hazard as the push rule above: without a
  // cwd, the branch probe answers for whatever checkout the hook is running in.
  if (!input.cwd) block('cannot tell which checkout this merge is in, so the ship gate cannot run')

  let onMain = false
  try {
    onMain =
      execSync('git rev-parse --abbrev-ref HEAD', { cwd: input.cwd, timeout: 5000 }).toString().trim() ===
      'main'
  } catch {
    onMain = false // not a repo / git unavailable → let permissions handle it
  }
  if (!onMain) continue

  // The escape hatch, and it is not a weakness (ADR-0002). Without one, a hard gate
  // pressures people into satisfying it with motions that only look like the ritual.
  // It costs a stated reason, and it must be THIS statement's env prefix — a mention
  // of the variable in a neighbouring command is not an override of this merge.
  const prefix = stmt.slice(0, at)
  const override = /ATLAS_SHIP_OVERRIDE\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(prefix)
  const reason = override ? (override[1] ?? override[2] ?? override[3]).trim() : null
  if (reason !== null && reason.length < MIN_REASON)
    block(
      `ATLAS_SHIP_OVERRIDE needs a real reason of at least ${MIN_REASON} characters, not "${reason}". Say ` +
        'what about this merge makes the ritual wrong — that sentence is the whole value of the hatch.'
    )
  if (reason !== null) {
    console.error(`pre-bash-gate: ship gate OVERRIDDEN for this merge — "${reason}"`)
    continue
  }

  // `git pull` is a fetch AND a merge onto main. Bare, or pulling main, is the ordinary
  // sync and stays free; pulling anything else lands work on main without the ritual.
  if (verb === 'pull') {
    const branchRef = refs.length > 1 ? refs[refs.length - 1] : null
    if (branchRef && !/^(main|origin\/main|refs\/heads\/main)$/.test(branchRef))
      block(
        `git pull merges ${branchRef} onto main, which lands work without the ship gate. Fetch, then ` +
          `merge it deliberately: git fetch origin && git merge --no-ff ${branchRef}`
      )
    continue
  }

  // Exactly one source, or the gate does not know what it is judging. ZERO is the one
  // that matters: a bare `git merge` with a MERGE_HEAD present CONCLUDES a merge onto
  // main, which is precisely the event this door exists for.
  if (refs.length !== 1)
    block(
      `this merge onto main names ${refs.length} source refs, so the ship gate cannot tell which ` +
        'branch to judge. Merge one branch at a time: git merge --no-ff <branch>'
    )

  const gate = path.join(input.cwd, 'scripts', 'ship-gate.mjs')
  if (!existsSync(gate))
    block(
      `main is merged through the ship gate, and ${gate} is not there — so nothing would be checking this merge`
    )

  const r = spawnSync('node', [gate, '--branch', refs[0], '--cwd', input.cwd], {
    cwd: input.cwd,
    encoding: 'utf8',
    timeout: 120_000,
  })
  // A gate that could not RUN is not a gate that passed. Same direction every unknown
  // fails in here.
  if (r.status !== 0)
    block(
      `the ship gate refused this merge.\n\n${r.stderr || r.stdout || String(r.error ?? 'the gate did not finish')}`
    )
}

process.exit(0)
