# Agents V1 — what Plan 1 measured, and what Plans 2–5 must know

Status: handoff. **Not a plan.** Written at the end of Plan 1 so the next session starts from
measurement instead of from this conversation.

Read with `.scratch/agents-v1/spec.md`. Everything here is either *measured* (a number or a string
copied from a run) or *ruled* (a decision someone made, with its cost). Nothing here is a
recollection — where a fact lives in a durable file, that file is named and wins over this one.

---

## 1 · What Plan 1 shipped, and what it did not

**Shipped:** certainty, and nothing user-visible.

- `@anthropic-ai/sdk` **0.117.1** (was 0.102.0). The native per-run spend cap IS expressible.
- The Managed Agents mechanism is proven end to end (§2 below).
- Four tables live on production, owner-scoped and verified (§3).
- `src/lib/agents/db.ts` — the one door to those tables.

**Not shipped, and this is the whole feature:** no agent can be created, no agent runs, no agent
can be talked to, nothing is scheduled. The Agents page still renders the `data.ts` stub it
rendered before. Plans 2–5 are the product; Plan 1 is the ground.

---

## 2 · The mechanism, measured

Full record: `docs/evidence/agents-v1/mechanism.md`. Re-runnable with `node scripts/agents-smoke.mjs`
(costs a few cents and creates a NEW environment each run).

All four claims PASS, one run, no retries:

1. an environment, an agent object and a memory store create;
2. **a session answers a CUSTOM TOOL round-trip** — the agent stops, waits for our server, and
   accepts our result. This is the load-bearing mechanism of spec §4;
3. the agent writes to its memory store;
4. **a SECOND session, created after the first was deleted, reads that back.**

Claim 4 is the founder's 2026-08-16 decision — agent memory lives at Anthropic, not in our
database — and it is now measured rather than assumed. **Spec §1 stands.**

The check cannot produce a false pass on claim 4: the planted secret is PID-derived, session 1 is
deleted before session 2 exists, and the secret reaches the system ONLY through our own
`user.custom_tool_result` send, never through prompt text — so claim 3's host-side `memories.list`
hit is independent corroboration rather than the model's self-report.

**`ANTHROPIC_ENVIRONMENT_ID=env_01Ryu53wpYhzBHhAKPiAV9M7`** — an id, not a secret. **OWED in two
places** and nothing in Plan 1 consumes it, so nothing has failed yet: the primary checkout's
`.env.local`, and Railway's variables. **Plan 2 is the first slice that breaks without it.**

### Facts that correct the spec

- **The memory-store API sends beta header `agent-memory-2026-07-22`, NOT
  `managed-agents-2026-04-01`.** Two different betas. The spec's Tech Stack line names only one.
- `SessionCreateParams.initial_events` exists and would send the kickoff message atomically at
  session creation — **using it silently defeats the stream-before-send requirement** in spec §4
  step 2. Open the stream, then `events.send`. The smoke script does it the correct way; copy that.
- Idle is not the end. Only a `session.status_idle` whose `stop_reason` is **not**
  `requires_action`, or `session.status_terminated`, ends a run.

---

## 3 · The schema, live and verified

`supabase/migrations/20260816_032_agents.sql` — **applied to production 2026-08-16** after three
cold-review rounds, and verified against the live catalog rather than against the command's return.

Four tables: `agents`, `agent_runs`, `agent_findings`, `agent_run_files`.

Verified live: RLS `true` on all four · four owner policies, each `cmd=ALL`,
`roles={authenticated}`, both `USING` and `WITH CHECK`, **no `public`, no `anon`** · the composite
child FKs are genuinely multi-column — `agent_findings → agent_runs` **3 columns**,
`agent_run_files → agent_runs` **2**, `agent_runs → agents` **2**, plus four single-column
`user_id → auth.users` FKs which are cross-schema and correct as-is.

### Read this before writing any insert

**Child FKs are composite THROUGH `user_id`.** PostgreSQL's referential-integrity checks bypass
RLS, so a single-column child key would validate a row owned by you but attached to a stranger's
agent. An insert must carry a consistent `(parent_id, user_id)` pair or the database refuses it.

`agent_runs` deliberately carries **two** composite unique keys — `(id, user_id)` and
`(id, agent_id, user_id)` — because Postgres matches an FK against a unique's **exact column set**
and the two children reference different sets. Do not "simplify" one away.

The law and its mechanism: `.claude/rules/db.md` + `src/lib/db/compositeChildFk.test.ts`.
The story: `docs/case-history/db.md#composite-child-fk`.

### Column facts that will bite

- **`agents.status` defaults to `'creating'`, not `'active'`.** Spec §2.1 writes the row before the
  Anthropic objects exist, so `'active'` would be a row that reads ready when it is not. Plan 2
  flips it to `'active'` only once the agent object AND memory store both come back. A row stuck at
  `'creating'` is a half-made agent and the UI must say so (`rules/app.md`: degradation is VISIBLE).
- **`agent_findings.source` is NOT NULL plus a non-blank CHECK** (`length(btrim(source)) > 0`).
  Spec §0a's anti-fabrication mechanism, not a formality — `''` is not null, and an empty source is
  exactly the shape a lazy caller produces.
- **`agent_runs.outcome`** allows exactly the six from spec §5, and two CHECKs together make
  "outcome is set" mean EXACTLY "status = 'finished'".
- **`next_run_at` exists on the table but `AgentRow` does not map it.** Deliberate — Plan 5 owns
  the schedule panel. It is also APPROXIMATE by construction (Anthropic jitters firing up to 15%
  of the interval, capped at 9 min) and can go STALE after an auto-pause, so the panel must read it
  alongside `schedule_paused` and never promise a to-the-minute time.

---

## 4 · Owed to Plans 2–5 — carry these, they are requirements

1. **`runBudget()` must reach `sessions.create()` UNCAST.** `src/lib/agents/budget.ts` is not tied
   to the SDK's `BetaManagedAgentsBudgetLimit` by any test, so the $1.00 cap currently rests on one
   grep and one manual run. Passing it to `sessions.create()` without a cast makes `tsc` check it
   for real and closes this for free — **a cast there re-opens it silently, and a silently-dropped
   budget is an uncapped run.** Filed by the final review; Plan 2 is where it closes.
2. **Deleting an agent is a REAL cascading delete** — founder ruling 2026-08-16, taken at the
   migration's gate among three named options, recorded in `DECISIONS.md` and in the migration
   header. The cascade removes every run, finding and file-index row. It does **not** reach:
   - the **file bytes in Supabase Storage** — Plan 3 captures files there and owes their deletion;
   - the **Anthropic-side agent and memory store**, which persist and **keep costing money** until
     something archives them. Spec §9.5: that archive is terminal, no unarchive anywhere. Plan 2's
     delete path owes this, deliberately, not reflexively.
   - The owner policy makes DELETE reachable through PostgREST before any UI exists.
3. **No `(scope_kind, scope_target_id)` pairing CHECK — deferred to Plan 2 on purpose.** Adding a
   CHECK later is additive and allowed; removing one needs `DROP CONSTRAINT`, which is hook-blocked
   and costs a founder round-trip. `NewAgent`/`createAgent` make the two independently optional
   today, and spec §2.2 says a Sector seeds a *list* of companies. **Land it once the create form's
   real shape is fixed.**
4. **`AgentScopeKind` is hand-written in THREE places with no mechanical tie** — `db.ts`,
   `data.ts:22-23`, and the migration's `agents_scope_kind_known` CHECK. A sixth scope kind added
   to one is not caught in the other two. One import closes the TypeScript half; the SQL half needs
   a test.
5. **`src/lib/agents/data.ts` is still the stub the Agents page renders through.** Plan 2 replaces
   it as it wires the real feed. Do not gut it before the page reads from `db.ts`.
6. **Workspace and Report assignments are an ACCESS BOUNDARY, not context** (spec §2.2). Their id
   comes from the agent row through the handler closure, never from the model, and `read_workspace`
   goes through the owner's RLS-bearing client, never `supabaseAdmin`. Company and Sector are
   context plus a soft default scope, and are safe to let the model re-choose because they name the
   shared corpus.
7. **The transcript tool's schema must REQUIRE a company or list of companies** (spec §2). Unscoped
   market-wide search does not complete — it hits a statement timeout — so an unscoped query must
   be *unrepresentable at the tool*, not merely discouraged.

## 5 · Environment and tooling facts

- **A worktree has no `.env.local`; only the primary checkout does.** So `npm run build` cannot
  complete in a worktree (page-data collection fails on `supabaseUrl is required`) — that is a
  worktree condition, not a regression. `scripts/agents-smoke.mjs` walks up to find one.
- **No agent can read or write `.env*`** — `.claude/settings.json` denies Read/Edit and
  `pre-bash-gate.mjs` blocks any Bash command mentioning it. Env values are a founder action.
- **The test runner is `node --import tsx --test`** (`node:test` + `node:assert/strict`).
  **`vitest` is NOT a dependency.** `npx vitest run <file>` against a `node:test` file prints
  "No test suite found" and exits **without failing** — a false green. Never use it.
- Every new test file is registered in `package.json`'s explicit list; `testRegistry.test.ts`
  enforces both directions, and `ARCHITECTURE.md`'s count header is re-measured by the ship gate.
- The always-on budget is tight and was raised twice during Plan 1. Check `npm run env:health`
  before adding to `.claude/rules/*`, `CLAUDE.md`, `CONTEXT.md` or `STATUS.md`.

## 6 · A method that earned its place

**FIVE times in Plan 1 a guard's declared reach exceeded its measured reach** — a regex that missed
the most idiomatic form of the bug; a comment-stripper that was a no-op on CRLF files; a
composite-FK check that counted columns instead of looking for `user_id`; a STATED LIMITS paragraph
claiming both FK forms were handled while the table-level branch still required `public.`, false for
two rounds; and a STATED LIMITS bullet claiming a quoted `"USER_ID"` was not recognised when it
passes. Each was found by someone **running the guard against variants**, never by reading it.

**Three consecutive commits each shipped the next round's declaration defect** — `99d633c` (the
guard, born with the CRLF no-op) → `616195d` (CRLF fixed, canary added, still counting columns) →
`8728e7a` (arity fixed, and it introduced the false `"USER_ID"` limit **in the very commit that
fixed a false limits paragraph one bullet above it**) → `035b572`. That streak is the point of this
section, and it is why the count matters: the first version of this passage said "three", which
quietly omitted both defects in the DECLARATIONS rather than in the code — an understated count in a
passage whose lesson is "state its limits truthfully" costs the lesson its force.

When this feature adds a mechanism, probe it with the defect it was bought for and with its nearest
neighbours, then state its limits truthfully. `rules/app.md`: claim the call sites, never the corpus.
