# Status

**Rewritten, never appended. Intent and next move only.** Dated entries go in `PROGRESS.md`; what
has landed is removed, not struck through.

_Last rewritten: 2026-08-16 (09b + two founder bugs)_

## Where the product is

| Surface | State |
| --- | --- |
| Live calls | Works. Two engines (Recall/IVRIT) share `:8788`.|
| Companies | Works. MAYA connected; 234/234 have sector. |
| Chat / Ask Atlas | **`/api/chat/v2`, the only route.** Every grounding works; market-wide search down. |
| Workspace | Intake, tables, chat over docs. The founder's reported problem was the INTAKE, fixed in 09b. |
| Agents | **Stub.** Page + `lib/agents/data.ts`; no machinery. |

## Building the smart layer

Spec: `docs/SMART-LAYER-SPEC.md`. Tickets: `.scratch/smart-layer-build/issues/`. Lowest unblocked
one, branch per slice. **STRICT ORDER: 10 → 11 → 12 → 13 → 14** (founder, final).

**Phase A done, 08 CLOSED**; residues in `docs/open-findings.md`, plus a founder glance owed on
`reportTruncated`'s wording.

**Two reds, filed with numbers, not re-scored** (M2; numbers in 08c's evidence): market-wide search
times out, so class-G discovery is RED and only scoped works; and $0.06/answer did not hold
($0.1010). Both eval-gated, **a PARALLEL SESSION owns them**; re-measure with
`scripts/measure-chat-answer.mjs`. **Railway's `ANTHROPIC_API_KEY` is unproven** — on a v2 chat
failing in production, check for a 401 first.

**09 + 09b MERGED 2026-08-16** (`6447f4b`), with two founder-reported bugs. Workspace chat is
deliberately unchanged — its gate says the swap does not beat the planner. Story in PROGRESS.

**Merged with `ATLAS_SHIP_OVERRIDE`, so three things are OPEN** (all in `docs/open-findings.md`):
round 9's verdict was CHANGES, its BLOCKER a non-regression `main` did worse before; 09b's four
recurrence declarations are unanswered, so the next merge hits the same gate; and **81 decks now
leave the documents tab**, the bucket meant to hold them never having been built — founder's call,
and the most visible.

**Battery 1182/1183 on main; the red is a stray `CLAUDE.md` in a worktree, not the code.**

**Next: close 09, then 10** (agent tables + create flow). **13** holds the cleanup list;
poller/sweep deferred past V1.
