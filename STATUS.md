# Status

**Rewritten, never appended. Intent and next move only — no history, no war stories.**
If you are tempted to add a dated entry, it belongs in `PROGRESS.md` or `docs/case-history/`.
Anything here that has landed gets removed, not struck through.

_Last rewritten: 2026-08-14_

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

Spec of record: `docs/SMART-LAYER-SPEC.md` — read before any smart-layer work. Build tickets:
`.scratch/smart-layer-build/issues/` (14 slices, `Blocked by:` edges; take the lowest-numbered
unblocked one, branch per slice, `/ship`). Standing gates: `docs/INGESTION-STANDARD.md`, the eval
harness, spec §5 budgets.

**A1–A4 are built**; A4 sits unmerged on `feat/smart-layer-a4-backfill`. The corpus is searchable:
3,181 chunks all embedded, 26/26 documents, migrations 029–030 applied. (`index_status` admin
surface: deferred into A5.)

**BLOCKED ON A FOUNDER DECISION that holds every surface slice.** Dense retrieval reproduces the
eval exactly and בז"א MUST-PASS ranks 1, but Postgres has no IDF, so the lexical channel collapses
and the chosen hybrid lands BELOW dense-only. Three costed options in
`docs/evidence/feat-smart-layer-a4-backfill/gate.md`. **Do not ship B1 on hybrid until he picks.**

Also open (map ticket 13): leftover cleanup, `profiles`/`access_requests` policy narrowing,
PUT admin-gate.

**Two deferred calls (2026-08-12, `DECISIONS.md`), after the product:** meta-laws visible to the
promotion ritual, and shrinking `app.md` to pointers at its tests. The set is AT budget — every
always-on addition evicts its own weight first.
