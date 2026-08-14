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
| Chat / Ask Atlas | Works — on the OLD `/api/chat`. The smart-layer backend exists; nothing calls it. |
| Workspace | Works — intake, tables, chat over the document set. |
| Agents | **Stub.** Page + `src/lib/agents/data.ts` exist; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/` — take the lowest
unblocked one, branch per slice, `/ship`.

Phase A done. **B1a (ticket 06) merged 2026-08-14:** `/api/chat/v2` + `src/lib/chat2/`, Sonnet 5
tool loop over NDJSON. `ANTHROPIC_API_KEY` proved by a real call — but the LOCAL one. **Railway's
is a separate secret; a 401 there is the first thing to check on deploy.**

**Next: ticket 07 (B1b, chat surface).** Unblocked and BUILDABLE now, not shippable until both:

1. **The corpus is still filling in** — 846 of 1,297 indexed at 13:04 Israel, ~10 docs/min.
   Unembedded = invisible to search. Repair pass RUNNING, idempotent:
   `node --import tsx scripts/backfill-maya-corpus.ts`. **Re-measure, never restate** (wrong by
   2.5× once): `select index_status, count(*) from company_documents group by 1`. Done = zero
   `failed`.
2. **The retrieval gate has never been re-run at this size** —
   `node --import tsx scripts/retrieval-eval/run.mjs --real`, deferred past A5's merge by founder
   decision. **Not mid-backfill**: a moving corpus measures neither size. Read `REAL_POOL`'s
   header first — every unscoped dense case reports CUT SHORT by construction here.

Ticket 07's own acceptance runs through that corpus, so it cannot be judged until 1 finishes.

Also open (map ticket 13): leftover cleanup, `profiles`/`access_requests` policy narrowing, PUT
admin-gate. 102 of 1,374 filings unstorable under `unique (company_id, quarter, doc_type)` — A5's
`measurements.md` §2, §6. Poller and sweep are UNSCHEDULED (deferred past V1). **Two deferred
calls** (`DECISIONS.md`): meta-laws visible to the promotion ritual, and shrinking `app.md` to
pointers at its tests.
