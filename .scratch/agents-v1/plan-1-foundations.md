# Agents V1 — Plan 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the Managed Agents mechanism end to end and land the agent schema on
production through the DDL gate — so every later slice builds on verified ground.

**Architecture:** Two gates, in order. First the client: bump `@anthropic-ai/sdk` and find out
whether the native per-run spend cap is expressible, because the answer changes the spec (§6).
Then the mechanism: a throwaway-to-nobody smoke script that creates an environment, an agent,
a memory store and a session, answers one custom-tool round-trip, writes to memory, and proves
a *second* session reads it back — the single claim the whole design rests on. Only then the
four tables, reviewed on file before they touch a live database.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase (Postgres 17.6) · vitest ·
`@anthropic-ai/sdk` (Managed Agents beta, `managed-agents-2026-04-01`).

**Spec:** `.scratch/agents-v1/spec.md` — read it before Task 1. This plan argues from it.

**Ships:** nothing user-visible. It ships *certainty*: a proven connection, a known answer on
the budget cap, and a schema that is live and owner-scoped.

## Global Constraints

Copied verbatim from the spec and the repo's standing law. Every task's requirements
implicitly include this section.

- **Supabase is Atlas PRODUCTION.** Additive-only. `CREATE TABLE` / `ADD COLUMN` /
  `CREATE INDEX` allowed; `DROP` / `TRUNCATE` / destructive `ALTER` are hook-blocked.
- **The DDL gate is not optional** (`.claude/rules/db.md`): write the migration file → push
  the branch → run the `atlas-reviewer` agent **on the file** → append to `COLLISIONS.md` →
  **tell the founder** → *then* apply. Applying first is the one thing this database cannot
  take back, and it has gone wrong twice (20260801_014, migration 029).
- **The destructive-SQL hook pattern-matches anywhere in a Bash command**, including commit
  messages and compound commands. Do not write `drop`, `truncate` or `delete from` in a commit
  message. Reword.
- **Every new user-facing table gets all four**, at `CREATE TABLE`, never bolted on:
  `user_id uuid not null references auth.users(id) on delete cascade` (the real FK, not a
  bare uuid) · `enable row level security` · a policy scoped on **both** sides
  (`using (auth.uid() = user_id)` **and** `with check (auth.uid() = user_id)`) granted to
  `authenticated`, never `public` · `create index on <table>(user_id)`.
- **Never write `using (true) with check (true)`** "for the service role" — the service key
  bypasses RLS and needs no policy; such a policy is granted to `public` and opens the table
  to the anon key that ships in the browser bundle.
- **Model:** `claude-sonnet-5` (spec §0e). **Budget:** `$1.00` per run = `max_list_cost.amount`
  of `"100"` — an integer string in **cents**, `USD` only. `"1.00"` is rejected.
- **Israel time everywhere.** `Asia/Jerusalem`. Any wall-clock formatting goes through
  `src/lib/i18n/format.ts`, the only file permitted to name a timezone.
- **`main` is pushed from the primary checkout, never from a worktree** — hook-enforced. This
  plan runs on branch `claude/new-worktree-setup-35b4ef`.
- Commands: `npm test` · `npx tsc --noEmit` · `npm run build` · `npm run env:health` ·
  `npm run ship:gate`. **Never run `npm run build` while a dev server is up in the same
  checkout** — they share one `.next` and the build kills the running server.

---

### Task 1: Bump the SDK and settle the budget question

The spec's one open risk (§6): the `$1.00` hard cap is founder-approved, but `budget` /
`max_list_cost` are **not typed in the installed `@anthropic-ai/sdk` 0.102.0** (verified by
inspection). This task produces a yes-or-no. If it is no, the founder is told before anything
is built on a softer cap.

**Files:**
- Modify: `package.json` (the `@anthropic-ai/sdk` dependency line)
- Modify: `package-lock.json`
- Create: `src/lib/agents/budget.ts`
- Test: `src/lib/agents/budget.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RUN_BUDGET_CENTS: number` (= `100`) and
  `runBudget(): { type: 'limit'; max_list_cost: { amount: string; currency: 'USD' } }` —
  every later slice builds its session budget from this one function, so the cents-as-string
  rule lives in exactly one place.

- [ ] **Step 1: Record the "before" state so the bump's blast radius is measurable**

```bash
npx tsc --noEmit 2>&1 | tail -5
npm test 2>&1 | tail -15
```

Write both results into your notes. A green battery **before** the bump is what makes a red
battery after it attributable. Do not skip this — `rules/app.md` M1: a green signal proves
only what it measured, and you cannot measure a regression you have no baseline for.

- [ ] **Step 2: Bump the SDK**

```bash
npm install @anthropic-ai/sdk@latest
node -e "console.log(require('./node_modules/@anthropic-ai/sdk/package.json').version)"
```

- [ ] **Step 3: Verify `budget` is now expressible — the whole point of this task**

```bash
grep -rn "max_list_cost" node_modules/@anthropic-ai/sdk/resources/beta/sessions/sessions.d.ts | head
```

Expected: at least one hit, on the session-create params.

**If there are zero hits, STOP.** Do not continue to Step 4 and do not proceed to Task 2.
Report to the founder in these words: *the native hard cap is not available in any published
SDK; the fallback is our own accounting on the run row, which is a softer cap — it stops the
next run, not the current one.* Spec §6 already states he is told before that ships. His call,
not yours.

- [ ] **Step 4: Write the failing test**

```ts
// src/lib/agents/budget.test.ts
import { describe, expect, it } from 'vitest'
import { RUN_BUDGET_CENTS, runBudget } from './budget'

describe('runBudget', () => {
  it('is the founder-approved $1.00 per run', () => {
    expect(RUN_BUDGET_CENTS).toBe(100)
  })

  // The API takes MINOR UNITS as an integer STRING. A decimal form ("1.00") and a
  // number (100) are both rejected by the API, and both are what a reader reaches
  // for first — which is exactly why this is pinned rather than trusted.
  it('serialises cents as an integer string, never a decimal or a number', () => {
    const b = runBudget()
    expect(b.max_list_cost.amount).toBe('100')
    expect(typeof b.max_list_cost.amount).toBe('string')
    expect(b.max_list_cost.amount).not.toContain('.')
  })

  it('is USD, the only supported currency', () => {
    expect(runBudget().max_list_cost.currency).toBe('USD')
  })

  it('is a limit budget', () => {
    expect(runBudget().type).toBe('limit')
  })
})
```

- [ ] **Step 5: Run it to make sure it fails**

Run: `npx vitest run src/lib/agents/budget.test.ts`
Expected: FAIL — `Failed to resolve import "./budget"`.

- [ ] **Step 6: Write the minimal implementation**

```ts
// src/lib/agents/budget.ts
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE PLACE THE RUN BUDGET IS SPELLED. Founder-approved 2026-08-16: $1.00
// hard cap per run, ~$0.50 typical (spec §6).
//
// Anthropic enforces this as a PRE-REQUEST gate: before each model request it
// checks consumed list cost against the cap and pauses the session if reached.
// The request that crosses the cap completes, so the final figure can exceed the
// cap by at most one model request. It is a bound on NEW work, not an exact stop.
//
// `amount` is MINOR UNITS (cents) as an INTEGER STRING — a string so no float
// rounding is ever applied. "1.00" is rejected by the API; so is the number 100.
// That trap is why this is a function with a test rather than an inline literal.
// ─────────────────────────────────────────────────────────────────────────────

export const RUN_BUDGET_CENTS = 100

export function runBudget() {
  return {
    type: 'limit' as const,
    max_list_cost: { amount: String(RUN_BUDGET_CENTS), currency: 'USD' as const },
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/lib/agents/budget.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Prove the bump did not break the live chat route**

The SDK is a **shared dependency on a product with live users** — `/api/chat/v2` is the only
chat route and every surface depends on it (spec §6).

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: all three green, and `npm test` at the same pass count as Step 1 plus the 4 new
tests. **A different count is a regression, not a rounding error** — investigate before
committing. If `tsc` now fails inside `src/lib/chat2/` or `src/app/api/chat/v2/`, the bump
carried a breaking change: report it to the founder with the exact errors rather than
patching chat2 to suit an agents slice.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/lib/agents/budget.ts src/lib/agents/budget.test.ts
git commit -m "chore(agents-1): bump anthropic sdk and pin the \$1.00 run budget shape

Settles spec §6's open risk: max_list_cost is expressible. Cents as an
integer string is pinned by test — the decimal and number forms are both
rejected by the API and are what a reader reaches for first.

Chat v2 re-verified green on the bumped SDK (tsc, battery, build)."
```

---

### Task 2: Prove the mechanism before building anything on it

The spec rests on claims no test in this repo can reach: that a session answers a custom-tool
round-trip, that a memory store survives a session, and that a *second* session reads back
what the first one wrote. If memory does not persist, spec §1's central founder decision is
unbuildable and he needs to know today, not in slice 3.

This is a **verification script**, not app code. It is committed because the next person to
doubt any of these claims should re-run it rather than re-derive it.

**Files:**
- Create: `scripts/agents-smoke.mjs`
- Create: `docs/evidence/agents-v1/mechanism.md` (written by the script run, by hand)
- Modify: `.env.local` (add `ANTHROPIC_ENVIRONMENT_ID` — **git-ignored, never committed**)

**Interfaces:**
- Consumes: `ANTHROPIC_API_KEY` from the environment.
- Produces: a persisted `ANTHROPIC_ENVIRONMENT_ID` (one cloud environment, reused by every
  agent forever — it is a template, not per-agent), and a written record of whether the four
  claims hold.

- [ ] **Step 1: Write the smoke script**

```js
// scripts/agents-smoke.mjs
// Managed Agents mechanism check for Agents V1 (spec .scratch/agents-v1/spec.md).
// Proves FOUR claims the design rests on and no unit test can reach:
//   1. we can create an environment, an agent object and a memory store
//   2. a session answers a CUSTOM TOOL round-trip (spec §4 — the agent stops
//      and waits for OUR server; if this does not work, nothing else matters)
//   3. the agent can write to its memory store
//   4. a SECOND session, after the first is deleted, READS THAT BACK
//      (spec §1 — the founder's memory-at-Anthropic decision stands or falls here)
//
// Run: node scripts/agents-smoke.mjs
// Costs a few cents. Creates one environment you should KEEP (print its id into
// .env.local as ANTHROPIC_ENVIRONMENT_ID) and one agent + memory store you should
// keep for the duration of the check only.

import Anthropic from '@anthropic-ai/sdk'
import fs from 'node:fs'

// .env.local is not loaded outside Next, so read it the way the other scripts do.
if (!process.env.ANTHROPIC_API_KEY && fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const say = (...a) => console.log(...a)

// The one fact the agent will be told and asked to remember. Deliberately
// something the model cannot know or guess, so a later "recall" cannot be a
// lucky generation — rules/app.md M2: never let a check certify an untrue premise.
const SECRET = `atlas-smoke-${process.pid}-${process.ppid}`

async function main() {
  // ---- claim 1: the three objects -----------------------------------------
  const env = await client.beta.environments.create({
    name: `atlas-agents-${Date.now()}`,
    config: { type: 'cloud', networking: { type: 'unrestricted' } },
  })
  say('environment:', env.id, '  <-- put this in .env.local as ANTHROPIC_ENVIRONMENT_ID')

  const store = await client.beta.memoryStores.create({
    name: 'atlas smoke notebook',
    description: 'Scratch notebook for the Atlas mechanism check.',
  })
  say('memory store:', store.id)

  const agent = await client.beta.agents.create({
    name: 'Atlas smoke agent',
    model: 'claude-sonnet-5',
    system:
      'You are a check harness. Follow instructions literally and briefly. ' +
      'When asked to remember something, write it to a file under your memory mount.',
    tools: [
      { type: 'agent_toolset_20260401', default_config: { enabled: true } },
      {
        type: 'custom',
        name: 'atlas_ping',
        description: 'Ask the Atlas server for a value. Returns a short string.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
    ],
  })
  say('agent:', agent.id, 'v' + agent.version)

  // ---- claims 2 + 3: custom tool round-trip, and a memory write ------------
  const first = await client.beta.sessions.create({
    agent: agent.id,
    environment_id: env.id,
    resources: [{ type: 'memory_store', memory_store_id: store.id, access: 'read_write' }],
    // Same shape src/lib/agents/budget.ts produces. Kept literal here so this
    // script stays runnable if the app code is mid-refactor.
    budget: { type: 'limit', max_list_cost: { amount: '100', currency: 'USD' } },
  })
  say('session 1:', first.id)
  say('trace: https://platform.claude.com/workspaces/default/sessions/' + first.id)

  // STREAM BEFORE SEND. The stream only delivers events emitted after it opens;
  // send-then-stream loses the early ones. This ordering is spec §4 step 2.
  const stream1 = await client.beta.sessions.events.stream(first.id)
  await client.beta.sessions.events.send(first.id, {
    events: [
      {
        type: 'user.message',
        content: [
          {
            type: 'text',
            text:
              'Call the atlas_ping tool exactly once. Then write the value it returns ' +
              'into a file called note.md on your memory mount. Then say DONE.',
          },
        ],
      },
    ],
  })

  let toolRoundTripped = false
  for await (const ev of stream1) {
    if (ev.type === 'agent.custom_tool_use' && ev.name === 'atlas_ping') {
      toolRoundTripped = true
      say('  custom tool called; answering from OUR side')
      await client.beta.sessions.events.send(first.id, {
        events: [
          {
            type: 'user.custom_tool_result',
            custom_tool_use_id: ev.id,
            content: [{ type: 'text', text: SECRET }],
          },
        ],
      })
    }
    if (ev.type === 'session.status_terminated') break
    // Idle is NOT the end — a session idles between parallel tools and whenever it
    // is waiting on us. Only a non-requires_action stop_reason is terminal.
    if (ev.type === 'session.status_idle' && ev.stop_reason?.type !== 'requires_action') break
  }
  say('claim 2 — custom tool round-trip:', toolRoundTripped ? 'PASS' : 'FAIL')

  const stored = await client.beta.memoryStores.memories.list(store.id, { view: 'full' })
  const wrote = JSON.stringify(stored.data ?? stored).includes(SECRET)
  say('claim 3 — agent wrote to memory:', wrote ? 'PASS' : 'FAIL')

  // Delete session 1 exactly as a finished run will (spec §4 step 4): the SESSION
  // goes, the MEMORY STORE stays. That distinction is the whole point of claim 4.
  await client.beta.sessions.delete(first.id)

  // ---- claim 4: memory outlives the session -------------------------------
  const second = await client.beta.sessions.create({
    agent: agent.id,
    environment_id: env.id,
    resources: [{ type: 'memory_store', memory_store_id: store.id, access: 'read_write' }],
    budget: { type: 'limit', max_list_cost: { amount: '100', currency: 'USD' } },
  })
  const stream2 = await client.beta.sessions.events.stream(second.id)
  await client.beta.sessions.events.send(second.id, {
    events: [
      {
        type: 'user.message',
        content: [
          {
            type: 'text',
            text: 'Read note.md from your memory mount and reply with its contents verbatim.',
          },
        ],
      },
    ],
  })

  let recalled = ''
  for await (const ev of stream2) {
    if (ev.type === 'agent.message') {
      for (const b of ev.content) if (b.type === 'text') recalled += b.text
    }
    if (ev.type === 'session.status_terminated') break
    if (ev.type === 'session.status_idle' && ev.stop_reason?.type !== 'requires_action') break
  }
  const remembered = recalled.includes(SECRET)
  say('claim 4 — memory survived the session:', remembered ? 'PASS' : 'FAIL')
  if (!remembered) say('  agent said:', JSON.stringify(recalled.slice(0, 300)))

  await client.beta.sessions.delete(second.id)

  say('')
  say('KEEP:   environment', env.id)
  say('DELETE: memory store', store.id, 'and agent', agent.id, '— smoke scratch, not app data')
  say('NOTE:   archive is PERMANENT on all of these and there is no unarchive (spec §9.5).')
}

main().catch((e) => {
  console.error('smoke failed:', e?.status ?? '', e?.message ?? e)
  process.exit(1)
})
```

- [ ] **Step 2: Run it**

Run: `node scripts/agents-smoke.mjs`
Expected: four `PASS` lines and an environment id.

**Failure triage, in order — do not guess:**
- **401** → the API key. STATUS.md flags Railway's `ANTHROPIC_API_KEY` as unproven; locally it
  is `.env.local`. Check this *first* on any failure, per spec §9.3.
- **404 on `client.beta.memoryStores`** → the SDK is older than the feature. Re-check Task 1
  actually bumped, and report; do not work around it.
- **Claim 2 FAIL** → the custom-tool round-trip is the load-bearing mechanism of spec §4.
  Stop and report; every later slice is built on it.
- **Claim 4 FAIL** → memory does not survive a session, and the founder's 2026-08-16 decision
  is unbuildable as specified. **Stop and tell him.** Do not silently fall back to memory in
  Supabase — that is the decision he explicitly reversed, and reversing it back without asking
  would be deciding his product for him.

- [ ] **Step 3: Record the result as evidence, not as a memory**

```bash
mkdir -p docs/evidence/agents-v1
```

Write `docs/evidence/agents-v1/mechanism.md` by hand containing: the date, the SDK version
from Task 1, the four claims with PASS/FAIL **as printed**, the environment id, and the exact
`session.status_idle` stop reasons observed. Numbers get copied from the run output — never
restated from this plan. `rules/app.md` M1: a count hand-carried from another document has
been wrong every time.

- [ ] **Step 4: Persist the environment id**

Append to `.env.local` (git-ignored — verify with `git check-ignore .env.local` before you
write a secret near it):

```
ANTHROPIC_ENVIRONMENT_ID=env_...
```

Note in the evidence file that this value must also be set on Railway before any agent runs in
production, and that it is **not** a secret — it is an id — but it is required.

- [ ] **Step 5: Clean up the scratch objects, and read the warning first**

The smoke agent and memory store are scratch. Archive is **permanent and cascades** (spec
§9.5) — there is no unarchive on an agent, environment, memory store or deployment. Archive
**only** the two ids the script printed under `DELETE:`. **Do not archive the environment** —
you are about to depend on it.

- [ ] **Step 6: Commit**

```bash
git add scripts/agents-smoke.mjs docs/evidence/agents-v1/mechanism.md
git commit -m "test(agents-1): prove the managed-agents mechanism end to end

Four claims the design rests on and no unit test can reach: the three
objects create; a session answers a custom-tool round-trip from our side;
the agent writes to its memory store; and a SECOND session reads it back
after the first is gone.

That last one is the founder's 2026-08-16 memory-at-anthropic decision,
now measured rather than assumed. Results in docs/evidence/agents-v1/."
```

---

### Task 3: The migration file — written and reviewed, NOT applied

**This task does not touch the database.** It ends with a reviewed file and a founder
notification. Applying is Task 4, and the split is the point: `rules/db.md` exists because
migration `20260801_014` was applied first and reviewed second, which made the reviewer's
"narrow the scope" verdict unactionable by design.

**Files:**
- Create: `supabase/migrations/20260816_032_agents.sql`
- Modify: `COLLISIONS.md` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `agents`, `agent_runs`, `agent_findings`, `agent_run_files` — the column
  names Task 5 and every later slice bind to.

- [ ] **Step 1: Confirm the migration number is free**

```bash
ls supabase/migrations/ | tail -3
```

Expected: the highest is `20260814_031_search_chunks_scope_counts.sql`, so `032` is next. **If
something numbered 032 or higher exists, another session got there first** — stop, read
`COLLISIONS.md`, and renumber rather than colliding.

- [ ] **Step 2: Write the migration**

```sql
-- 032 — agents: the personal layer for Agents V1 (.scratch/agents-v1/spec.md §3).
--
-- ADDITIVE ONLY. Reviewed on the file BEFORE apply, per .claude/rules/db.md.
--
-- PERSONAL DATA, NOT SHARED CORPUS. Every table here is one fund's own work, so
-- all four ownership requirements apply to each: the real FK to auth.users, RLS
-- on, a policy scoped on BOTH sides to `authenticated`, and an index on user_id.
-- This copies the projects/workspaces shape (user client, RLS load-bearing), NOT
-- the supabaseAdmin + app-filter shape half the existing schema uses.
--
-- WHAT IS DELIBERATELY NOT HERE. The agent's MEMORY. Founder decision 2026-08-16:
-- what the agent KNOWS lives in an Anthropic memory store; what Atlas SHOWS and
-- OWNS lives here. `anthropic_memory_store_id` is a pointer, never a copy.

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- free text from the create form; `context` is the "who you are", `mission`
  -- the "what to do". Both go into the Anthropic agent's system prompt.
  context text,
  mission text not null,
  -- Assignment. NULLABLE — an unassigned agent is valid (spec §0d) and works
  -- from its mission text alone. For Company/Sector this is context plus a soft
  -- default scope; for Workspace/Report it is an ACCESS BOUNDARY read from this
  -- row through the handler closure, never from the model (spec §2.2).
  scope_kind text,
  scope_target_id text,
  scope_target_label text,
  constraint agents_scope_kind_known check (
    scope_kind is null
    or scope_kind in ('Call', 'Workspace', 'Company', 'Sector', 'Report')
  ),
  -- Pointers into Anthropic. Nullable because the row is written first and the
  -- remote objects are created immediately after; a row with nulls here is an
  -- agent whose creation did not finish, and the UI must say so rather than
  -- render it as ready (rules/app.md: degradation must be VISIBLE).
  anthropic_agent_id text,
  anthropic_memory_store_id text,
  anthropic_deployment_id text,
  -- Schedule (spec §4.1). NULL cadence = manual only. Timezone is Israel by the
  -- founder's 2026-08-09 ruling; stored explicitly so a future per-fund timezone
  -- is an ADD COLUMN and not a data migration.
  schedule_cadence text,
  schedule_timezone text not null default 'Asia/Jerusalem',
  schedule_paused boolean not null default false,
  status text not null default 'active',
  constraint agents_status_known check (status in ('active', 'creating', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists agents_user_idx on public.agents (user_id);
alter table public.agents enable row level security;

-- BOTH sides. A USING-only policy lets a row be written to someone else's id.
-- Granted to `authenticated`, never `public` — the anon key ships in the browser.
create policy agents_owner on public.agents
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- `manual` = the Run button or first run; `scheduled` = Anthropic's deployment
  -- fired it and our sweep attached (spec §4.1).
  trigger text not null default 'manual',
  constraint agent_runs_trigger_known check (trigger in ('manual', 'scheduled')),
  status text not null default 'running',
  constraint agent_runs_status_known check (status in ('running', 'finished')),
  -- Exactly one honest outcome per finished run (spec §5). NULL while running.
  -- `never_started` is a scheduled firing Anthropic could not turn into a session
  -- at all — a schedule that silently stops firing is this feature's worst failure.
  outcome text,
  constraint agent_runs_outcome_known check (
    outcome is null
    or outcome in ('completed', 'found_nothing', 'budget_reached', 'failed', 'stalled', 'never_started')
  ),
  constraint agent_runs_finished_has_outcome check (status <> 'finished' or outcome is not null),
  anthropic_session_id text,
  -- Authoritative per-session figure is Anthropic's usage.list_cost; a client-side
  -- estimate is never billed onward (spec §6).
  list_cost_cents integer,
  error_message text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists agent_runs_user_idx on public.agent_runs (user_id);
create index if not exists agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);
-- The sweep (spec §4.1) asks one question every minute: which runs are still
-- running? Indexed so that stays cheap as run history grows.
create index if not exists agent_runs_running_idx on public.agent_runs (status) where status = 'running';
alter table public.agent_runs enable row level security;

create policy agent_runs_owner on public.agent_runs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.agent_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  -- SPEC §0a, THE ANTI-FABRICATION MECHANISM. A finding cannot exist without a
  -- source. NOT NULL is half of it; the CHECK is the other half, because '' is
  -- not null and an empty source is exactly the shape a lazy caller produces.
  source text not null,
  constraint agent_findings_source_present check (length(btrim(source)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists agent_findings_user_idx on public.agent_findings (user_id);
create index if not exists agent_findings_run_idx on public.agent_findings (run_id, created_at);
alter table public.agent_findings enable row level security;

create policy agent_findings_owner on public.agent_findings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.agent_run_files (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Path inside Supabase Storage. The bytes live there; this row is the index.
  storage_path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists agent_run_files_user_idx on public.agent_run_files (user_id);
create index if not exists agent_run_files_run_idx on public.agent_run_files (run_id);
alter table public.agent_run_files enable row level security;

create policy agent_run_files_owner on public.agent_run_files
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 3: Review the file with cold eyes — before it can touch production**

Dispatch the `atlas-reviewer` agent against
`supabase/migrations/20260816_032_agents.sql`, asking it explicitly to check the four
ownership requirements from `.claude/rules/db.md`, the policy shape on both sides, the grant
target (`authenticated`, not `public`), and whether any statement is destructive.

Fix what it finds and **re-review the fixed file**. `COLLISIONS.md` records this exact failure
twice: migration 029 was materially rewritten *after* its round-1 verdict and applied anyway,
so the approval covered a file that never ran.

- [ ] **Step 4: Append to COLLISIONS.md — BEFORE applying, not at ship time**

```bash
node scripts/append-log.mjs collisions "2026-08-16 · claude/new-worktree-setup-35b4ef · MIGRATION 032 about to be applied — supabase/migrations/20260816_032_agents.sql. Additive, four new tables only (agents, agent_runs, agent_findings, agent_run_files), no existing table touched. All four are PERSONAL layer and carry the full rules/db.md set: real FK to auth.users, RLS on, owner policy on BOTH using and with check, granted to authenticated only, index on user_id. Reviewed on the file (atlas-reviewer, APPROVED) before apply. Bites: any session adding agent tables — these are them; and note agent_findings.source is NOT NULL plus a non-blank CHECK, which is spec 0a's anti-fabrication mechanism and not a formality."
```

**The last four slices appended at ship time instead of before, and `COLLISIONS.md` names that
as a recurrence with no mechanism.** This one is before. Do not let it slip.

- [ ] **Step 5: Tell the founder, and wait**

`rules/db.md`: the founder is told before DDL is applied to production. Post the migration
path, the four table names, that it is additive-only, and the reviewer's verdict. **Then
stop.** Task 4 does not begin until he answers.

- [ ] **Step 6: Commit the file and the log**

```bash
git add supabase/migrations/20260816_032_agents.sql COLLISIONS.md
git commit -m "feat(agents-1): agent tables migration, reviewed on file, not yet applied

Four personal-layer tables per spec §3, each with the full rules/db.md
ownership set. Reviewed before apply, COLLISIONS appended before apply,
founder told before apply — the gate that 20260801_014 and 029 inverted."
```

---

### Task 4: Apply the migration

Begins **only** after the founder answers Task 3 Step 5.

**Files:** none — this task changes the live database, not the repo.

- [ ] **Step 1: Apply**

Use the Supabase MCP `apply_migration` tool with the file's contents, or the Supabase SQL
editor. **One tab.** `COLLISIONS.md` records an index rebuild that failed because two tabs
raced the same statement.

- [ ] **Step 2: Verify what actually landed — not that the command returned**

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('agents','agent_runs','agent_findings','agent_run_files');

select tablename, policyname, roles, cmd, qual is not null as has_using,
       with_check is not null as has_with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('agents','agent_runs','agent_findings','agent_run_files');
```

Expected: four tables, `rowsecurity = true` on every one; four policies, each with
`roles = {authenticated}` and **both** `has_using` and `has_with_check` true.

**`roles = {public}` on any row is a live hole** — the anon key ships in the browser bundle.
`rules/db.md` names two existing tables flagged by Supabase's own linter for exactly this.
Fix immediately; do not defer.

- [ ] **Step 3: Record the applied state in COLLISIONS.md**

```bash
node scripts/append-log.mjs collisions "2026-08-16 · claude/new-worktree-setup-35b4ef · MIGRATION 032 IS APPLIED. Four tables live, RLS verified true on all four, four owner policies verified with BOTH using and with check and roles={authenticated} — no public, no anon. Verified by querying pg_tables and pg_policies after apply, not by trusting the command's return."
```

---

### Task 5: The data layer, provably owner-scoped

The auth-boundary test scans routes; **it cannot see authorization**. `rules/app.md`:
proving *who* is calling does not prove they may touch the row. This task builds the module
every later slice reads and writes through, and pins ownership by test.

**Files:**
- Create: `src/lib/agents/db.ts`
- Test: `src/lib/agents/db.test.ts`
- Modify: `src/lib/agents/data.ts` — leave the stub in place, add a header comment pointing at
  `db.ts` and the spec. **Do not gut the stub in this task**: the Agents page still renders
  through it, and a half-migrated page is a broken page on a live product.

**Interfaces:**
- Consumes: `runBudget` from Task 1 (not used here, but the module lives beside it).
- Produces:
  - `type AgentRow = { id, userId, name, context, mission, scopeKind, scopeTargetId, scopeTargetLabel, anthropicAgentId, anthropicMemoryStoreId, anthropicDeploymentId, scheduleCadence, scheduleTimezone, schedulePaused, status, createdAt }`
  - `createAgent(db: AgentsDb, input: NewAgent): Promise<AgentRow>`
  - `listAgents(db: AgentsDb, userId: string): Promise<AgentRow[]>`
  - `getAgent(db: AgentsDb, userId: string, id: string): Promise<AgentRow | null>`
  - `interface AgentsDb` — the injectable Supabase seam, mirroring `ToolDeps` in
    `src/lib/chat2/tools.ts` so tests drive it with no network and no live database.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/agents/db.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createAgent, getAgent, listAgents } from './db'

// A recording fake, not a mock library — we assert on the FILTERS that were
// applied, which is the property under test. rules/app.md M2: state the property
// in the user's terms ("another fund cannot read my agent"), not the code's.
function fakeDb(rows: any[] = []) {
  const calls: { table: string; filters: Record<string, unknown> }[] = []
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {}
    const self: any = {
      select: () => self,
      insert: (v: any) => { calls.push({ table, filters: { insert: v } }); return self },
      eq: (col: string, val: unknown) => { filters[col] = val; return self },
      order: () => self,
      maybeSingle: async () => { calls.push({ table, filters }); return { data: rows[0] ?? null, error: null } },
      single: async () => { calls.push({ table, filters }); return { data: rows[0] ?? null, error: null } },
      then: (res: any) => { calls.push({ table, filters }); return Promise.resolve({ data: rows, error: null }).then(res) },
    }
    return self
  }
  return { client: { from: builder } as any, calls }
}

describe('agents data layer — ownership', () => {
  it('listAgents filters by the caller, never returns everything', async () => {
    const { client, calls } = fakeDb([])
    await listAgents({ client }, 'user-a')
    expect(calls.some((c) => c.table === 'agents' && c.filters.user_id === 'user-a')).toBe(true)
  })

  it('getAgent filters by BOTH the id and the caller', async () => {
    const { client, calls } = fakeDb([])
    await getAgent({ client }, 'user-a', 'agent-1')
    const c = calls.find((x) => x.table === 'agents')!
    expect(c.filters.id).toBe('agent-1')
    // The one that matters: an id alone would let user-b read user-a's agent
    // by guessing a uuid. RLS also stops this — belt and braces, because the
    // run driver cannot carry a user session and uses the service role.
    expect(c.filters.user_id).toBe('user-a')
  })

  it('createAgent stamps the owner from the argument, never from the input payload', async () => {
    const { client, calls } = fakeDb([{ id: 'x', user_id: 'user-a' }])
    await createAgent(
      { client },
      // A hostile payload naming someone else. Identity comes from the caller,
      // never from data — the same law lib/chat2/tools.ts states for tool args.
      { userId: 'user-a', name: 'n', mission: 'm', user_id: 'user-b' } as any,
    )
    const insert = calls.find((c) => c.filters.insert)!.filters.insert as any
    expect(insert.user_id).toBe('user-a')
  })

  it('surfaces a supabase error instead of returning an empty list', async () => {
    // Supabase NEVER THROWS — it returns { data, error }. A destructure that
    // drops `error` turns a database failure into "you have no agents", which
    // is the silent-degradation class rules/app.md forbids.
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }),
      }),
    } as any
    await expect(listAgents({ client }, 'user-a')).rejects.toThrow(/boom/)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/agents/db.test.ts`
Expected: FAIL — `Failed to resolve import "./db"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/agents/db.ts
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE DOOR to the agent tables. Two properties this module exists to hold:
//
// 1. OWNERSHIP IS FILTERED IN APPLICATION CODE, not only by RLS. Migration 032
//    puts an owner policy on every table, which protects anything querying
//    through the USER's client. The run driver (spec §4) cannot carry a user
//    session and uses the service role — and the service role BYPASSES RLS
//    ENTIRELY. On that path this filter is the only guard, so it is not
//    belt-and-braces, it is the belt.
// 2. ERRORS ARE READ. Supabase NEVER THROWS; it returns { data, error }. A
//    destructure that drops `error` turns a database outage into "you have no
//    agents" — the silent-degradation class rules/app.md forbids, and the exact
//    shape supabaseReadDiscipline.test.ts scans for.
//
// snake_case → camelCase happens HERE, once, so nothing downstream knows a
// column name.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

/** The injectable seam — same shape as ToolDeps in lib/chat2/tools.ts, so tests
 *  drive this with no network and no live database. */
export interface AgentsDb {
  client: SupabaseClient
}

export type AgentScopeKind = 'Call' | 'Workspace' | 'Company' | 'Sector' | 'Report'

export type AgentRow = {
  id: string
  userId: string
  name: string
  context: string | null
  mission: string
  scopeKind: AgentScopeKind | null
  scopeTargetId: string | null
  scopeTargetLabel: string | null
  anthropicAgentId: string | null
  anthropicMemoryStoreId: string | null
  anthropicDeploymentId: string | null
  scheduleCadence: string | null
  scheduleTimezone: string
  schedulePaused: boolean
  status: string
  createdAt: string
}

export type NewAgent = {
  userId: string
  name: string
  context?: string | null
  mission: string
  scopeKind?: AgentScopeKind | null
  scopeTargetId?: string | null
  scopeTargetLabel?: string | null
}

const COLUMNS = '*'

function toRow(r: any): AgentRow {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    context: r.context ?? null,
    mission: r.mission,
    scopeKind: r.scope_kind ?? null,
    scopeTargetId: r.scope_target_id ?? null,
    scopeTargetLabel: r.scope_target_label ?? null,
    anthropicAgentId: r.anthropic_agent_id ?? null,
    anthropicMemoryStoreId: r.anthropic_memory_store_id ?? null,
    anthropicDeploymentId: r.anthropic_deployment_id ?? null,
    scheduleCadence: r.schedule_cadence ?? null,
    scheduleTimezone: r.schedule_timezone,
    schedulePaused: r.schedule_paused,
    status: r.status,
    createdAt: r.created_at,
  }
}

export async function listAgents(db: AgentsDb, userId: string): Promise<AgentRow[]> {
  const { data, error } = await db.client
    .from('agents')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listAgents failed: ${error.message}`)
  return (data ?? []).map(toRow)
}

export async function getAgent(
  db: AgentsDb,
  userId: string,
  id: string,
): Promise<AgentRow | null> {
  // BOTH filters. An id alone would let another fund read this agent by guessing
  // a uuid on any path where RLS is not in force.
  const { data, error } = await db.client
    .from('agents')
    .select(COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`getAgent failed: ${error.message}`)
  return data ? toRow(data) : null
}

export async function createAgent(db: AgentsDb, input: NewAgent): Promise<AgentRow> {
  // The owner is taken from `input.userId` and written explicitly. Any `user_id`
  // riding along in the payload is IGNORED by construction — identity comes from
  // the caller, never from data (the same law lib/chat2/tools.ts states for tool
  // arguments). Listing the fields rather than spreading `input` is what makes
  // that true; a spread would let a hostile payload override the owner.
  const { data, error } = await db.client
    .from('agents')
    .insert({
      user_id: input.userId,
      name: input.name,
      context: input.context ?? null,
      mission: input.mission,
      scope_kind: input.scopeKind ?? null,
      scope_target_id: input.scopeTargetId ?? null,
      scope_target_label: input.scopeTargetLabel ?? null,
      status: 'creating',
    })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`createAgent failed: ${error.message}`)
  return toRow(data)
}
```

Note `status: 'creating'` — an agent row exists before its Anthropic objects do, and Plan 2
flips it to `'active'` only once the agent object and memory store both come back. A row stuck
at `'creating'` is a half-made agent the UI must show as such rather than render as ready.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/agents/db.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Full battery, and confirm nothing regressed**

```bash
npx tsc --noEmit
npm test
```

Expected: green, at Task 1 Step 8's count plus 4.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/db.ts src/lib/agents/db.test.ts src/lib/agents/data.ts
git commit -m "feat(agents-1): owner-scoped data layer for the agent tables

Every read and write filters on user_id in application code as well as
relying on RLS, because the run driver uses the service role and the
service role bypasses RLS. createAgent takes the owner as an argument and
ignores any user_id in the payload. Errors are read, never dropped —
supabase does not throw, so a dropped error reads as 'no agents'.

The frontend stub is untouched; the Agents page keeps rendering."
```

---

## Done when

- `@anthropic-ai/sdk` bumped, `budget` expressible (or the founder told it is not), chat v2
  re-verified green on the new version.
- Four claims measured and written to `docs/evidence/agents-v1/mechanism.md`, including that
  **memory outlives its session** — the founder's central decision, tested rather than assumed.
- `ANTHROPIC_ENVIRONMENT_ID` in `.env.local`, and noted as owed on Railway.
- Migration 032 reviewed on file → COLLISIONS appended → founder told → applied → RLS and
  policy shape verified by querying the live catalog.
- `src/lib/agents/db.ts` green, with ownership pinned by test.
- Agents page still renders through the untouched stub. Nothing user-visible changed.

## The remaining four plans

Written after this one lands, because each depends on what the previous one measured.

**Plan 2 — Create flow + "Bring agent to life" (spec §2.1).** `CreateAgent.tsx` wired to real
data; the one Messages call producing the Hebrew intro; confirm creating the row, the Anthropic
agent object and its memory store. Ships: a user creates an agent that exists and introduces
itself. No runs. Acceptance: non-owner 403; the intro renders bidi-clean in both locales;
intro failure creates nothing and says so.

**Plan 3 — The run engine (spec §4).** The session driver, the three custom tools, findings,
file capture into Storage, the outcome function, restart recovery. The big one, and the only
slice that is not a wrapper. Ships: agents actually work.

**Plan 4 — Chat with the agent (spec §1).** A session per conversation with the memory store
attached; the dock's composer un-inerted. Ships: the analyst you can talk to.

**Plan 5 — Scheduling (spec §4.1).** A deployment per scheduled agent, the sweep extended to
attach to Anthropic-started sessions, the panel un-hidden, the safe-hours cadence picker.
Ships: agents that wake up on their own.
