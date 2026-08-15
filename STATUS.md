# Status

**Rewritten, never appended. Intent and next move only.** Dated entries go in `PROGRESS.md`; what
has landed is removed, not struck through.

_Last rewritten: 2026-08-15 (ticket 08c-1)_

## Where the product is

Live on Railway at `www.timlul-ai.com`. A mistake on `main` is no longer local.

| Surface | State |
| --- | --- |
| Live calls | Works. Two engines (Recall/IVRIT) share `:8788`.|
| Companies | Works. MAYA connected; 234/234 have sector. |
| Chat / Ask Atlas | **On `/api/chat/v2`.** Pinpoint, whole-call and project grounding work; market-wide search down. |
| Workspace | Works — intake, tables, chat over the docs. |
| Agents | **Stub.** Page + `lib/agents/data.ts`; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/`. Lowest unblocked
one, branch per slice. **STRICT ORDER: 08 → 09 → 10 → 11 → 12 → 13 → 14** (founder, final).

**Phase A done; 06, 07, 08a, 08b merged; 08c-1 built.** `ChatView` is ENTIRELY on v2 — chat,
`?transcript=`, the company page and project chats — and the `useV2` fork is deleted.

**08c is sliced three ways** (founder — "Project grounding only"): 08c-1 done; **08c-2** live
captions; **08c-3** doc pages + snips, which needs IMAGE content blocks in the loop. **The old
`/api/chat` is still alive for those two and dies at the end of 08c-3, not before.** The "stuffed
FIRST turn" call is CLOSED — §5 reads "any turn", re-injection stays, $0.13 unchanged.

**Two reds, filed with numbers, not re-scored** (M2) — numbers in that branch's `docs/evidence/`:
(1) **market-wide search does not complete** — unscoped scan over 98,042 chunks hits `statement
timeout` (~8.6s), so class-G discovery is RED and its diversification cannot run; scoped search,
which both MUST-PASS cases close through, works. (2) **the $0.06/answer budget did not hold** on
07's three samples, caching measured OFF. Both are eval-gated retrieval parameters; **a DEDICATED
PARALLEL SESSION owns the fix**. Re-measure: `scripts/measure-chat-answer.mjs` (also `--call`).
**Railway's `ANTHROPIC_API_KEY` is unproven** (local is verified) — **a 401 on the first deploy of
`/api/chat/v2` is the first thing to check**; absent returns 503.

**Next: 08c-2, then 08c-3** — finish 08 before 09 starts, so workspace chat is never built on a
route that is about to die. Then 09, smaller than it was: its `shelf` variant is already in the
union and `read_workspace` already reads `workspaceId`.

Also open: **ticket 13** holds the cleanup list; poller/sweep deferred past V1.
