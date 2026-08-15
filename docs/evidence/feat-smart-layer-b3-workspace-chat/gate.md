# B3 gate — the swap does not clear the bar; workspace chat is left alone

Ticket: `.scratch/smart-layer-build/issues/09-workspace-chat.md` · Branch:
`feat/smart-layer-b3-workspace-chat` · Measured 2026-08-15

**Verdict: the new retrieval does not MEASURABLY beat the planner on a workspace shelf, so nothing
is swapped.** The ticket names this outcome in advance and calls it a COMPLETED ticket, not a
blocker: ticket 10 and the agents chain are not held by it.

**Read the reason carefully, because it is not the obvious one.** The swap is not *worse*. It is
**indistinguishable** — the two scorers trade the lead by a single case depending on how big the
shelf is, in both directions. "Measurably beats" is not met by a design that loses at one shelf
size and wins at another by one case out of fourteen.

Harness: `scripts/retrieval-eval/workspace-gate.mjs`. Raw results in
`scripts/retrieval-eval/results/workspace-gate-2026-08-15T16-2{1-54,1-13,2-32}.{md,json}` (shelf
3, 6, 12).

## The measurement

Four arms, each fed the **same shelf**, the **same token budget** (the route's own 18,000 with its
900-token overhead), and scored the same way: **did the eval set's anchored passage reach the
prompt?** P and E differ in exactly one function — the window scorer — which is the whole design of
`plan.ts` ("step 2 is the only part that changes", founder decision D8).

| arm | what it is | shelf 3 | shelf 6 | shelf 12 |
| --- | --- | --- | --- | --- |
| **P** | the planner — production `planContext`, Hebrew-aware term overlap | **12/14** | 8/14 | **8/14** |
| **E** | the swap — production `planContext`, cosine over the SAME windows | 11/14 | **9/14** | **8/14** |
| **R** | production chunks, cosine, no fairness ration (retrieval's own shape) | 11/14 | 7/14 | 6/14 |
| **F** | production chunks, cosine, WITH the planner's fairness ration | 11/14 | 7/14 | 6/14 |

P and E run through the REAL `planContext`, not a copy, for the same reason `run.mjs` imports the
real chunker (ingestion standard §5): a harness that scores a copy certifies a fiction.

**P −1, +1, 0 against E across three shelf sizes is a wash, and the wash is the finding.** A single
case on a 14-case set is inside the noise this set can resolve, and the sign is not stable. What IS
stable is that **R and F lose at every shelf size** — the retrieval subsystem's own chunk shape,
poured into a workspace-sized budget, is the worst of the four, with or without a fairness ration.

## What the first run got wrong, and why it is recorded here

**The first run read P 8 / E 6 and concluded the planner won outright. That conclusion was an
artifact of the harness, and cold review caught it.** Three harness defects, all now fixed:

1. **Arm E was embedding RAW window text** while arm R and production both embed a deterministic
   metadata prefix (`{company} · {title} · עמ' {N}:`). That is a handicap on precisely the arm the
   ticket defines as "the swap" — and it was worth **three cases**: E went 6/14 → 9/14 at shelf 6
   when given the same prefix recipe production uses. The first run's headline rested on it.
2. **Arm R's chunk markers were not charged to the budget** while P and E paid for their `[label]`
   lines inside `planContext`. A bias in the challenger's favour; fixed, and R fell 8 → 7.
3. **Attribution parsed the fence header with a regex** (`/id: ([^)]+)\)/`) over a line that also
   carries an untrusted title. Now every section is attributed by membership in the known shelf.

And one found before review, kept because the first number was wrong for it: arm R initially read
2/14 because the harness built its markers from the chunker's numeric `firstLine` instead of its
`firstLineId` string, so every transcript case failed by construction.

A **second review round** at the tip found a fifth, of the same family as the first:

5. **A split page's prefix named a page that does not exist.** A long filing page becomes two
   windows labelled `p.14 (1/2)`, and the harness digit-stripped that whole label — embedding the
   window under `עמ' 1412`. It hit **8,735 of 95,274 document windows (9.2%)** — count it by running
   the production `windowsOf` over every `document_pages` row and matching labels against
   `/\(\d+\/\d+\)/`, which is what produced those two numbers — again on arm E,
   again a wrong input invented by the harness rather than by the design. Page and part are now read
   separately. **Re-running all three shelf sizes returned the identical table** — so unlike bug 1,
   this one moved no case, and that is a measured claim rather than a hopeful one. To CHECK it rather
   than take it: the pre-fix runs are `workspace-gate-2026-08-15T16-0{3-17,2-32,5-31}.json` at commit
   `af9ac65^`, removed at `af9ac65` so the results directory holds one provenance rather than two —
   `git show af9ac65^:scripts/retrieval-eval/results/workspace-gate-2026-08-15T16-02-32.json`.

And a sixth, in the attribution: matching `id: <itemId>)` as a substring of a header that also
carries an untrusted title is still a proxy. It now matches the whole reconstructed header from
position 0, which a title cannot forge because the marker it splits on is already defanged.

**Six harness bugs, three of which moved a number that was about to be reported.** That is the
argument for the two guards this file now carries: a missing embedding **throws** rather than
scoring 0 (`cosine` returns 0 for an absent vector — indistinguishable from "this passage does not
answer the question"), and the per-item `spread` is written to the JSON so a reader can see WHICH
file the budget went to, which is what exposed bug 4.

The gate was **not re-scored until something passed** (app.md M2). It was re-scored until each arm
was measured as its own design rather than as the harness's accident — and the verdict did not
change: the bar is still unmet.

## The real lead: UNION, and what that number is NOT

The two scorers miss **different** cases, consistently, at every shelf size:

| | shelf 3 | shelf 6 | shelf 12 |
| --- | --- | --- | --- |
| planner only | 04, 18 | 02, 09 | 02, 09 |
| swap only | 08 | 01, 06, 08 | 01, 06 |
| neither (nor R) | 10 | 04, 10, 18 | 04, 08, 10, 18 |
| **P ∪ E** | **13/14** | **11/14** | **10/14** |

P ∪ E beats the better arm by 1–2 cases at every shelf size, and the membership is stable: the
planner keeps 02 (W4 — the source garbles «הרווח התפעולי» as «הרווח הטיפולי», and the user's own
words still find it) and 09 (a slide-deck page); the swap keeps 01 and 06 (headline numbers, and a
fact stated once in passing).

> ⚠ **P ∪ E is an ORACLE BOUND, not a system that exists.** It is the count of cases *some* arm got,
> and a real union would have to send both selections through **one shared budget** — the very
> constraint every arm here was held to. Its true score is therefore somewhere at or below 11/14 at
> shelf 6, not equal to it. Quoting the union as an achieved number would be exactly the M1 error
> this file is otherwise careful about.

It still belongs to a future ticket with its own gate, and A4's history is the reason to measure a
fusion rather than assume one: fused naively by RRF, a second channel dragged dense from MRR 0.268
to 0.141.

**The three or four nobody retrieves** are not a scoring problem: 04 and 18 need the RIGHT QUARTER
picked between two calls from the same company (a scoping question, not a ranking one), and 10 needs
two anchors in two files at once, which every arm gets half of.

## What this gate does not measure

- **Answer quality.** Whether the anchored passage reached the model, not what the model said.
- **A window is not a chunk.** Arm E's metadata prefix uses the production *recipe* but a window's
  inputs (source company/title, the label the file gave itself) — a window has no `section`/
  `speakers` the way a chunk does.
- **A page-anchored hit is credited on its `[p.N]` marker**, so a window the budget trimmed can be
  credited on its first page. Identical in every arm.
- **Class G (discovery) is excluded on purpose** — market-wide by definition, and a shelf is not the
  market. Cases 13/14/15/17 carry no anchor to retrieve. 14 of 20 cases are scored.
- **Cost was not re-measured.** Nothing about the request shape changed: same route, same 18,000
  token budget, same one model call. The prompt STRINGS changed (titles and labels are now
  sanitised), which cannot move the budget because it is counted in tokens over the same text.
- **Three shelf sizes, not a sweep.** 3, 6 and 12 bracket what the product's intake actually
  produces; nothing here says what happens at 50.

## What DID ship on this branch

The gate's outcome is "change nothing", but two things in the ticket are not gated on it:

1. **The prompt boundaries are closed across SIX doors** — the slice-2 BLOCKER plus five more that
   two review rounds found: the fence marker line, the shelf listing and partial list, the `"""`
   quote blocks, the conversation turns, the clip caption, and `intake/selectSources.ts` (the
   builder that decides which FILES get fetched, which the first version of the scan did not name).
   `fencePart`/`quoted` in `context.ts` are the one door; `promptInjectionDiscipline.test.ts` fails
   for a NEW interpolation that skips them, and app.md now carries the law it enforces.
   **The honest limit:** the scan reads the three builders it names. `chat/attachments.ts` and
   `chat2/` are held by their own per-site tests. Door six was found because the scan was scoped
   narrower than the defect — so "closed" here means these six, not "no such door remains".
2. **`planContext` takes its scorer as an argument** — the D8 seam, made real so this gate could
   measure production code instead of a copy. The default is unchanged.
