# Status

**Rewritten, never appended. Intent and next move only.** Dated entries belong in `PROGRESS.md`;
what has landed gets removed, not struck through.

_Last rewritten: 2026-08-14_

## Where the product is

Live on Railway at `www.timlul-ai.com`. A mistake on `main` is no longer local.

| Surface | State |
| --- | --- |
| Live calls | Works. Two engines (Recall/IVRIT) share `:8788`. |
| Companies | Works. MAYA connected; 234/234 sector + description. |
| Chat / Ask Atlas | **On `/api/chat/v2`** (ticket 07). Pinpoint works; market-wide search is down. |
| Workspace | Works — intake, tables, chat over the doc set. |
| Agents | **Stub.** Page + `src/lib/agents/data.ts`; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/`. Lowest unblocked
one, branch per slice, `/ship`. **STRICT ORDER: 08 → 09 → 10 → 11 → 12 → 13 → 14** (founder,
2026-08-14, final; `DECISIONS.md`).

**Phase A done; B1a (06) and B1b (07) merged.** Chat's UI is on the unified backend: visible search
mode (from scope, never from the question), nine degradation states in both locales, alias-aware
`@mention`, and a persistence door so a partial answer cannot store as whole. Project chats stay on
the OLD `/api/chat` until B2 — v2 takes no `projectId`.

**Two reds, filed with their numbers, not re-scored** (M2) — evidence under
`docs/evidence/feat-smart-layer-b1b-chat-surface/`:

1. **Market-wide search does not complete.** Unscoped dense scan over 98,042 chunks →
   `canceling statement due to statement timeout` (~8.6s). Scoped search — the channel both
   MUST-PASS cases close through — works end to end. Class-G discovery is RED, and the
   per-company diversification built for it cannot run until the index is fixed.
2. **The $0.06/answer budget does not hold.** Three real answers: $0.086 / $0.025 / $0.097. Caching
   measured OFF (`cache_read = 0` on all three), so the budget must not be justified by it.

Both levers are eval-gated retrieval parameters; **a DEDICATED PARALLEL SESSION owns the fix**.
Re-measure: `scripts/measure-chat-answer.mjs`.

**Railway's `ANTHROPIC_API_KEY` is unproven** (local is verified). **A 401 on the first deploy of
`/api/chat/v2` is the first thing to check**; an absent variable returns 503.

**Next: ticket 08 (B2, Ask Atlas surfaces).** `TranscriptChatPanel` + company-page chat onto v2,
whole-call injection, retiring the old wire format — which also removes 07's `useV2` fork.

Also open: **ticket 13** holds the cleanup list; poller and sweep UNSCHEDULED past V1.
