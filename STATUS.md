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
| Chat / Ask Atlas | Works across every surface — still on the OLD `/api/chat`, not the smart layer. |
| Workspace | Works — intake, tables, chat over the document set. |
| Agents | **Stub.** The page and `src/lib/agents/data.ts` exist; no machinery behind them. |

## What is being worked on right now — BUILDING the smart layer

Spec of record: `docs/SMART-LAYER-SPEC.md`. Build tickets: `.scratch/smart-layer-build/issues/`
(14 slices, `Blocked by:` edges; take the lowest-numbered unblocked one, branch per slice, `/ship`).

**Phase A is done. A5 merged 2026-08-14 — the corpus is real:** 1,296 documents across 233 TASE
issuers, ~84,000 chunks, up from 26 documents. Backfill, a 10-minute poller and a nightly sweep
all go through one door (`syncCompanyFilings`); `index_status` is visible at `/app/admin/corpus`.
Retrieval ships DENSE-ONLY (founder 2026-08-14).

**TWO THINGS A5 OWES, both open, both after the merge — see
`.scratch/smart-layer-build/issues/05-maya-demo-backfill.md`:**

1. **Embedding is still filling in.** The Gemini credits ran out mid-backfill and were topped up;
   a repair pass is running. Until it completes, part of the corpus is ingested but NOT
   searchable — visible as `index_status = 'failed'` and on the admin screen. Finish with
   `node --import tsx scripts/backfill-maya-corpus.ts` (idempotent; costs nothing for what is
   already indexed).
2. **The retrieval gate has NOT been re-run at this corpus size** —
   `node --import tsx scripts/retrieval-eval/run.mjs --real`, compared against
   `docs/evidence/feat-smart-layer-a4-backfill/gate.md`. It was deferred past the merge
   deliberately (founder, 2026-08-14, to unblock B1) and that is a real weakening of A5's own
   acceptance. **It gates B1 shipping, not B1 starting.**

**Next slice: 06 (B1a, unified chat backend).** `ANTHROPIC_API_KEY` is already on Railway.

Also open (map ticket 13): leftover cleanup, `profiles`/`access_requests` policy narrowing,
PUT admin-gate.

**Two deferred calls (2026-08-12, `DECISIONS.md`), after the product:** meta-laws visible to the
promotion ritual, and shrinking `app.md` to pointers at its tests. The set is AT budget — every
always-on addition evicts its own weight first.
