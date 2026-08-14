# C1 · Agent tables + create flow

Status: **ACTIVE — this is the next mission** (founder call 2026-08-14, its own dedicated session).
Blocked by: 04 (landed)

**Why this and not ticket 07.** Spec §6 puts Phase C in parallel with Phase B from A4 onward, so
nothing here ever waited on chat. Agents is the longest remaining chain (10 → 11 → 12 → 13) and the
only surface still a stub, and the founder's goal is the fastest route to a complete V1.

**Two facts you inherit, neither of them a blocker here.** (1) Dense retrieval regressed at the real
corpus size — `docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`. C1 does not touch retrieval
at all, but C2 will: agent missions carry a scope picker, which puts them on the *scoped* channel,
the healthier of the two (MRR 0.195 vs 0.131 unscoped). Do not design a mission around open
market-wide sweep quality without re-reading that gate. (2) Ticket 06's chat backend is built and
unwired; the model-call shape for the "bring to life" intro is the one already proven in
`src/lib/chat2/`, so copy it rather than inventing a second Messages client.

**Before the migrations:** `rules/db.md` DDL gate — write the migration files, push the branch, run
`atlas-reviewer` **on the files**, append to `COLLISIONS.md`, tell the founder, *then* apply. Applying
first is the one thing this database cannot take back.

Spec §2.6 (personal layer) + §2.8. Migrations on the 015/016 template (`agents`,
`agent_runs`, `agent_run_events`, `agent_findings`, `agent_memory`, append-only chat
turns) — DDL gate, founder told before apply; create UI on the existing frontend
contract (name + free-text mission + sector/company/both picker); "Bring agent to life"
intro (one Messages call, Hebrew, human vibes) + confirm → armed. Acceptance: non-owner
403 tests; intro renders bidi-clean; no run machinery yet. Cost: ~$0.01/intro.
