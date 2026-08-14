# Status

**Rewritten, never appended. Intent and next move only.** A dated entry belongs in `PROGRESS.md`.
What has landed gets removed, not struck through.

_Last rewritten: 2026-08-14_

## Where the product is

Live on Railway at `www.timlul-ai.com` since 2026-08-08. A mistake on `main` is no longer local.

| Surface | State |
| --- | --- |
| Live calls | Works. Two engines (Recall / IVRIT) share `:8788`. |
| Companies | Works. MAYA connected; 234/234 have sector + description. |
| Chat / Ask Atlas | Works — on the OLD `/api/chat`. `/api/chat/v2` (ticket 06) exists behind it, unwired. |
| Workspace | Works — intake, tables, chat over the document set. |
| Agents | **Stub.** Page + `src/lib/agents/data.ts` exist; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/` — take the lowest
unblocked one, branch per slice, `/ship`.

**Phase A done, A5 closed 2026-08-14** — corpus real: 1,298/1,300 `company_documents` indexed (2
large reports fail on a bulk-insert timeout, small and named, not blocking). **B1a (ticket 06)
merged 2026-08-14:** `/api/chat/v2` + `src/lib/chat2/`. `ANTHROPIC_API_KEY` proved by a real call —
the LOCAL one; Railway's is a separate secret, a 401 there is the first thing to check on deploy.

**Retrieval quality regressed at this corpus size — measured, not fixed.** Gate re-run
(`docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`): dense MRR roughly halved unscoped,
down ~27% scoped vs A4 (A4 never actually exercised the HNSW index; A5 is the first real ANN
measurement). MUST-PASS alias case now fails unscoped, holds scoped. Every corpus-grounded surface
shares this retrieval door. **Founder call:** an index-tuning attempt didn't land cleanly; move on,
a DEDICATED PARALLEL SESSION owns the real fix (grill + PRD) — pick it up if that's you, otherwise
treat retrieval as "works, imperfectly."

**Next: ticket 07 (B1b, chat surface).** Unblocked, corpus is no longer the blocker.

Also open (map ticket 13): leftover cleanup, `profiles`/`access_requests` policy narrowing, PUT
admin-gate. 102 of 1,374 filings unstorable under `unique (company_id, quarter, doc_type)` — A5's
`measurements.md` §2, §6. Poller and sweep are UNSCHEDULED (deferred past V1). **Two deferred
calls** (`DECISIONS.md`): meta-laws visible to the promotion ritual, and shrinking `app.md` to
pointers at its tests.
