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

**09 IS BUILT BUT NOT MERGED** — `feat/smart-layer-b3-workspace-chat`. Its gate says the swap does
not beat the planner (12/8/8 vs 11/9/8 at shelf 3/6/12), so workspace chat is deliberately
unchanged. **The founder's test hit the INTAKE, not chat:** a hand-typed company name matched no
MAYA name, so Atlas denied holding 12 filings it could reach. **09b** fixes it — the company is
PICKED with `@`. **A merge owes a review verdict on the tip.**

**Two founder bugs also fixed there, 2026-08-16** — an impossible ANNUAL row on the documents tab,
and Ask Atlas 400ing on every period page with no transcript. Detail:
`founder-bugs-2026-08-16.md`. **Battery 1182/1183; the red is a stray `CLAUDE.md` in a worktree.**

**Next: close 09, then 10** (agent tables + create flow). **13** holds the cleanup list;
poller/sweep deferred past V1.
