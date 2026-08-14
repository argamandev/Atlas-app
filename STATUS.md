# Status

**Rewritten, never appended. Intent and next move only.** Dated entries go in `PROGRESS.md`; what
has landed is removed, not struck through.

_Last rewritten: 2026-08-14_

## Where the product is

Live on Railway at `www.timlul-ai.com`. A mistake on `main` is no longer local.

| Surface | State |
| --- | --- |
| Live calls | Works. Two engines (Recall/IVRIT) share `:8788`.|
| Companies | Works. MAYA connected; 234/234 have sector. |
| Chat / Ask Atlas | **On `/api/chat/v2`** (07). Pinpoint works; market-wide search down. |
| Workspace | Works — intake, tables, chat over the docs. |
| Agents | **Stub.** Page + `lib/agents/data.ts`; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/`. Lowest unblocked
one, branch per slice. **STRICT ORDER: 08 → 09 → 10 → 11 → 12 → 13 → 14** (founder, final).

**Phase A done; B1a (06) and B1b (07) merged.** Chat's UI is on the unified backend: visible search
mode (from scope, never from the question), nine degradation states in both locales, alias-aware
`@mention`. Project and transcript chats stay on the OLD `/api/chat` until B2 — v2 honours neither
grounding.

**Two reds, filed with numbers, not re-scored** (M2) — evidence in that branch's
`docs/evidence/` dir:

1. **Market-wide search does not complete.** Unscoped scan over 98,042 chunks →
   `statement timeout` (~8.6s). Scoped search — the channel both MUST-PASS cases close through —
   works end to end. Class-G discovery is RED; the diversification built for it cannot run yet.
2. **The $0.06/answer budget does not hold.** Three real answers: $0.086 / $0.025 / $0.097. Caching
   measured OFF, so it cannot justify the budget.

Both are eval-gated retrieval parameters; **a DEDICATED PARALLEL SESSION owns the fix**. Re-measure:
`scripts/measure-chat-answer.mjs`. **Railway's `ANTHROPIC_API_KEY` is unproven** (local is verified)
— **a 401 on the first deploy of `/api/chat/v2` is the first thing to check**; absent returns 503.

**Next: ticket 08 (B2, Ask Atlas surfaces).** `TranscriptChatPanel` + company-page chat onto v2,
whole-call injection, retiring the old wire format — which also removes 07's `useV2` fork and
restores citation chips (v2 carries none).

Also open: **ticket 13** holds the cleanup list; poller/sweep deferred past V1.
