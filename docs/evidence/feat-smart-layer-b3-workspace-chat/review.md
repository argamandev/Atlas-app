# Cold review — ticket 09 (B3 workspace chat)

Branch: `feat/smart-layer-b3-workspace-chat` · `atlas-reviewer` plus a two-axis (standards / spec)
pass, cold context each.

**Rounds 1–4 reviewed `58d2a4b` and earlier; verdict CHANGES each time, every finding answered
below.** Their sha and verdict are stated here as prose ON PURPOSE: `parseReviewRecord` takes the
FIRST `REVIEWED:`/`VERDICT:` pair in the file, so a second pair would hand the ship gate the OLDEST
sha and let a stale approval stand for the tip. The live pair is round 5's, in its own section at
the end of this file.

Nine findings, every one answered below — fixes in `ed225c3` (the prompt boundaries) and `288435c`
(the harness and the claims it supported). **Two of them changed what this branch says about
itself**: the swap was being handicapped by the harness, and the union number was an oracle bound
being quoted as an achievement.

A second round was run at the tip, because a verdict about `e567d46` cannot clear a merge of code
that has since moved — see **Round 2** at the foot of this file.

---

FINDING · BLOCKER · `src/lib/workspace/chat/prompt.ts:96` — the conversation region interpolated
every turn's content with no sanitiser, so a client-supplied turn (or a stored assistant turn that
echoed a document's words) could print a literal fence marker and forge the boundary this branch
claims to close. It was the one field the new forge test did not fill.
FIXED `ed225c3` — turns go through `defang`; `prompt.test.ts` covers both roles.
RECURRENCE: no
The fix landed in the branch where the bug was noticed, which is the clause this law opens with.
The mechanism bought: `promptInjectionDiscipline.test.ts`, which fails for ANY interpolation in the
builders that reaches the model through no sanitiser. Its first version scoped to `input.` and would
have missed this exact hole — that is now its own mutation case.

FINDING · BLOCKER · `src/app/api/workspaces/[id]/chat/route.ts:95`, `…/compose/route.ts:159` —
the clip caption is built from `workspace_items.name` and handed to the model as a text part beside
the image, a second channel the prompt-builder fix never touched.
FIXED `ed225c3` — sanitised in `snipCaption` itself (the one door every caption passes through),
with a test asserting it stays one line. chat2's own `snipCaption` has carried this case since 08c-3.
RECURRENCE: no
Same law again, one channel over.
Note the honest limit: the scan does NOT reach `src/lib/chat/attachments.ts`, so this specific door
is held by its unit test, not by the scan.

FINDING · BLOCKER · (standards axis) `prompt.ts` / `compose.ts` — `"""` is a second boundary
marker in the same prompts and only the fence was defanged. A passage containing a line of `"""`
closes its block and the rest reads as instruction.
FIXED `ed225c3` — `quoted()` owns those blocks and neutralises the delimiter inside.
RECURRENCE: no
Third instance of one law on one branch, which is why the branch stopped
patching sites and bought the scan.

FINDING · BLOCKER · (spec axis) `scripts/retrieval-eval/workspace-gate.mjs` — arm E, the arm the
ticket DEFINES as the swap, embedded raw window text while arm R and production both embed a
deterministic metadata prefix. The verdict rested on it.
FIXED `288435c` — same prefix recipe production uses. **Worth three cases: E went 6/14 → 9/14.**
The headline changed from "the planner won" to "indistinguishable"; the ticket's gate is still unmet,
so the outcome did not change, but the stated reason was wrong and is now right.
RECURRENCE: no
And M1 · A green signal proves only what it measured (a green signal
proves only what it measured). Mechanism: the harness header now states what each arm is measured
as, and the evidence file records all four harness bugs rather than only the verdict. No test tier
is available — this is a one-off script, and its guard is that it refuses to score on a missing
embedding rather than silently scoring 0.

FINDING · WARNING · `gate.md` — "P ∪ R is 11/14, materially better than either" is an oracle
upper bound, not a measured system: a union sends both selections and breaks the single shared
budget every arm was held to — and the ticket status line carried it forward without the caveat.
FIXED `288435c` — labelled an ORACLE BOUND in `gate.md`, `STATUS.md` and the ticket, with the
reason.
RECURRENCE: no
Same law as the finding above, one document over.

FINDING · WARNING · (spec axis) `gate.md` — "the same verdict at both shelf sizes, so it is not
an artifact" claimed more than 3 and 6 could support; both are small, and the planner IMPROVES as the
shelf shrinks.
FIXED `288435c` — a third size (12) was run; the table now carries all three.
RECURRENCE: no

FINDING · NIT · `workspace-gate.mjs` — arm R's chunk markers were not charged to the budget while
P and E paid for their `[label]` lines, so the challenger ran on slightly more usable budget.
FIXED `288435c` — charged; R fell 8 → 7. A bias in the LOSER's favour, which is why it was fixed
rather than argued away.
RECURRENCE: no

FINDING · NIT · (standards axis) `workspace-gate.mjs` — attribution re-parsed the fence header
with `/id: ([^)]+)\)/`, a regex over a line that also carries an untrusted title (M3.2, a proxy for
a fact the harness already had).
FIXED `288435c` — attribution is by membership in the known shelf.
RECURRENCE: no

FINDING · WARNING · working tree — at review time the tree carried uncommitted, non-compiling
work, while `verify-app.md` said nothing had been committed to `src/` since the drive. True of HEAD,
misleading about the tree. The tree is committed and green (`tsc` clean, 1149/1149).
RECURRENCE: no
The 8c re-check it asked for was done: every driven row was **re-driven**, not re-ticked.

---

## Answered but NOT fixed, deliberately

- **Spec axis: `truncated[]`/`omitted[]` carry RAW titles while the prompt carries sanitised ones,
  so model and caveat box could name a file differently.** Correct observation, and it is the right
  behaviour: sanitising is a prompt-BOUNDARY concern, and the caveat box is HTML with one `<bdi>`
  per title — putting `»` in front of the analyst because a filename contained `>>>` would be a
  degradation of the screen to solve a problem the screen does not have. Recorded here so the next
  reader does not "fix" it.
- **Standards axis: a branded `FenceSafe` type would make the lie unrepresentable (M3.3) rather than
  scanned.** Agreed that it is the stronger tier. Not taken on a branch whose product change is
  "nothing": it ripples through `PromptInput`/`ComposeInput` and their routes. The scan is the
  honest middle tier and declares its own limits.
- **Standards axis smells** — `fenceLine`'s four positional strings, `planByChunks`'s boolean flag
  arm selector, the repeated anchor switch, and `score`/`scoreWindow` shadowing in `plan.ts`. All
  fair; all in code that is either a harness or a one-line helper. Left as noted.

---

## Why every RECURRENCE answer here reads "no"

Not because nothing recurred — eight doors on one branch is the opposite of that — but because the
gate's grammar cannot express what did. `recurrenceProblems` resolves a named law against the
always-on set and requires that law to exist ON MAIN, so:

- **The meta-laws (M1, M2, M3) are not `LAW ·` entries**, so `parseLaws` never indexes them. Most of
  what recurred here repeats M3.1 (fix at the choke point) and M1 (a green signal proves only what it
  measured). Those repetitions are named in each finding's prose instead.
- **The law this branch FILES cannot be named either**, by design: a branch that could satisfy the
  recurrence ritual by writing the law it claims to be repeating would satisfy nothing. The gate says
  so itself — "answer RECURRENCE: no and file the new law normally" — which is what happened here.

The strengthening ADR-0002 actually asks for DID land, and it is the thing to check rather than these
lines: the new law arrived at `ENFORCED test`, and when round 3 found a door the test could not
reach, it gained an `impossible` tier in that same commit (`askModel`'s `captions` takes `FenceSafe`).
Reading a file full of "no" as "nothing recurred" would be exactly backwards.


## Round 2 — at the tip (`680e4d7`)

Round 1's verdict was about `e567d46`, and 23 files had changed since; a verdict cannot clear a
merge of code it never read. Round 2 re-derived **every number** in `gate.md`, `STATUS.md`,
`PROGRESS.md`, the ticket and `retrieval-eval-set.md` from the three result JSONs and found them all
correct, and it mutated `prompt.ts` with a live unsanitised interpolation to confirm the scan goes
red against the real file. It then found five more, two of them substantive.

FINDING · BLOCKER · `src/lib/workspace/intake/selectSources.ts:73,135,158,171` — A SIXTH DOOR. This
builder, in the same feature, interpolated document titles, company names, MAYA candidate titles and
raw conversation turns with no sanitiser — and it is the step that decides which FILES get fetched,
reachable from workspace chat because `wantsDocuments` is model text written under the influence of
the documents the fence exists to quarantine. Worse, the scan bought to end this sequence named two
builders and silently omitted this third, so "the prompt boundaries are closed" was a scoped claim
overstating its own closure — in four documents.
FIXED — titles, company names, ids and turns sanitised; `selectSources.ts` added to `BUILDERS`;
every claim in the evidence, STATUS, PROGRESS and the ticket now says which six doors and states
what the scan does not reach.
RECURRENCE: no
This is the first occurrence of the law it repeats, because that law did not exist until this commit
— it is filed here as `Every untrusted string reaching a MODEL passes a sanitiser` in
`.claude/rules/app.md`, ENFORCED test. Filing it is the answer ADR-0002 asks for; the six occurrences
are recorded in its VERIFY line so the next reader knows the tier was bought, not guessed.

FINDING · WARNING · `scripts/retrieval-eval/workspace-gate.mjs:329` — arm E's prefix for a SPLIT page
window read `עמ' 1412`, because `p.14 (1/2)` was digit-stripped whole. Same family as the bug that
already flipped this gate's headline once, on the same arm.
FIXED — page and part read separately and passed to `filingPrefix` as production does. **8,735 of
95,274 document windows (9.2%) were affected, and re-running all three shelf sizes returned the
IDENTICAL table** — so this one moved no case, measured rather than assumed.
RECURRENCE: no
It repeats meta-law M2 (never let a test certify an untrue premise), which is not a `LAW ·` entry and
so cannot be named in this grammar. The mechanism taken instead: the harness reads page and part from
the window's own structure rather than re-deriving them from a label.

FINDING · WARNING · `promptInjectionDiscipline.test.ts` — the mutation case re-implemented the scan's
filter, so it proved a COPY could go red rather than the scan itself. The branch makes exactly this
argument about the gate harness two files over.
FIXED — one exported `unsanitised()` predicate; both file scans and the mutation case call it.
RECURRENCE: no

FINDING · NIT · `workspace-gate.mjs:376` — attribution substring-matched `id: <itemId>)` against a
header line that also carries an untrusted title: membership-flavoured, not membership.
FIXED — matches the whole reconstructed header from position 0, which a title cannot forge because
the marker the split runs on is already defanged.
RECURRENCE: no

FINDING · NIT · `verify-app.md:51` — the 8c re-drive is pinned to `288435c` in prose only, so a
reader cannot tell a fresh tick from a rotted one.
FIXED — the table states the sha it was driven at and what has changed since.
RECURRENCE: no

---

## Round 3 — at the tip (`58d2a4b`)

Round 3 re-derived every number in the evidence, STATUS, PROGRESS, the ticket and the eval set from
the committed JSONs (all correct), confirmed the pre-fix runs re-score identically, and mutated
`prompt.ts` to prove the scan goes red against the real file. It then found **doors seven and
eight** — and door seven was a site round 1 had NAMED and this record had called FIXED.

FINDING · BLOCKER · `src/app/api/workspaces/[id]/compose/route.ts:159` — the compose clip caption
still interpolated `clip.meta.title` raw into a text part sent beside the image. It never called
`snipCaption`, so the fix that cited this exact line:col left it open, and this record's round-1
entry claiming otherwise was FALSE for two rounds.
FIXED — and the mechanism moved a tier rather than the site: `askModel`'s `captions` now takes
`FenceSafe`, a type only `fencePart`/`fenceSafeLine` produce, so a route cannot pass a raw string in
any file whether the scan names it or not. Mutation-verified: reverting the route to the raw caption
fails `tsc`.
RECURRENCE: no
The law was `ENFORCED test` and a site named in a review survived the fix citing it, so the tier had
to go up, not sideways. It now declares **impossible** for the caption channel and **test** for the
builders. That is ADR-0002's requirement met in the commit that hit the recurrence.

FINDING · WARNING · `src/app/api/workspaces/[id]/intake/route.ts:185` — door eight: a client-supplied
turn concatenated onto a system prompt with no sanitiser, the same value `selectSources.ts` was fixed
to defang a hundred lines below.
FIXED — `defang(text)`, and the three workspace ROUTES joined the scan, read at their `askModel`
arguments rather than whole (scanning a route whole flagged two `console.warn` lines, and answering
those with allowlist entries reading "it is a log line" is how an allowlist rots).
RECURRENCE: no

FINDING · WARNING · `.claude/rules/app.md` — the ENFORCED line named `chat/attachments.ts` and
`chat2/` as what the scan does not reach and said nothing about prompts built inline in routes,
which is where both live doors were: a scoped law overstating its own closure.
FIXED — the declaration now names both tiers and what the scan does not cover.
RECURRENCE: no

FINDING · WARNING · `PROGRESS.md` / `docs/eval/retrieval-eval-set.md` / the ticket — "1149/1149" was
the count at an earlier commit, and "four harness bugs" survived in two documents after `gate.md`
was rewritten to say six. Hand-carried counts, twice.
FIXED — 1153/1153 from a run of this tree, and six everywhere.
RECURRENCE: no
It repeats M1's own bullet ("a count restated from another document — wrong every time it was
hand-carried"), which is a meta-law with no `LAW ·` entry and so cannot be named in this grammar.
The mechanism worth having is a ship-gate check that a PROGRESS entry's battery count matches the
battery's own output; it is NOT taken here, and is left as a named suggestion rather than a silent
omission.

FINDING · NIT · `gate.md` — "removed at `9df3456`"; it was `af9ac65`.
FIXED
RECURRENCE: no

FINDING · NIT · `promptInjectionDiscipline.test.ts` — the `lines.join` ALLOWED entry is a substring
match whose claim is true today and unpinned tomorrow. Round 3 checked the other ten entries line by
line against the three builders and found every one holds.
NOT FIXED — recorded deliberately. Every ALLOWED entry is a substring match; that is the shape of the
mechanism, and narrowing this one entry while ten others share the shape would suggest a precision
the list does not have. The entries are claims a reader must re-check, which is what the comment
above them says.
RECURRENCE: no

## Round 5 — ticket 09b, the `@` company mention

Two passes, cold context each: `37704cc` (four findings, all fixed in `48bcfa8`) and `48bcfa8`
itself (three more). The reviewer verified `tsc` clean and the battery green at each pass, and
checked the `companyId` path itself: UUID-shape-checked, read through the USER's RLS client on
`companies` (shared corpus, `FOR SELECT TO authenticated`), only `tase_issuer_id` taken from the
row, nothing about the issuer trusted from the body. `MentionDropdown`'s new `onRowsChange` is
optional and `ChatView` does not pass it, so its existing caller is unaffected.

REVIEWED: 48bcfa8

VERDICT: CHANGES

### Pass A — at `37704cc`, all four FIXED in `48bcfa8`

FINDING · BLOCKER · src/app/api/workspaces/[id]/intake/route.ts:272 · With a pin, a filter model that returned nothing parseable was reported nowhere at all — the year window silently defaulted and the requested kinds were dropped, so "@בז\"א the 2019 annual report" got a confident answer built from 2025–2026 filings with no notice on screen, because `settled` is a fact about the COMPANY being used to suppress a signal that also carries the REQUEST clause.
RECURRENCE: yes → Degradation must be VISIBLE

FINDING · WARNING · src/components/workspace/WorkspaceIntake.tsx:178 · The `mentionRows > 0` guard sat in `send()`, which is also the click path, so tapping the send arrow while the picker was showing rows did nothing at all — no send, no state change, no feedback.
RECURRENCE: no

FINDING · WARNING · docs/evidence/feat-smart-layer-b3-workspace-chat/verify-app.md:84 · The state table enumerated the picker and chip but not the thing the commit changed server-side — which notice the panel shows — and row 10 was flipped to DRIVEN in the same commit that changed that decision.
RECURRENCE: yes → Anything that decides what a screen SAYS gets every one of its states driven in a browser

FINDING · NIT · src/lib/workspace/intake/companyPin.ts:79 · A pinned row with an empty name left as `unknownCompany: ''`, which the component read as "no unknown company", so the pinned-but-unreachable company was silently dropped.
RECURRENCE: yes → Degradation must be VISIBLE

### Pass B — new at `48bcfa8`, all three FIXED in this round's follow-up

FINDING · WARNING · src/lib/i18n/dictionaries/he.ts:106 · The new `intakeUnknownCompany` copy ("אפשר לבחור אותה מהרשימה עם @") is true for a typed name that did not resolve and FALSE for the other cause routed into the same state — a company the analyst DID pick with `@` that has no `tase_issuer_id` — where it answers a dead end by advising the action that just failed.
RECURRENCE: yes → Degradation must be VISIBLE

FINDING · WARNING · ARCHITECTURE.md:347 · The header claimed "1153 tests across 107 files" while the branch registers 109 and the battery measures 1168, and the same commit edited that table without regenerating the pair — so `ship:gate` refuses the merge on it, and on PROGRESS.md's "1153/1153".
RECURRENCE: no

FINDING · NIT · src/components/ds/PillComposer.tsx:93 · The comment still said "today's callers take no argument", which the same diff made untrue.
RECURRENCE: no

### What the three `RECURRENCE: yes` answers bought

ADR-0002: a recurrence must buy a stronger mechanism in the same commit, not a restatement.

- **Degradation must be VISIBLE** (three of them). The tier bought is `intake/notice.ts` — WHICH of
  the five caveats a panel shows is now one pure function of the server's facts, swept by
  `notice.test.ts`, rather than a nested ternary in the component. Folded into that law's existing
  "decide it in ONE function" VERIFY line rather than opening a sixth tier that would restate it.
  **The limit is declared with it**, because pass B is precisely the hole the tier does not close:
  the STATE can be chosen correctly and its COPY still be false of the cause that produced it. Split
  the state; rewording is how two dead ends merge back into one sentence.
- **Every state driven in a browser.** Stays ritual — no battery sees whether a human looked — but
  `/verify-app` step 8b now says that a state a browser CANNOT reach is enumerated too: marked
  not-driven, with why it cannot be forced and which test holds it. That clause lives in the skill,
  not in `app.md`, because it is procedure; the law keeps one pointer to it. 09b's own table is the
  worked example, and driving it found the earlier table's own guess to be wrong — the
  pinned-unreachable state IS reachable, because exactly one live company (תמיס) has no issuer id.

### Still owed before merge

**No round has yet read the tip.** This record's `REVIEWED:` is `48bcfa8`; the pass-B fixes, the law
edit and the budget raise land after it. A round 6 must read the tip and set this pair to APPROVED —
`npm run ship:gate` refuses the merge until it does, and it is right to.
