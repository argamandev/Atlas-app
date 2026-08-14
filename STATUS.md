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
| Chat / Ask Atlas | Works — still on the OLD `/api/chat`. The smart-layer backend now exists but **nothing calls it yet**. |
| Workspace | Works — intake, tables, chat over the document set. |
| Agents | **Stub.** Page + `src/lib/agents/data.ts` exist; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/` — take the lowest
unblocked one, branch per slice, `/ship`.

Phase A done. **B1a (ticket 06) merged 2026-08-14:** `/api/chat/v2` + `src/lib/chat2/` — Sonnet 5
tool loop, typed events so an error has no path into the answer text, quotes verified at write
against what the tools actually returned. `ANTHROPIC_API_KEY` verified by a real call, not taken on
trust: HTTP 200 from `claude-sonnet-5`. That was checked against the LOCAL `.env.local`; the Railway
value is a separate secret and is still unverified — check it on the first deploy.

**Next: ticket 07 (B1b, chat surface).** `ChatView` onto the new backend, `@company` autocomplete,
visible search mode. It is unblocked and can be BUILT now.

## What blocks B1 from SHIPPING — both inherited from A5, both still open

1. **The corpus is half-embedded.** Measured 2026-08-14 ~12:50: **618 of 1,296 documents indexed,
   678 still `failed`.** Unembedded documents are INVISIBLE to search (dense retrieval filters on
   `embedding is not null`) — honest, but far thinner than the document count suggests. The repair
   pass is RUNNING and idempotent (`node --import tsx scripts/backfill-maya-corpus.ts`), moving at
   ~3 docs/min, so roughly 3–4 hours from that measurement. Re-measure, never restate:
   `select index_status, count(*) from company_documents group by 1`. Done = zero rows `failed`.
2. **The retrieval gate has never been re-run at this corpus size** —
   `node --import tsx scripts/retrieval-eval/run.mjs --real`, filed to
   `docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`. Deferred past A5's merge by founder
   decision. **Do not run it while the backfill is mid-flight** — the corpus is moving, so the
   result would measure neither the old size nor the new one. Read `REAL_POOL`'s header in
   `run.mjs` first: every unscoped dense case reports CUT SHORT by construction at this size.

Ticket 07's own acceptance (both MUST-PASS eval cases, class-G discovery) runs through that same
corpus, so it cannot be honestly judged until item 1 finishes.

Also open (map ticket 13): leftover cleanup, `profiles`/`access_requests` policy narrowing,
PUT admin-gate. 102 of 1,374 selected filings still cannot be stored under
`unique (company_id, quarter, doc_type)` — three ways out in A5's `measurements.md` §2 and §6.
Neither poller nor sweep is SCHEDULED (founder deferred until after V1).
**Two deferred calls** (2026-08-12, `DECISIONS.md`): meta-laws visible to the promotion ritual, and
shrinking `app.md` to pointers at its tests.
