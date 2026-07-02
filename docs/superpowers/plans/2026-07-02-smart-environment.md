# Atlas Smart Environment Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the harness (memory, hooks, rules, skills, slim context, launch kit) that lets 3 parallel worktree sessions develop Atlas's big features safely and self-verifyingly, gated by a supervisor session.

**Architecture:** Hub-and-spoke shared memory (`agent-memory/BOARD.md`, git-ignored, one physical copy in the main checkout reached by absolute path from all worktrees) + two enforcement hooks (Node scripts) + path-scoped rules + two new skills (/verify-app, /ship) + a slimmed CLAUDE.md with content relocated (never deleted) + a founder launch kit.

**Tech Stack:** Claude Code hooks (PreToolUse/PostToolUse, Node .mjs scripts), Prettier, tsc incremental, git worktrees, Chrome MCP (verification), existing npm test suite.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-smart-environment-design.md` (founder-approved).
- Windows machine; hooks must be Node scripts (`node .claude/hooks/<name>.mjs`), never bash/PowerShell-specific.
- Main checkout absolute path: `C:\Users\Sagi\Desktop\Atlas` (forward-slash form `C:/Users/Sagi/Desktop/Atlas`).
- Shared Supabase with production: **additive-only** migrations; destructive DDL must be hook-blocked.
- Port map: supervisor 3000 / Lane F 3001 / Lane I 3002 / Lane M 3003. Live engine :8788 single-owner.
- Merge model: only the supervisor pushes `main`; lanes post READY-FOR-REVIEW on the board.
- All work on branch `feat/smart-environment` off `main`; ship via the new `/ship` ritual (Task 14) as its own first test.
- Existing code style: no semicolons, single quotes, 2-space indent — Prettier config MUST match (Task 5 verifies the project-wide diff is acceptable before committing).
- `npm test` (45 tests) + `npx tsc --noEmit` + `npx next build` must be green at every commit.

---

### Task 1: Archive the volatile replay assets (Lane I's test bench)

**Files:**
- Create: `scripts/out/sessions/2026-07-01-tamis-live/broadcast-audio.pcm` (copy)
- Create: `scripts/out/sessions/2026-07-01-tamis-live/broadcast-lines.jsonl` (copy)

**Interfaces:**
- Produces: the canonical replay asset path used by Lane I's opening prompt and `/verify-app` recipe: `scripts/out/sessions/2026-07-01-tamis-live/`

- [ ] **Step 1: Copy the capture before anything else can run the engine**

```bash
mkdir -p scripts/out/sessions/2026-07-01-tamis-live
cp scripts/out/broadcast-audio.pcm scripts/out/sessions/2026-07-01-tamis-live/
cp scripts/out/broadcast-lines.jsonl scripts/out/sessions/2026-07-01-tamis-live/
```

- [ ] **Step 2: Verify sizes match the originals**

Run: `ls -la scripts/out/sessions/2026-07-01-tamis-live/`
Expected: `broadcast-audio.pcm` = 12,384,000 bytes; `broadcast-lines.jsonl` = 8,853 bytes.

(No commit — `scripts/out/` is git-ignored. The path is referenced by later tasks.)

---

### Task 2: Create the branch

- [ ] **Step 1:**

```bash
git checkout main && git pull origin main && git checkout -b feat/smart-environment
```

Expected: `Switched to a new branch 'feat/smart-environment'`.

---

### Task 3: Doc diet — VISION.md + slim CLAUDE.md (content relocated, never deleted)

**Files:**
- Create: `docs/VISION.md` (receives: big vision, V1 product description, roadmap/core missions, quality-gate narrative from current CLAUDE.md)
- Modify: `CLAUDE.md` (full rewrite to ~1 page)
- Modify: `ARCHITECTURE.md` (§7 harness table: hooks/rules/skills rows updated at Task 13)

**Interfaces:**
- Produces: doc map used by every session: CLAUDE.md → {VISION.md, ARCHITECTURE.md, PROGRESS.md, LEGACY.md, agent-memory/BOARD.md, .claude/rules/*}

- [ ] **Step 1: Create `docs/VISION.md`** — move (verbatim where possible) these CLAUDE.md sections: "What this is — the big vision", "V1 product", "V1 status/What exists now" condensed, "Roadmap — backend core missions", "Transcript-quality gate". Add header:

```markdown
# Atlas — Vision & Roadmap

> Moved out of CLAUDE.md (2026-07-02) so sessions load it only when needed.
> The live mission status lives in `agent-memory/BOARD.md`; decisions in `PROGRESS.md`.
```

- [ ] **Step 2: Rewrite `CLAUDE.md`** with exactly this content:

```markdown
# CLAUDE.md — Atlas (אטלס)

Standing facts only. Procedures live in skills; scoped laws in `.claude/rules/`; live state in
`agent-memory/BOARD.md` (READ IT FIRST, update your own section as you work).

## What this is

Atlas — the institutional platform for Israeli public-market investor calls ("Quartr for TASE").
Live calls hosted on-platform (Recall bot → buffered audio + karaoke captions), polished
transcripts (IVRIT/RunPod → Gemini 3.5 Flash), quotes, chat over the archive. English-LTR UI
with Hebrew-RTL option. Full picture: `docs/VISION.md`.

## Iron rules

1. **Supabase is SHARED with production Timlul** (old repo on Railway). Additive-only migrations,
   posted to the board's CROSS-CUTTING before applying. Destructive DDL is hook-blocked.
2. **main is always working + pushed.** Branch per mini-feature; small labeled commits; test
   before commit; ship via `/ship`. Only the supervisor session pushes `main`.
3. **Verify with your own eyes before claiming done** — `/verify-app` (Chrome MCP screenshots).
4. **Work small.** One independently-testable step at a time.
5. **RTL discipline:** Hebrew `dir="rtl"`; numbers/tickers `font-mono-num` + `dir="ltr"`; test bidi visually.
6. **Founder context:** Sagi is a solo non-engineer founder — explain the why in plain language,
   surface risky steps before taking them, say which branch you're on and what's committed.

## Parallel work

You may be one of several sessions. Your lane, port, branch and duties come from your opening
prompt + `.claude/rules/parallel-work.md`. The shared brain is
`C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md` (absolute path — works from any worktree).

## Stack & commands

Next.js 14 App Router + TypeScript + Supabase + Tailwind. Railway deploys the OLD repo; this
clone develops on localhost.

- `npm run dev` · `npm test` (45 tests) · `npx tsc --noEmit` · `npm run build`
- Live engine: `node scripts/live-broadcast.mjs` (:8788) · replay: `scripts/live-replay-engine.mjs`

## Doc map

- `ARCHITECTURE.md` — the codebase, file by file
- `docs/VISION.md` — product vision, V1 description, roadmap
- `PROGRESS.md` — decision log (append at ship time)
- `agent-memory/BOARD.md` — live fleet state (git-ignored, real-time)
- `.claude/rules/` — parallel-work · db · live (read before touching those areas)
- `LEGACY.md` — the 4-file Wave-2 login gateway (only legacy left)
- Skills: `/verify-app` · `/ship` · `/live-test` · `/transcript-review`

## Hard-won gotchas (summary — details in rules/)

Hebrew PDF needs a real browser engine (`window.print()` stopgap). Sign-out stays a plain link.
Railway redirects derive origin from `x-forwarded-host`. PUT validation stays lenient
(`.passthrough()`). Hard-refresh after dev restart. `/app/*` pages have no login gate yet
(APIs are gated) — pre-launch task.
```

- [ ] **Step 3: Verify nothing was lost** — for each removed CLAUDE.md section, confirm its content exists in VISION.md / ARCHITECTURE.md / PROGRESS.md / rules (rules arrive Task 4 — the live/pipeline gotchas being moved there are listed in Task 4 Step 1; check them off there).

Run: `wc -l CLAUDE.md`
Expected: ≤ 80 lines.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/VISION.md
git commit -m "docs(harness): slim CLAUDE.md to standing facts; relocate vision/roadmap to docs/VISION.md"
```

---

### Task 4: Path-scoped rules

**Files:**
- Create: `.claude/rules/parallel-work.md`
- Create: `.claude/rules/db.md`
- Create: `.claude/rules/live.md`

**Interfaces:**
- Produces: rule files referenced by CLAUDE.md doc map + lane opening prompts.

- [ ] **Step 1: Create `.claude/rules/parallel-work.md`:**

```markdown
# Parallel-work law (multi-session fleet)

- Ports: supervisor 3000 · frontend 3001 · ivrit 3002 · multiview 3003. Never take another
  lane's port. Live engine :8788 is SINGLE-OWNER — claim it in BOARD.md CROSS-CUTTING before
  starting it; release when done.
- The board (`C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md`): read at session start and
  before big moves. Update ONLY your own lane section + CROSS-CUTTING/READY-FOR-REVIEW.
  Never edit another lane's state file.
- Post to CROSS-CUTTING **before**: applying any DB migration; changing shared types
  (`src/lib/types.ts`, `lib/api/types`), design tokens/DS components; changing lib/api or
  lib/db shapes.
- Lanes NEVER `git push` to main (hook-blocked) — finish via `/ship` → READY-FOR-REVIEW.
- Write before walking away: end every session by updating your state file + board section.
```

- [ ] **Step 2: Create `.claude/rules/db.md`:**

```markdown
# Database law — Supabase shared with production

The old repo (Timlul, Railway) uses THIS SAME database.

- Additive-only: CREATE TABLE / ADD COLUMN / CREATE INDEX are allowed. DROP/TRUNCATE/
  ALTER-destructive are hook-blocked. Renames = add new + backfill, never in-place.
- Migrations: `supabase/migrations/YYYYMMDD_NNN_description.sql`; post to BOARD.md
  CROSS-CUTTING before applying; RLS on any user-facing table.
- When unsure whether a change is destructive → it goes to the supervisor + founder first.
```

- [ ] **Step 3: Create `.claude/rules/live.md`** — move the live-engine gotchas out of old CLAUDE.md/skills into one place:

```markdown
# Live-engine law & gotchas (read before touching live code)

- Engine `scripts/live-broadcast.mjs` (:8788) holds call state in module memory, NO reset —
  restart it for every clean test. It truncates `scripts/out/broadcast-*` per run (archive
  captures you care about to `scripts/out/sessions/`).
- STALE BROWSER BUNDLE is the #1 gotcha: hard-refresh (Ctrl+Shift+R) after every dev restart.
  MODULE_NOT_FOUND 500 = stale `.next` → kill dev, `rm -rf .next`, restart.
- Recall accuracy-mode captions lag 72–203s — the buffer absorbs it; it is NOT a bug.
- Buffer = `NEXT_PUBLIC_LIVE_BUFFER_SEC` (inlined at dev-server start; restart to change).
- Gemini live correction: `thinkingBudget: 0` is mandatory (thinking leaks into captions);
  paid tier mandatory (free tier 429s under live load).
- The model: a call is LIVE (incl. buffer drain at 1×) or FINISHED — no "processing" surface.
- Cloudflared tunnels are founder-run only and expire — never reuse an old tunnel URL.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/
git commit -m "feat(harness): path-scoped rules — parallel-work, db, live"
```

---

### Task 5: Prettier baseline (so the format hook creates zero noise later)

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `package.json` (devDependency)

**Interfaces:**
- Produces: `npx prettier --write <file>` behavior used by the PostToolUse hook (Task 7).

- [ ] **Step 1: Install + configure to MATCH the existing style (no semicolons, single quotes):**

```bash
npm i -D prettier
```

`.prettierrc.json`:
```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 110,
  "trailingComma": "es5"
}
```

`.prettierignore`:
```
.next
node_modules
scripts/out
public
supabase
docs
*.md
```

- [ ] **Step 2: Gauge the project-wide diff BEFORE committing to it**

Run: `npx prettier --check "src/**/*.{ts,tsx}" | tail -5`
Then: `npx prettier --write "src/**/*.{ts,tsx}" && git diff --stat | tail -5`
Inspect `git diff` on 2-3 core files (`src/lib/transcription.ts`, `components/live/LiveBroadcastView.tsx`): changes must be whitespace/quote-consistency only — no semicolon flood. If the diff looks style-breaking, adjust `.prettierrc.json` (e.g. `printWidth`) until it is minimal, then re-run.

- [ ] **Step 3: Verify the suite still passes** (formatting must be behavior-neutral)

Run: `npm test && npx tsc --noEmit`
Expected: 45 pass, tsc exit 0.

- [ ] **Step 4: Commit the one-time baseline**

```bash
git add -A
git commit -m "style: one-time prettier baseline (matches existing style) + config"
```

---

### Task 6: PreToolUse safety gate hook

**Files:**
- Create: `.claude/hooks/pre-bash-gate.mjs`
- Modify: `.claude/settings.json` (hooks wiring — Task 8 combines permissions in the same file; here add the hooks block)

**Interfaces:**
- Consumes: Claude Code PreToolUse stdin JSON: `{ tool_name, tool_input: { command }, cwd }`.
- Produces: exit 2 + stderr reason to block; exit 0 to allow.

- [ ] **Step 1: Write `.claude/hooks/pre-bash-gate.mjs`:**

```javascript
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
if (/git\s+push\b/.test(cmd) && !cwd.startsWith(MAIN))
  block('lanes never push — finish via /ship and post READY-FOR-REVIEW on the board (only the supervisor checkout pushes)')

process.exit(0)
```

- [ ] **Step 2: Wire it in `.claude/settings.json`** (add to the existing JSON, keeping the current `permissions.allow` until Task 8 rewrites it):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/pre-bash-gate.mjs" }]
      }
    ]
  }
}
```

- [ ] **Step 3: Unit-fire the script directly (before trusting the wiring)**

```bash
echo '{"tool_input":{"command":"echo DROP TABLE transcripts"},"cwd":"C:/Users/Sagi/Desktop/Atlas"}' | node .claude/hooks/pre-bash-gate.mjs; echo "exit=$?"
echo '{"tool_input":{"command":"rm -rf src"},"cwd":"C:/Users/Sagi/Desktop/Atlas"}' | node .claude/hooks/pre-bash-gate.mjs; echo "exit=$?"
echo '{"tool_input":{"command":"cat .env.local"},"cwd":"C:/Users/Sagi/Desktop/Atlas"}' | node .claude/hooks/pre-bash-gate.mjs; echo "exit=$?"
echo '{"tool_input":{"command":"git push --force"},"cwd":"C:/Users/Sagi/Desktop/Atlas"}' | node .claude/hooks/pre-bash-gate.mjs; echo "exit=$?"
echo '{"tool_input":{"command":"git push origin main"},"cwd":"C:/Users/Sagi/Desktop/Atlas-frontend"}' | node .claude/hooks/pre-bash-gate.mjs; echo "exit=$?"
```

Expected: exit=2 for all five, each with a clear stderr reason.

```bash
echo '{"tool_input":{"command":"rm -rf .next"},"cwd":"C:/Users/Sagi/Desktop/Atlas"}' | node .claude/hooks/pre-bash-gate.mjs; echo "exit=$?"
echo '{"tool_input":{"command":"npm test"},"cwd":"C:/Users/Sagi/Desktop/Atlas"}' | node .claude/hooks/pre-bash-gate.mjs; echo "exit=$?"
echo '{"tool_input":{"command":"git push origin main"},"cwd":"C:/Users/Sagi/Desktop/Atlas"}' | node .claude/hooks/pre-bash-gate.mjs; echo "exit=$?"
```

Expected: exit=0 for all three (safe delete, tests, supervisor push).

- [ ] **Step 4: Live-fire through the harness** — in the session, actually attempt `echo 'DROP TABLE test'` as a Bash call and confirm the harness blocks it with the hook's message. (New hooks may need a session restart to load — if it doesn't fire, note it for the founder-morning restart and rely on the direct tests above.)

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/pre-bash-gate.mjs .claude/settings.json
git commit -m "feat(harness): PreToolUse safety gate — DDL/rm-rf/.env/git-push enforcement"
```

---

### Task 7: PostToolUse format+typecheck hook

**Files:**
- Create: `.claude/hooks/post-edit-verify.mjs`
- Modify: `.claude/settings.json` (add PostToolUse block)
- Modify: `.gitignore` (ignore the hook's tsbuildinfo cache)

**Interfaces:**
- Consumes: PostToolUse stdin JSON: `{ tool_name, tool_input: { file_path }, cwd }`.
- Produces: prettier-formatted file + stderr tsc errors (exit 2 = feedback to the session).

- [ ] **Step 1: Write `.claude/hooks/post-edit-verify.mjs`:**

```javascript
#!/usr/bin/env node
// PostToolUse verifier — auto-format the edited file, then fast incremental typecheck.
// Exit 2 feeds stderr back to the session so errors are fixed immediately.
import { execSync } from 'node:child_process'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
let input = {}
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0)
}
const file = String(input.tool_input?.file_path ?? '')
if (!/\.(ts|tsx)$/.test(file) || /node_modules|\.next/.test(file)) process.exit(0)

try {
  execSync(`npx prettier --write "${file}"`, { stdio: 'pipe', timeout: 30000 })
} catch {
  /* prettier failure is non-fatal; tsc below catches real syntax errors */
}

try {
  execSync('npx tsc --noEmit --incremental --tsBuildInfoFile .claude/.tsbuildinfo-hook', {
    stdio: 'pipe',
    timeout: 90000,
  })
} catch (e) {
  const out = String(e.stdout ?? '').split('\n').slice(0, 25).join('\n')
  console.error(`TYPECHECK FAILED after editing ${file}:\n${out}`)
  process.exit(2)
}
process.exit(0)
```

- [ ] **Step 2: Wire in `.claude/settings.json`** (inside the same `"hooks"` object):

```json
"PostToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [{ "type": "command", "command": "node .claude/hooks/post-edit-verify.mjs" }]
  }
]
```

And append to `.gitignore`:
```
.claude/.tsbuildinfo-hook
```

- [ ] **Step 3: Unit-fire — break a file on purpose, then fix it**

```bash
printf 'export const broken: number = "not a number"\n' > src/lib/hooktest.ts
echo '{"tool_input":{"file_path":"src/lib/hooktest.ts"}}' | node .claude/hooks/post-edit-verify.mjs; echo "exit=$?"
```
Expected: exit=2, stderr contains `hooktest.ts` type error.

```bash
printf 'export const fine: number = 1\n' > src/lib/hooktest.ts
echo '{"tool_input":{"file_path":"src/lib/hooktest.ts"}}' | node .claude/hooks/post-edit-verify.mjs; echo "exit=$?"
rm src/lib/hooktest.ts
```
Expected: exit=0; file cleaned up.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/post-edit-verify.mjs .claude/settings.json .gitignore
git commit -m "feat(harness): PostToolUse hook — auto-format + incremental typecheck on every edit"
```

---

### Task 8: Permissions — clean + pre-approve the safe set

**Files:**
- Modify: `.claude/settings.json` (final shape: hooks from Tasks 6-7 + permissions below)
- Modify: `.claude/settings.local.json` (clean accumulated junk — **if the harness classifier blocks this edit, leave the file and write the replacement content into the launch kit for the founder to paste**)

- [ ] **Step 1: `.claude/settings.json` permissions block:**

```json
"permissions": {
  "allow": [
    "mcp__recall-ai__list_webhook_endpoints",
    "mcp__recall-ai__search_docs",
    "Bash(npm test)",
    "Bash(npx tsc --noEmit*)",
    "Bash(git status*)",
    "Bash(git diff*)",
    "Bash(git log*)",
    "Bash(git branch*)",
    "Bash(curl -s http://localhost:*)",
    "Bash(node scripts/live-replay-engine.mjs*)"
  ],
  "deny": [
    "Read(./.env*)",
    "Edit(./.env*)",
    "Edit(./.mcp.json)"
  ]
}
```

- [ ] **Step 2: Replace `.claude/settings.local.json` content with:**

```json
{
  "permissions": {
    "allow": [
      "Bash(npx supabase *)"
    ]
  }
}
```

- [ ] **Step 3: Sanity-check settings load** — run any trivial Bash (`git status`) in-session; if Claude Code reports a settings parse error, fix JSON. Verify `.mcp.json` and `.env.local` are still git-ignored:

Run: `git check-ignore .mcp.json .env.local agent-memory 2>/dev/null; git status --short`
Expected: first two paths print (ignored); status shows only intended changes.

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(harness): permissions — pre-approve safe reads, deny secrets"
```

---

### Task 9: The shared brain — agent-memory/

**Files:**
- Create: `agent-memory/BOARD.md`
- Create: `agent-memory/state-frontend.md`, `state-ivrit.md`, `state-multiview.md`, `state-supervisor.md`
- Create: `agent-memory/README.md`
- Modify: `.gitignore` (add `agent-memory/`, `design-import/`, `local-assets/`)

**Interfaces:**
- Produces: the board protocol consumed by all lane prompts, `/ship`, `/verify-app`, and the supervisor loop. Absolute path: `C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md`.

- [ ] **Step 1: `.gitignore` additions:**

```
agent-memory/
design-import/
local-assets/
```

- [ ] **Step 2: `agent-memory/BOARD.md` template:**

```markdown
# ATLAS FLEET BOARD — the shared brain
<!-- Protocol: read at session start + before big moves. Update ONLY your own lane section.
     Everyone may append to CROSS-CUTTING and READY-FOR-REVIEW. Timestamp every update. -->

## CROSS-CUTTING — read before any big move
<!-- schema changes (post BEFORE applying) · shared types · DS tokens · port/engine claims -->
- (empty)

## READY-FOR-REVIEW — lanes post here; supervisor picks up
<!-- format: [ts] lane · branch · what was built · how it was verified (screenshots/tests) -->
- (empty)

## Lane F — frontend-import (branch feat/frontend-import · port 3001)
- status: NOT STARTED — waiting for design-import/ export
- last verified: —
- next: —
- blockers: —

## Lane I — ivrit-pipeline (branch feat/ivrit-pipeline · port 3002)
- status: NOT STARTED
- last verified: —
- next: —
- blockers: —

## Lane M — multiview-backend (branch feat/multiview-backend · port 3003)
- status: NOT STARTED — waiting for local-assets/demo-report.pdf
- last verified: —
- next: —
- blockers: —

## Supervisor (main checkout · port 3000)
- status: environment built; awaiting fleet launch
- merged to main recently: —
```

- [ ] **Step 3: Each state file starts as:**

```markdown
# State — <lane name>
<!-- Private working memory. Owner-only writes. Write before walking away; read at start. -->

## Verified facts
- (none yet)

## Lessons learned  <!-- general ones graduate into skills via the supervisor -->
- (none yet)

## Last session
- (not started)
```

`agent-memory/README.md`:
```markdown
One physical copy of the fleet's shared memory, git-ignored, in the MAIN checkout only.
Worktrees reach it via the absolute path. BOARD.md = shared; state-*.md = per-session private.
```

- [ ] **Step 4: Verify ignore + commit**

Run: `git check-ignore agent-memory/BOARD.md && git status --short`
Expected: path prints (ignored); status shows only `.gitignore` modified.

```bash
git add .gitignore
git commit -m "feat(harness): agent-memory shared brain (board + state files, git-ignored)"
```

---

### Task 10: /verify-app skill

**Files:**
- Create: `.claude/skills/verify-app/SKILL.md`

- [ ] **Step 1: Write the skill:**

```markdown
---
name: verify-app
description: Self-verification with your own eyes before claiming ANY work is done — boot the right dev server, drive Chrome via MCP, screenshot, inspect, read console errors, iterate. Use before reporting a feature works, before /ship, and whenever UI changed. Includes per-lane recipes (frontend import, ivrit pipeline, multiview PDF).
---

# Verify App — see it before you say it

Claiming "done" without looking is forbidden. Evidence = screenshots you actually inspected +
console clean + tests green.

## Core loop (every lane)

1. Your dev server, YOUR port (rules/parallel-work.md): frontend 3001 · ivrit 3002 ·
   multiview 3003 · supervisor 3000. `npm run dev -- -p <port>` in your worktree.
2. Load Chrome MCP tools (ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,
   mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,
   mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__read_console_messages" in ONE call).
3. Navigate to the changed surface. HARD-REFRESH first (stale bundle = #1 false negative).
4. Screenshot → LOOK at it: layout, RTL/bidi, fonts, spacing, empty states.
5. Read console messages — zero uncaught errors allowed.
6. Interact (click/scroll/type) through the feature's main path.
7. Broken → fix → repeat. Only a clean pass counts as verified.
8. `npm test` + `npx tsc --noEmit` green.
9. Record what you verified (one line + screenshot refs) in your board section.

## Lane recipes

**Frontend import:** screenshot each imported page vs its reference in design-import/ —
side-by-side compare (structure, spacing, typography, colors). Check both EN and HE (RTL flip).
Workspace/Agents pages must render fully from stub data (no backend calls).

**Ivrit pipeline:** replay the archived session (scripts/out/sessions/2026-07-01-tamis-live/)
through YOUR pipeline; assert programmatically: word timestamps strictly non-decreasing,
word coverage vs audio duration ≥ expected, caption-vs-audio drift within buffer budget
(unit-test these like liveTiming.test.ts). Compare transcript quality vs the Recall-path
output on the same audio (scripts/run-experiment.ts pattern). Then WATCH it: open the live
page mid-replay, screenshot karaoke, confirm highlighted word matches the audio position.

**Multiview:** ingest local-assets/demo-report.pdf → assert extracted per-page text contains
known Hebrew strings in CORRECT order (RTL extraction is the known risk) → render in pdf.js →
via Chrome MCP select text inside the PDF → trigger Ask Atlas → the answer must reference the
marked passage → screenshot the multi-panel layout.

## Gotchas (do not re-learn)
- Hard-refresh after every dev restart; `rm -rf .next` on MODULE_NOT_FOUND 500.
- Screenshot BEFORE and AFTER fixes — the before/after pair is your review evidence.
- If Chrome MCP is unresponsive 2-3 tries → tell the founder, don't loop.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/verify-app/
git commit -m "feat(harness): /verify-app skill — the self-seeing verification loop"
```

---

### Task 11: /ship skill

**Files:**
- Create: `.claude/skills/ship/SKILL.md`

- [ ] **Step 1: Write the skill:**

```markdown
---
name: ship
description: The shipping ritual for any finished mini-feature — sync main, run the full verification battery, post READY-FOR-REVIEW to the board (lanes) or review+merge+push (supervisor), log PROGRESS.md. Use whenever work is ready to leave a branch.
---

# Ship — how work reaches main

main is always working. Only the supervisor pushes it. There are two roles:

## If you are a LANE session

1. Update your board section; re-read CROSS-CUTTING (someone may have changed shared surfaces).
2. `git fetch origin && git merge origin/main` into your branch; resolve; re-run everything.
3. Battery: `npm test` (all pass) · `npx tsc --noEmit` (clean) · `npm run build` (green) ·
   `/verify-app` (clean pass with screenshots).
4. Small labeled commits only — split anything mixed.
5. Push YOUR BRANCH: `git push -u origin <your-branch>` (pushing main is hook-blocked).
6. Post to BOARD.md READY-FOR-REVIEW: timestamp · lane · branch · what it does · how verified
   (evidence refs) · any migrations/shared-surface changes.
7. Update your state file (lessons learned → note candidates for skill graduation). Move on
   to your next step or wait if blocked.

## If you are the SUPERVISOR

1. Pick the oldest READY-FOR-REVIEW entry. `git fetch origin && git checkout <branch>`.
2. COLD review of `git diff main...<branch>`: correctness, iron rules (additive-only DB, RTL,
   no legacy imports), scope creep, secrets. Spot-check the lane's evidence; re-run
   `npm test` + build yourself. You are the fresh-eyes gate — do not rubber-stamp.
3. Verdict on the board: APPROVED (proceed) or CHANGES (list them in the lane's section; done).
4. Merge: `git checkout main && git merge --no-ff <branch>` → battery again on main →
   `git push origin main`. Delete merged branch. (Worktree branches: coordinate with the lane
   before deleting.)
5. Append PROGRESS.md entry (3-5 bullets: what + why + verification). Commit + push.
6. Update the Supervisor board section; ping the founder when a MILESTONE is testable.
7. Distill: any general lesson from this ship → the relevant skill or rules file.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/ship/
git commit -m "feat(harness): /ship skill — lane and supervisor shipping ritual"
```

---

### Task 12: Environment verification battery (spec §9)

**Files:** none created — this task proves the environment.

- [ ] **Step 1: Hook battery (direct fire)** — re-run every blocked/allowed case from Task 6 Step 3 and Task 7 Step 3. All expected exits must match.

- [ ] **Step 2: Two-worktree board sync proof**

```bash
git worktree add ../Atlas-synctest -b synctest
node -e "const fs=require('fs');fs.appendFileSync('C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md','\n<!-- sync-test '+Date.now()+' -->')"
```
Then from the OTHER side:
```bash
cd ../Atlas-synctest && node -e "const s=require('fs').readFileSync('C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md','utf8');console.log(s.includes('sync-test')?'SYNC OK':'SYNC FAIL')"
cd ../Atlas && git worktree remove ../Atlas-synctest --force && git branch -D synctest
```
Expected: `SYNC OK`; worktree removed. Remove the test line from BOARD.md.

- [ ] **Step 3: Cold-session orientation dry run** — dispatch a fresh-context subagent (general-purpose) with ONLY this prompt: *"You are a fresh session in C:/Users/Sagi/Desktop/Atlas. Orient yourself from the project environment alone, then report: (1) what this project is, (2) the iron rules, (3) where the live fleet state lives and the current lane statuses, (4) which rules file you'd read before touching the DB, (5) how finished work reaches main."* Verify the report names: shared-DB additive-only, BOARD.md path, rules files, /ship + supervisor gate. Any miss → fix the doc that should have taught it → re-run.

- [ ] **Step 4: Full battery on the branch**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 45 pass · clean · build green.

---

### Task 13: The launch kit

**Files:**
- Create: `docs/LAUNCH-KIT.md`
- Modify: `ARCHITECTURE.md` (§7 harness table — replace "No hooks yet" row with hooks/rules/skills reality; add agent-memory row)

- [ ] **Step 1: Write `docs/LAUNCH-KIT.md`** with: (a) morning checklist for the founder — drop the Claude Design export into `design-import/`, drop the demo annual-report PDF at `local-assets/demo-report.pdf`, restart this Claude session once (loads new hooks/settings); (b) the worktree commands:

```bash
git worktree add ../Atlas-frontend  -b feat/frontend-import
git worktree add ../Atlas-ivrit     -b feat/ivrit-pipeline
git worktree add ../Atlas-multiview -b feat/multiview-backend
```

(c) how to open the 3 sessions (new terminal per folder → `claude`); (d) THE THREE OPENING PROMPTS, complete and paste-ready. Each prompt must contain: lane identity + branch + port; "read CLAUDE.md, your rules (.claude/rules/parallel-work.md + relevant), and the board (C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md) before anything"; the lane's mission + inputs (F: design-import/, replicate exactly incl. Workspace+Agents on stub data behind one clean interface; I: audio-only Recall → RunPod IVRIT → word timestamps → existing karaoke UX, test bench = scripts/out/sessions/2026-07-01-tamis-live/ via live-replay-engine; M: PDF ingest→store→extract per page→pdf.js render→mark-text→Ask Atlas, fixture = local-assets/demo-report.pdf, day-one spike = Hebrew extraction order); milestone 1 definition of done; the laws (work small, /verify-app before any "done", /ship to finish, never push main, board discipline); (e) the supervisor loop description. Write every prompt out in full — no placeholders.

- [ ] **Step 2: Update ARCHITECTURE.md §7 harness table** to list: settings.json (hooks + permissions), hooks/ (2 scripts), rules/ (3 files), skills (4), agent-memory/ (git-ignored shared brain), LAUNCH-KIT pointer.

- [ ] **Step 3: Commit**

```bash
git add docs/LAUNCH-KIT.md ARCHITECTURE.md
git commit -m "docs(harness): founder launch kit — worktrees + 3 lane opening prompts + supervisor loop"
```

---

### Task 14: Ship the environment through its own ritual

- [ ] **Step 1: Run /ship as the supervisor** for `feat/smart-environment`: battery (`npm test` · `tsc` · `build`) → cold self-review of `git diff main...feat/smart-environment` → merge `--no-ff` to main → battery on main → push origin main → delete branch.

- [ ] **Step 2: Append the PROGRESS.md entry** (3-5 bullets: smart environment built — hooks tested by firing, board proven across worktrees, cold-session dry run passed, launch kit ready) → commit → push.

- [ ] **Step 3: Update the board** — Supervisor section: "environment shipped; fleet ready to launch pending founder's morning assets (design export + demo PDF)."

---

## Self-review (writing-plans checklist)

- **Spec coverage:** §1 floors → Tasks 6-13; §2 memory → Task 9 (+12.2 proof); §3 hooks → Tasks 6-7 (+12.1); §4 rules → Task 4; §5 diet → Task 3; §6 skills → Tasks 10-11; §7 permissions → Task 8; §8 launch kit → Task 13; §9 verification → Task 12; build order preserved (docs→hooks→memory→skills→verify→kit; Prettier baseline inserted before the format hook needs it; asset archival first). Locked decisions honored: supervisor-gated merges (Task 11, hook rule 4), additive-only lanes (hook rule 1 + rules/db.md), design source = founder export (Task 13 checklist).
- **Placeholder scan:** all file contents written in full; the one intentionally-summarized item (VISION.md receives *moved* text that already exists in git history — Task 3 Step 1 names the exact sections to move).
- **Type consistency:** hook I/O shapes consistent (`tool_input.command` / `tool_input.file_path`, `cwd`); paths consistent (`agent-memory/BOARD.md` absolute form everywhere; port map identical in rules, skills, board, kit); branch names identical in board template and worktree commands.
