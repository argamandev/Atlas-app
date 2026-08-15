# Cold review — ticket 09 (B3 workspace chat)

Branch: `feat/smart-layer-b3-workspace-chat` · `atlas-reviewer` plus a two-axis (standards / spec)
pass, cold context each.

REVIEWED: e567d46

VERDICT: CHANGES

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
RECURRENCE: yes → M3 · Fix at the choke point, with the fact, and make the lie unrepresentable
The fix landed in the branch where the bug was noticed, which is the clause this law opens with.
The mechanism bought: `promptInjectionDiscipline.test.ts`, which fails for ANY interpolation in the
builders that reaches the model through no sanitiser. Its first version scoped to `input.` and would
have missed this exact hole — that is now its own mutation case.

FINDING · BLOCKER · `src/app/api/workspaces/[id]/chat/route.ts:95`, `…/compose/route.ts:159` —
the clip caption is built from `workspace_items.name` and handed to the model as a text part beside
the image, a second channel the prompt-builder fix never touched.
FIXED `ed225c3` — sanitised in `snipCaption` itself (the one door every caption passes through),
with a test asserting it stays one line. chat2's own `snipCaption` has carried this case since 08c-3.
RECURRENCE: yes → M3 · Fix at the choke point, with the fact, and make the lie unrepresentable
Same law again, one channel over.
Note the honest limit: the scan does NOT reach `src/lib/chat/attachments.ts`, so this specific door
is held by its unit test, not by the scan.

FINDING · BLOCKER · (standards axis) `prompt.ts` / `compose.ts` — `"""` is a second boundary
marker in the same prompts and only the fence was defanged. A passage containing a line of `"""`
closes its block and the rest reads as instruction.
FIXED `ed225c3` — `quoted()` owns those blocks and neutralises the delimiter inside.
RECURRENCE: yes → M3 · Fix at the choke point, with the fact, and make the lie unrepresentable
Third instance of one law on one branch, which is why the branch stopped
patching sites and bought the scan.

FINDING · BLOCKER · (spec axis) `scripts/retrieval-eval/workspace-gate.mjs` — arm E, the arm the
ticket DEFINES as the swap, embedded raw window text while arm R and production both embed a
deterministic metadata prefix. The verdict rested on it.
FIXED `288435c` — same prefix recipe production uses. **Worth three cases: E went 6/14 → 9/14.**
The headline changed from "the planner won" to "indistinguishable"; the ticket's gate is still unmet,
so the outcome did not change, but the stated reason was wrong and is now right.
RECURRENCE: yes → M2 · Never let a test certify an untrue premise
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
RECURRENCE: yes → M1 · A green signal proves only what it measured
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
