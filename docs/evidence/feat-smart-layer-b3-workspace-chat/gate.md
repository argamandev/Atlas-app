# B3 gate — the workspace planner holds; the swap does NOT ship

Ticket: `.scratch/smart-layer-build/issues/09-workspace-chat.md` · Branch:
`feat/smart-layer-b3-workspace-chat` · Measured 2026-08-15

**Verdict: the new retrieval does not measurably beat the planner on a workspace shelf, so
workspace chat is left alone.** The ticket names this outcome in advance and calls it a
COMPLETED ticket, not a blocker: ticket 10 and the agents chain are not held by it.

Harness: `scripts/retrieval-eval/workspace-gate.mjs`. Raw results:
`scripts/retrieval-eval/results/workspace-gate-2026-08-15T15-39-56.{md,json}` (shelf 6) and
`…T15-40-41.{md,json}` (shelf 3).

## What was compared, and how it was kept honest

Four arms, each fed the **same shelf**, the **same token budget** (the route's own 18,000 with
its 900-token overhead), and scored the same way: **did the eval set's anchored passage reach
the prompt?** P and E differ in exactly one function — the window scorer — which is the whole
design of `plan.ts` ("step 2 is the only part that changes", founder decision D8).

| arm | what it is | shelf 6 | shelf 3 |
| --- | --- | --- | --- |
| **P** | the planner — production `planContext`, Hebrew-aware term overlap | **8 / 14** | **12 / 14** |
| **E** | production `planContext`, cosine over the SAME windows | 6 / 14 | 10 / 14 |
| **R** | production chunks, cosine, no fairness ration (retrieval's own shape) | 8 / 14 | 11 / 14 |
| **F** | production chunks, cosine, WITH the planner's fairness ration | 8 / 14 | 11 / 14 |

P and E run through the REAL `planContext`, not a copy, for the same reason `run.mjs` imports
the real chunker (ingestion standard §5). A harness that scores a copy certifies a fiction.

**Two things this gate refuses to do**, because the ticket asks it not to (app.md M2):

- It was not re-scored until retrieval passed. Arm F was added because the fairness ration is
  the one thing R gives up that `plan.ts` was built around — and it changed nothing.
- A missing embedding **throws** rather than scoring 0. `cosine` returns 0 for an absent
  vector, which is indistinguishable from "this passage does not answer the question" — a
  quota error mid-run would otherwise have handed the planner a win it did not earn, in the
  one gate whose job is to be able to say the planner won.

**One bug found and fixed mid-run, recorded because the first number was wrong.** Arm R first
read 2/14. The production chunker exposes both `firstLine` (a number) and `firstLineId` (the
`L0008` string); the harness built its markers from the number, so the coverage check never
matched and every transcript-anchored case failed by construction. The `spread` column — which
file the budget actually went to — is what showed R *had* selected the right transcript. It is
kept in the JSON for the next reader.

## What the numbers say

**Nothing beats the planner, and the gap is not close enough to argue about.** The literal
swap the ticket describes — arm E — is the WORST of the four. Retrieval's own shape (R) ties at
shelf 6 and still loses at shelf 3. The verdict is the same at both shelf sizes, so it is not an
artifact of how big a shelf is assumed to be.

**Why the planner holds — the ticket predicted both reasons.** Term overlap across six files is
a different problem from ANN over 98,000 chunks: with the scope already narrowed to a shelf the
analyst chose, the embedding's advantage (finding the right *document*) is spent before the
question is asked, and what is left is picking the right *passage* — where the user's own words
are a strong signal. The corpus warts cut the same way: case 02 is W4 (the source garbles
«הרווח התפעולי» as «הרווח הטיפולי») and the planner still passes it while all three retrieval
arms fail.

**THE REAL LEAD IS UNION, NOT REPLACEMENT.** The two scorers fail on *different* cases:

- planner only: **02, 09, 11** — W4 garble, a slide-deck number, a Q&A reply
- retrieval only: **01, 06, 08** — headline numbers, a fact stated once in passing, a deck page
- neither: **04, 10, 18** — pick-the-right-quarter, cross-source agreement, duplicate discipline

P alone is 8/14; P ∪ R is **11/14**. That is a materially better answer than either, and it is
not what this ticket was scoped to build. It belongs to a future ticket with its own gate — the
lexical channel's history (A4: fused naively by RRF, it dragged dense from 0.268 to 0.141) is
the reason to measure a fusion rather than assume one.

**The three nobody retrieves** are worth a line each, because none of them is a scoring problem:
04 and 18 need the RIGHT QUARTER chosen between two calls from the same company — a scoping
question, not a ranking one — and 10 needs two anchors in two files at once, which every arm
gets half of.

## What this gate does not measure

- **Answer quality.** It measures whether the anchored passage reached the model, not what the
  model then said.
- **Arm E embeds RAW window text** — no deterministic metadata prefix. `run.mjs`'s own
  `B-gemini-nopfx` ablation is the reference for what that costs.
- **A page-anchored hit is credited on its `[p.N]` marker**, so a window the budget trimmed can
  be credited on its first page. The over-credit is identical in every arm.
- **Class G (discovery) is excluded on purpose** — market-wide by definition, and a shelf is not
  the market. Cases 13/14/15/17 carry no anchor to retrieve.
- **Cost was not re-measured**, because nothing about the request shape changed. The workspace
  route's budget is unchanged at 18,000 prompt tokens.

## What DID ship on this branch

The gate's own outcome is "change nothing", but two things in the ticket are not gated on it:

1. **The fence line is defanged** (the slice-2 BLOCKER). Only the source BODY was sanitised;
   every marker line interpolated a title, a kind and an id, and the shelf listing, the partial
   list, the marked passage and compose's whole instruction region did the same in the open.
2. **`planContext` takes its scorer as an argument** — the D8 seam, made real so this gate could
   measure production code instead of a copy. The default is unchanged.
