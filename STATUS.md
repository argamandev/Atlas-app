# Status

**Rewritten, never appended. Intent and next move only.** Dated entries go in `PROGRESS.md`; what
has landed is removed, not struck through.

_Last rewritten: 2026-08-15 (ticket 08b)_

## Where the product is

Live on Railway at `www.timlul-ai.com`. A mistake on `main` is no longer local.

| Surface | State |
| --- | --- |
| Live calls | Works. Two engines (Recall/IVRIT) share `:8788`.|
| Companies | Works. MAYA connected; 234/234 have sector. |
| Chat / Ask Atlas | **On `/api/chat/v2`** (07, 08b). Pinpoint + whole-call grounding work; market-wide search down. |
| Workspace | Works — intake, tables, chat over the docs. |
| Agents | **Stub.** Page + `lib/agents/data.ts`; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/`. Lowest unblocked
one, branch per slice. **STRICT ORDER: 08 → 09 → 10 → 11 → 12 → 13 → 14** (founder, final).

**Phase A done; 06, 07, 08a, 08b merged.** Chat's UI, `/app/chat?transcript=` and the company
page's Ask Atlas are on the unified backend — spec §2.3's four recipes as one `Grounding` union,
whole-call injection behind the `call` variant.

**Ticket 08 SPLIT AGAIN — 08b landed, 08c open.** Re-scoped by the founder 2026-08-15: the old
route carries SIX groundings, not two. **Project chats, live captions and multiview PDF/snips stay
on OLD `/api/chat`** — that is all 08c owes, and `useV2` is down to `!projectId`. Detail, plus a
founder call waiting on the "stuffed FIRST turn" wording, in that ticket file.

**Two reds, filed with numbers, not re-scored** (M2) — numbers in that branch's `docs/evidence/`:
(1) **market-wide search does not complete** — unscoped scan over 98,042 chunks hits
`statement timeout` (~8.6s), so class-G discovery is RED and the diversification built for it
cannot run; scoped search, which both MUST-PASS cases close through, works. (2) **the $0.06/answer
budget did not hold** on 07's three samples, with caching measured OFF. Both are eval-gated
retrieval parameters; **a DEDICATED PARALLEL SESSION owns the fix**. Re-measure:
`scripts/measure-chat-answer.mjs` (now also `--call`). **Railway's `ANTHROPIC_API_KEY` is
unproven** (local is verified) — **a 401 on the first deploy of `/api/chat/v2` is the first thing
to check**; absent returns 503.

**Next: ticket 09 (workspace chat) — or 08c, founder's call.** Strict order says 09, and 08c is
cleanup of a route that still works. 09 is smaller than it was: its `shelf` grounding variant is
already in the union and `read_workspace` already reads `workspaceId`.

Also open: **ticket 13** holds the cleanup list; poller/sweep deferred past V1.
