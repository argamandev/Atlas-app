# Status

**Rewritten, never appended. Intent and next move only.** Dated entries go in `PROGRESS.md`; what
has landed is removed, not struck through.

_Last rewritten: 2026-08-15 (ticket 08c-3)_

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

**Phase A done; TICKET 08 IS CLOSED — 06 → 08c-3 merged.** `/api/chat/v2` is the ONLY chat route;
the old `/api/chat` and its four dead modules are deleted. The loop carries IMAGE content blocks, so
a marked report passage and up to four snipped page images ride the turn. "Stuffed FIRST turn" is
CLOSED — §5 reads "any turn", $0.13 unchanged.

**08c-3 leaves three, all filed:** no model-availability fallback, and a call-grounded turn is not
company-scoped for its tools (`docs/open-findings.md`); and `reportTruncated`'s wording changed in
both locales after its browser drive and was NOT re-rendered — a founder glance closes it.

**Two reds, filed with numbers, not re-scored** (M2) — numbers in that branch's `docs/evidence/`:
(1) **market-wide search does not complete** — unscoped scan over 98,042 chunks hits `statement
timeout` (~8.6s), so class-G discovery is RED; scoped search works. (2) **the $0.06/answer budget
did not hold** — re-confirmed at 08c-1: a company-scoped turn is $0.1010 with no project at all.
Both are eval-gated retrieval parameters; **a DEDICATED PARALLEL SESSION owns the fix**. Re-measure:
`scripts/measure-chat-answer.mjs` (`--call`, `--project`). **Railway's `ANTHROPIC_API_KEY` is
unproven** — on any v2 chat failing in production, check for a 401 first; absent returns 503.

**Next: 09** — workspace chat, smaller than it was and no longer built over a dying route: `shelf`
is already in the union and `read_workspace` reads `workspaceId`.

Also open: **ticket 13** holds the cleanup list; poller/sweep deferred past V1.
