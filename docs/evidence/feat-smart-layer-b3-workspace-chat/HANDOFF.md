# Ticket 09 — handoff to the next session

Branch: `feat/smart-layer-b3-workspace-chat`, **not merged**. Written 2026-08-15 at the founder's
instruction: *"There are problems with the workspace chat. finish this, and i will continue working
on ticket 09 on a seperate session (with the right context)."*

## ⚠ START HERE: the founder found problems in workspace chat, and they are NOT described

He tested `localhost:3000` on this branch and reported problems, without saying which. **Nothing in
this repo records what they were — ask him before reading anything else in this file.** Do not assume
they match any finding below; four review rounds all looked at the code, and a person clicking is a
different instrument.

Two things to know while asking:

- **This branch changed almost nothing a user can see.** The gate said don't swap the retrieval, so
  workspace chat's behaviour is unchanged by design. What changed is what gets sent to the MODEL —
  sanitising of titles, captions, conversation turns and the intake prompt. So a visible problem is
  most likely either (a) pre-existing and simply noticed now, or (b) a sanitiser mangling text that
  reaches the model and degrading an answer. `fencePart` replaces `>>>` with `»` and collapses
  newlines — if a title or answer looks wrong, that is the first suspect.
- **Two surfaces were changed WITHOUT a browser drive**, both named in `verify-app.md` rows 10–11:
  intake (asking Atlas to fetch a file) and compose-with-a-clip. If his problem is in either, it is
  in the gap this branch declared rather than something unforeseen.

## What landed, and what it is worth

**The gate ran and the swap did not clear the bar** — planner 12/8/8 vs swap 11/9/8 at shelf sizes
3/6/12, trading the lead by one case each way. Workspace chat left alone, which the ticket names in
advance as COMPLETED. Ticket 10 is not blocked. Full reasoning, including six harness bugs found
along the way: `gate.md`. The standing harness is `scripts/retrieval-eval/workspace-gate.mjs`.

**Eight prompt-injection doors closed**, held by a `FenceSafe` type (impossible tier, for the
workspace caption channel) and `promptInjectionDiscipline.test.ts` (test tier, for the builders and
routes). The law is filed in `app.md`; its story is in `docs/case-history/app.md#prompt-boundaries`.

## Open, in the order I would take them

1. **Whatever the founder saw.** Ask first.
2. **Round 4's unfixed WARNING — the route scan is evadable.** It reads a route only at its
   `askModel` arguments, so `const p = SYSTEM + \`${text}\`; askModel(p)` passes green; and its
   "a model call was found" guard is satisfied by the function DECLARATION in `intake/route.ts:553`.
   Both halves are one fix: resolve a bare-identifier prompt argument back to its assignment, and
   exclude `function`/`async function` from the call match. Noted in the law's ENFORCED line so it is
   not a silent overstatement. **This is the third time the mechanism was scoped narrower than the
   defect — door six WAS the scan — so treat "widen the scan" as suspect and consider whether the
   type tier can cover it instead.**
3. **Round 4's NIT — `fenceSafeLine` brands its LITERALS**, so a future caption template containing
   a newline or `>>>` produces a value the type calls safe. A runtime assertion on the assembled
   line would close it.
4. **`lib/transcription.ts:363`** interpolates raw transcript text and a company name into a Gemini
   prompt with no sanitiser. Outside this feature and outside this branch's scope; now named in the
   law's limits so nobody reads the corpus as covered.
5. **The review record must reach `VERDICT: APPROVED` before merge.** Round 4 read `895511d` and
   returned CHANGES; its BLOCKER (unresolvable `RECURRENCE: yes` lines) and its stale-count warnings
   are fixed, but **no round has yet reviewed the tip.** Run `atlas-reviewer` again, then set the
   header. `npm run ship:gate` will refuse the merge until then, and it is right to.

## Things that would be easy to get wrong

- **STATUS.md / the always-on set is at 9,947 of 9,950 tokens.** Three spare. Any law or status edit
  needs something removed first. The budget was raised twice on this branch (9,680 → 9,950), reasons
  declared in `scripts/lib/env-manifest.mjs`. **The app.md shrink is six slices overdue** and will
  not happen as a side effect of another ticket.
- **Every `RECURRENCE: no` in `review.md` is a grammar artifact, not a claim that nothing recurred.**
  The file explains why in its own section — read it before concluding this branch was uneventful.
- **The dev server may still be running on :3000** from the founder's test.
