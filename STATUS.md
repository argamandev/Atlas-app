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
| Chat / Ask Atlas | Works — still on the OLD `/api/chat`, not the smart layer. |
| Workspace | Works — intake, tables, chat over the document set. |
| Agents | **Stub.** Page + `src/lib/agents/data.ts` exist; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/` — take the lowest
unblocked one, branch per slice, `/ship`.

**Phase A done. A5 merged 2026-08-14:** 1,296 documents / ~84K chunks across 233 issuers, up
from 26. Backfill, poller and nightly sweep share one door (`syncCompanyFilings`);
`index_status` is visible at `/app/admin/corpus`. Retrieval is DENSE-ONLY (founder 2026-08-14).

**A5 owes two things, both open — details at the top of its ticket:**

1. **Embedding is still filling in.** Credits ran out mid-backfill and were topped up; finish
   with `node --import tsx scripts/backfill-maya-corpus.ts` (idempotent). Until then part of the
   corpus is ingested but NOT searchable — `index_status = 'failed'`, visible on the admin screen.
2. **The retrieval gate has NOT been re-run at this size** (`run.mjs --real`). Deferred past the
   merge by founder decision to unblock B1 — a real weakening of A5's acceptance. It gates B1
   SHIPPING, not B1 starting.

**Next: ticket 06 (B1a, unified chat backend).** `ANTHROPIC_API_KEY` is already on Railway.

Also open (map ticket 13): leftover cleanup, `profiles`/`access_requests` policy narrowing,
PUT admin-gate. **Two deferred calls** (2026-08-12, `DECISIONS.md`): meta-laws visible to the
promotion ritual, and shrinking `app.md` to pointers at its tests.
