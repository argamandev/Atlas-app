# Status

**Rewritten, never appended. Intent and next move only.** Dated entries go in `PROGRESS.md`; what
has landed is removed, not struck through.

_Last rewritten: 2026-08-16 (Agents V1 Plan 1 — foundations)_

## Where the product is

| Surface | State |
| --- | --- |
| Live calls | Works. Two engines (Recall/IVRIT) share `:8788`.|
| Companies | Works. MAYA connected; 234/234 have sector. |
| Chat / Ask Atlas | **`/api/chat/v2` only.** Groundings work; market-wide search down. |
| Workspace | Intake, tables, chat over docs. |
| Agents | **Schema live, no machinery.** Tables in production; nothing can be created or run. |

## Finishing V1 — Agents

**Tickets 10–14 are SUPERSEDED** (founder, 2026-08-16, `DECISIONS.md`): one thin Managed Agents
wrapper finishes V1. Spec and plans in `.scratch/agents-v1/`; the old smart-layer order stops at 09.

**Plan 1 (foundations) SHIPPED; nothing user-visible came with it.** SDK 0.117.1 + a run-budget
module, a smoke script proving the design's four load-bearing claims against real Managed Agents,
migration `20260816_032_agents.sql` applied to production and verified, and an owner-scoped data
layer over its four tables. **No agent can be created or run — that is Plans 2 and 3.**
**Next: Plan 2** — create flow and run engine, after the environment id below lands.

**OWED BEFORE PLAN 2, in TWO places — the primary checkout's `.env.local` AND Railway:**
`ANTHROPIC_ENVIRONMENT_ID=env_01Ryu53wpYhzBHhAKPiAV9M7`. An id, not a secret; Plan 2's first API
call fails without it.

**Market-wide search (RED) and the $0.06/answer miss sit with a PARALLEL SESSION** — numbers in
08c's evidence; agents ride the scoped channel. **Railway's `ANTHROPIC_API_KEY` is unproven:
suspect a 401** on a v2 chat failing in production.

**09b's override does NOT carry forward** — measured, after this file said otherwise: the gate reads
only the CURRENT branch's `docs/evidence/<branch>/review.md`, so no later merge inherits it. Its
residue is in `docs/open-findings.md`, the 81 displaced decks the most visible.
