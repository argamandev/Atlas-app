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
| Chat / Ask Atlas | **`/api/chat/v2`, the only route.** Every grounding works; market-wide search down. |
| Workspace | Intake, tables, chat over docs — but **the founder reports undescribed problems in workspace chat** (see 09). |
| Agents | **Stub.** Page + `lib/agents/data.ts`; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/`. Lowest unblocked
one, branch per slice. **STRICT ORDER: 08 → 09 → 10 → 11 → 12 → 13 → 14** (founder, final).

**Phase A done. TICKET 08 IS CLOSED.** 08c-3's residues are in `docs/open-findings.md`, plus a
founder glance owed (`reportTruncated`'s wording changed after its drive).

**Two reds, filed with numbers, not re-scored** (M2; numbers in 08c's evidence): market-wide search
times out (~8.6s over 98,042 chunks) so class-G discovery is RED, scoped works; and $0.06/answer did
not hold ($0.1010 company-scoped). Both eval-gated; **a DEDICATED PARALLEL SESSION owns the fix**;
re-measure with `scripts/measure-chat-answer.mjs`. **Railway's `ANTHROPIC_API_KEY` is unproven** —
on a v2 chat failing in production, check for a 401 first.

**09 IS BUILT BUT NOT MERGED** — branch `feat/smart-layer-b3-workspace-chat`, green (1167). Its gate
says the swap does not beat the planner (12/8/8 vs 11/9/8 at shelf 3/6/12), so workspace chat is
deliberately unchanged. **The founder's test hit the INTAKE, not chat:** `בז"א` matches no MAYA
name, so Atlas denied holding 12 filings it could reach. **09b** fixes it — the company is PICKED
with `@`, travelling as an id. **A merge owes a review verdict on the tip.**

**Next: close 09, then 10** (agent tables + create flow). **13** holds the cleanup list;
poller/sweep deferred past V1.
