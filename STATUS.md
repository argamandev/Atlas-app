# Status

**Rewritten, never appended. Intent and next move only — no history, no war stories.**
If you are tempted to add a dated entry, it belongs in `PROGRESS.md` or `docs/case-history/`.
Anything here that has landed gets removed, not struck through.

_Last rewritten: 2026-08-13_

## Where the product is

Live on Railway at `www.timlul-ai.com` since 2026-08-08. A mistake on `main` is no longer local.

| Surface | State |
| --- | --- |
| Live calls | Works, presents well. Two engines (Recall / IVRIT) share `:8788`. |
| Companies | Works. MAYA connected; sector + description populated for 234/234 companies. |
| Chat / Ask Atlas | Works across every surface. |
| Workspace | Works — intake, tables, chat over the document set. |
| Agents | **Stub.** The page and `src/lib/agents/data.ts` exist; no machinery behind them. |

## What is being worked on right now — BUILDING the smart layer

The spec of record is `docs/SMART-LAYER-SPEC.md` — read it before any smart-layer work. Build
tickets: `.scratch/smart-layer-build/issues/` (14 slices, `Blocked by:` edges; take the
lowest-numbered unblocked ticket, one per session, branch per slice, `/ship`). Standing gates:
`docs/INGESTION-STANDARD.md`, the eval harness, approved cost budgets (spec §5).

**Slices A1–A3 are LIVE** — schema, resolver (בז"א MUST-PASS green), and the birth sequence:
one battery-guarded transcript door (attributed, keyed, aligned, atomically re-chunked), XBRL
facts + `publication_date` with visible statuses, the global MAYA limiter, the harness importing
the production chunker; the `index_status` admin surface is deferred into A5.

**Slice A4 — the corpus is SEARCHABLE, and the gate found something.** On
`feat/smart-layer-a4-backfill`, not yet merged. The backfill ran clean: **3,181 chunks, all
embedded**, 26/26 documents indexed with real publication dates, 1,398 XBRL facts, the duplicate
and demo transcripts visibly `excluded`. Migrations 029 (`atlas_search_chunks` — the one retrieval
door) and 030 (VALIDATE the company CHECK) are applied.

**The gate's verdict blocks B1 on a founder decision.** Dense retrieval reproduces the measured
eval EXACTLY (MRR 0.268 scoped) and the בז"א MUST-PASS ranks 1 — but Postgres's `ts_rank_cd` has
no IDF (`שנת` is in 96% of chunks and scores like `ההכנסות`, in 5%), so the lexical channel
collapses 0.207 → 0.075 and drags the chosen hybrid design to 0.141, BELOW dense-only. Real BM25
in SQL reproduces exactly, but needs a precomputed inverted index to be fast (31s without one).
Three options, costed, in `docs/evidence/feat-smart-layer-a4-backfill/gate.md` and ticket 04.
**Do not ship a surface slice on the hybrid channel until he chooses.**

Also open (map ticket 13): leftover cleanup, `profiles`/`access_requests` policy narrowing,
PUT admin-gate.

**Two deferred calls (2026-08-12, `DECISIONS.md`), self-improving-layer, after the product:**
meta-laws visible to the promotion ritual, and shrinking `app.md`'s mechanism-backed laws to
pointers at their tests — the set sits at its 9,000-token budget edge, so the next always-on
addition pays for itself by that shrink first.
