# Agents V1 — Managed Agents mechanism check

**Ran:** 2026-08-16 · **Script:** `scripts/agents-smoke.mjs` · **Branch:** `claude/new-worktree-setup-35b4ef`
**SDK:** `@anthropic-ai/sdk` **0.117.1** (read from the installed
`node_modules/@anthropic-ai/sdk/package.json`, not restated from the plan)
**Model on the smoke agent:** `claude-sonnet-5` · **Cost:** a few cents · **Runs:** 1 (no re-runs)

This file records what one real run against Anthropic's cloud measured. It exists because no unit
test in this repo can reach these facts, and because spec §1's founder decision of 2026-08-16 —
that an agent's memory lives at Anthropic rather than in Supabase — is only buildable if claim 4
holds. Every number and string below is copied from the run's stdout (`rules/app.md` M1: a figure
hand-carried from another document has been wrong every time here).

## The four claims — PASS/FAIL exactly as printed

| # | Claim | Result |
| --- | --- | --- |
| 1 | environment + agent object + memory store all create | **PASS** (implicit) |
| 2 | a session answers a CUSTOM TOOL round-trip from our side (spec §4) | `claim 2 — custom tool round-trip: PASS` |
| 3 | the agent writes to its memory store | `claim 3 — agent wrote to memory: PASS` |
| 4 | a SECOND session, after the first is deleted, reads that back (spec §1) | `claim 4 — memory survived the session: PASS` |

**Claim 1 prints no PASS line** — the script asserts it by creating the three objects and printing
their ids; a failure would have thrown. Recorded as implicit rather than quoted, because quoting a
line that was never printed is exactly the M1 failure this file guards against.

**Why claim 4 cannot be a lucky generation.** The value written and read back is
`atlas-smoke-<pid>-<ppid>`, generated at run time from this process's ids. The model is never told
it in session 2 and could not generate it; the only path from session 1 to session 2 is the memory
store. Session 1 was **deleted** (`sessions.delete`) before session 2 was created, so no
conversation history survives — only the store.

## Verbatim run output

```
environment: env_01Ryu53wpYhzBHhAKPiAV9M7   <-- put this in .env.local as ANTHROPIC_ENVIRONMENT_ID
memory store: memstore_01PSsZpiosijzyftdDdWdFh1
agent: agent_01KZbSpdqs88zzqCBA5zjXUb v1
session 1: sesn_01Hfw5mcpHsbxA2YomuQpv4Z
trace: https://platform.claude.com/workspaces/default/sessions/sesn_01Hfw5mcpHsbxA2YomuQpv4Z
  custom tool called; answering from OUR side
claim 2 — custom tool round-trip: PASS
claim 3 — agent wrote to memory: PASS
session 2: sesn_017XrrmC8j2QLvkgZFj7DqqV
claim 4 — memory survived the session: PASS

session.status_idle stop reasons observed:
  session 1: requires_action
  session 1: end_turn
  session 2: end_turn

KEEP:   environment env_01Ryu53wpYhzBHhAKPiAV9M7
DELETE: memory store memstore_01PSsZpiosijzyftdDdWdFh1 and agent agent_01KZbSpdqs88zzqCBA5zjXUb — smoke scratch, not app data
NOTE:   archive is PERMANENT on all of these and there is no unarchive (spec §9.5).
```

No `session.error` line was printed on either session.

## `session.status_idle` stop reasons observed

Exactly three, in this order:

1. session 1 — `requires_action` (the agent had called `atlas_ping` and was blocked on our result)
2. session 1 — `end_turn`
3. session 2 — `end_turn`

**This is the fact the loop condition depends on.** Idle is not the end: the first idle was the
session waiting on *us*. A loop that breaks on bare `session.status_idle` would have declared the
run finished before the custom tool was ever answered, and claim 2 would have read FAIL for a
reason that has nothing to do with the mechanism. The gate is
`stop_reason?.type !== 'requires_action'`. `budget_reached` and `retries_exhausted` were not
observed on this run.

## OWED — `ANTHROPIC_ENVIRONMENT_ID` is not yet persisted anywhere

```
ANTHROPIC_ENVIRONMENT_ID=env_01Ryu53wpYhzBHhAKPiAV9M7
```

**This value is NOT a secret — it is an id** — but it is required, and nothing has stored it. It
must be added in **two** places before any agent runs:

1. **The primary checkout's `.env.local`** (`C:\Users\Sagi\Desktop\Atlas\.env.local`) — git-ignored.
   This worktree has no `.env.local` of its own; the script walks up and reads the primary
   checkout's.
2. **Railway's environment variables**, before any agent runs in production.

No agent could do this: `.claude/settings.json` denies `Read`/`Edit` on `./.env*`, and
`.claude/hooks/pre-bash-gate.mjs` blocks any shell command whose text mentions it. The append is a
founder action.

One environment is reused by every agent forever — it is a template, not per-agent. **Do not
archive it.**

## Cleanup performed

Per spec §9.5, archive at Anthropic is **permanent, cascading, and has no unarchive**. Cleanup was
therefore made conditional on all four claims passing, and this file was written first.

- Archived: memory store `memstore_01PSsZpiosijzyftdDdWdFh1`
  (`archived_at: 2026-08-16T11:31:40.969642Z`) and agent `agent_01KZbSpdqs88zzqCBA5zjXUb`
  (`archived_at: 2026-08-16T11:31:41.462742Z`) — smoke scratch, not app data.
- **Not** archived: environment `env_01Ryu53wpYhzBHhAKPiAV9M7` — the whole point of the run is that
  we depend on it.
- Sessions `sesn_01Hfw5mcpHsbxA2YomuQpv4Z` and `sesn_017XrrmC8j2QLvkgZFj7DqqV` were deleted by the
  script itself, as spec §4 step 4 says a finished run does.

## Where the installed SDK differs from the brief's script

The brief's script was written from the Managed Agents documentation, not against 0.117.1. Every
API surface it uses was checked against the installed `.d.ts` files before the run. Findings:

**Confirmed correct, unchanged** — accessors `client.beta.environments`, `client.beta.memoryStores`,
`client.beta.agents`, `client.beta.sessions`, `client.beta.sessions.events.{stream,send}`,
`client.beta.memoryStores.memories.list`; event types `agent.custom_tool_use` (with `.name`, `.id`),
`user.custom_tool_result` (with `custom_tool_use_id`), `session.status_idle` (with
`stop_reason.type`, where `requires_action` is a real variant), `session.status_terminated`,
`agent.message` (`.content[].type === 'text'`); param shapes for environment/agent/memory-store/
session create, the `agent_toolset_20260401` toolset, the `custom` tool, the `memory_store` session
resource, and `budget: {type:'limit', max_list_cost:{amount, currency}}`.

**Changed, and why:**

1. **Env loader walks up the directory tree.** The brief read `./.env.local`. This worktree has no
   such file — only the primary checkout does — so as written the script would have found no key
   and failed with a 401. It now walks up from `process.cwd()` and loads the first `.env.local` it
   finds, still without overriding anything already in `process.env`. `git worktree` is a normal
   part of this repo's workflow (`CONTEXT.md`), so this is a general fix, not a one-off.
2. **`session.status_idle` stop reasons are collected and printed at the end.** The brief required
   this file to record them but the script never printed any. Added as a separate `if` that records
   before the break checks — the break conditions themselves are untouched.
3. **One `session.error` log line per stream.** Triage aid only; it does not affect the loop or any
   claim. Neither stream emitted one on this run.
4. **Claim 3 reads `stored.data` explicitly.** `memories.list` returns a `PagePromise`; awaiting it
   yields a `PageCursor` whose `.data` is the item array. The brief's `stored.data ?? stored`
   fallback is kept and is harmless.

**Two things worth knowing that needed no change:**

- **Beta headers are set by the SDK, not by us.** `client.beta.{agents,environments,sessions}.*`
  send `managed-agents-2026-04-01` automatically. `client.beta.memoryStores.*` send a *different*
  one — **`agent-memory-2026-07-22`** — also automatically. No `betas: [...]` option was passed
  anywhere, and session create with a `memory_store` resource works under
  `managed-agents-2026-04-01` alone.
- The budget literal in the script is byte-identical to what `src/lib/agents/budget.ts`'s
  `runBudget()` produces (`RUN_BUDGET_CENTS = 100` → `amount: '100'`). Kept literal on purpose so
  the script stays runnable while app code is mid-refactor.

## What this does and does not settle

Settled: the mechanism spec §4 and spec §1 rest on works, on this SDK, against the real API, with
this org's key **locally**.

Not settled, and out of this task's scope: **Railway's `ANTHROPIC_API_KEY` remains unproven**
(`STATUS.md`) — this run used the local key. On any agent failure in production, check for a 401
first.
