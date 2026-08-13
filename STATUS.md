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
**Next up: slice A4 — backfill + harness re-run** (ticket 04 — the gate for every surface slice).

Also open (map ticket 13): leftover cleanup, `profiles`/`access_requests` policy narrowing,
PUT admin-gate.

**Two deferred calls (2026-08-12, `DECISIONS.md`), self-improving-layer, after the product:**
meta-laws visible to the promotion ritual, and shrinking `app.md`'s mechanism-backed laws to
pointers at their tests — the set sits at its 9,000-token budget edge, so the next always-on
addition pays for itself by that shrink first.
