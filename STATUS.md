# Status

**Rewritten, never appended. Intent and next move only.** Dated entries go in `PROGRESS.md`; what
has landed is removed, not struck through.

_Last rewritten: 2026-08-15 (ticket 09)_

## Where the product is

Live on Railway at `www.timlul-ai.com`. A mistake on `main` is no longer local.

| Surface | State |
| --- | --- |
| Live calls | Works. Two engines (Recall/IVRIT) share `:8788`.|
| Companies | Works. MAYA connected; 234/234 have sector. |
| Chat / Ask Atlas | **`/api/chat/v2`, the only route.** Every grounding works — company, call, live captions, project, report page + snip; market-wide search down. |
| Workspace | Works — intake, tables, chat over the docs. |
| Agents | **Stub.** Page + `lib/agents/data.ts`; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/`. Lowest unblocked
one, branch per slice. **STRICT ORDER: 08 → 09 → 10 → 11 → 12 → 13 → 14** (founder, final).

**Phase A done. TICKETS 08 AND 09 ARE CLOSED.** `/api/chat/v2` is the ONLY chat route; 08c-3's
residues are filed in `docs/open-findings.md`, plus one founder glance owed (`reportTruncated`'s
wording changed after its browser drive).

**Two reds, filed with numbers, not re-scored** (M2) — numbers in 08c's `docs/evidence/`:
(1) **market-wide search does not complete** — an unscoped scan over 98,042 chunks hits `statement
timeout` (~8.6s), so class-G discovery is RED; scoped search works. (2) **the $0.06/answer budget
did not hold** — a company-scoped turn is $0.1010 with no project at all. Both are eval-gated
retrieval parameters; **a DEDICATED PARALLEL SESSION owns the fix**. Re-measure:
`scripts/measure-chat-answer.mjs`. **Railway's `ANTHROPIC_API_KEY` is unproven** — on any v2 chat
failing in production check for a 401 first; absent returns 503.

**09 closed by MEASURING, not building.** Its gate reads **planner 8/14, the literal swap 6/14,
retrieval's own chunks 8/14** on a workspace shelf, so **workspace chat is unchanged** — the outcome
the ticket names in advance. `scripts/retrieval-eval/workspace-gate.mjs` is standing; re-run it
before any workspace-retrieval change. The lead is UNION, not replacement, but P ∪ R = 11/14 is an
ORACLE BOUND that breaks the shared budget: its own ticket, its own gate. Ungated work that shipped:
the fence line is defanged. Evidence: `docs/evidence/feat-smart-layer-b3-workspace-chat/`.

**Next: 10** — agent tables + create flow.

Also open: **ticket 13** holds the cleanup list; poller/sweep deferred past V1.
