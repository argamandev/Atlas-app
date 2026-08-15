# Cold review — 08c-1, project grounding on `/api/chat/v2`

Branch `feat/smart-layer-b2c-project-grounding`. Three reviewers on the same diff
(`git diff main...HEAD`): the repo's `atlas-reviewer` (cold context, verdict-bearing) plus a
Standards axis and a Spec axis, run in parallel.

**Two `atlas-reviewer` rounds. Round 1 returned CHANGES on six findings; round 2, at the fix tip,
returned CHANGES on five more. The record below is ROUND 3's — every finding from both earlier
rounds, with its fix and its recurrence answer.** The earlier rounds' verdicts are deliberately not
reproduced as `VERDICT:` lines: the gate reads the FIRST one, and a superseded CHANGES sitting
above the current verdict is how a record ends up describing code that no longer exists.

Cleared by the reviewer and not re-litigated here: the `TurnScope` design (a project is not a fifth
`Grounding` recipe) and that it is tested where a regression would show; the
`failed`-does-not-end-the-turn asymmetry; RLS through the caller's own client; the cache-stable
prefix claim; `PROJECT_CONTEXT_STATES`; `ProjectForInjection` as an alias; the `--project`
measurement harness's use of `supabaseAdmin` (`scripts/`, read-only, through the existing
`loadProject` seam, and what is priced is invariant to which client read the row); and the cost
attribution, where the company-only control at $0.1010 is the load-bearing measurement.

**Arbitrated.** A Standards-axis finding claimed `requestScope.test.ts` opts `projectId` out of the
accepted-⇒-consumed scan. `atlas-reviewer` confirmed it does not: the `void projectId` is inside the
separate *"at most ONE GROUNDING id"* case, where excluding a non-grounding is the point, while the
scan itself builds `everyTurn` with the project set on all four recipes. Mutation-tested — removing
every `scope.projectId` read from `loop.ts` fails it. **Not accepted, with evidence.**

```
REVIEWED: PENDING-ROUND-3
VERDICT: PENDING
FINDING · WARNING · src/lib/chat2/loop.ts:264 · `if (!scope.userDb) return null` made a route that forgot the client indistinguishable from "RLS says this project is not yours", so our own wiring bug rendered to the user as `failed`.
RECURRENCE: yes → Fix at the choke point, with the fact, and make the lie unrepresentable
FINDING · WARNING · src/lib/chat2/loop.ts:275 · the catch swallowed the load error and nothing logged it; the comment claimed "the query layer logs it" and that file does not log.
RECURRENCE: yes → A green signal proves only what it measured
FINDING · WARNING · src/lib/chat2/projectInjection.ts:44 · the header cited a `docs/open-findings.md` entry that did not exist, so the code documented a paper trail that was not there.
RECURRENCE: yes → A green signal proves only what it measured
FINDING · WARNING · src/components/chat/ChatView.tsx:500 · the catch settled the assistant message from `error`/`errorKind` alone, so a stream breaking after the server reported `projectContext:'failed'` rendered a partial answer with no notice and persisted none.
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · WARNING · src/lib/chat/messageFlags.test.ts:426 · the comment claimed a new honesty fact added elsewhere "fails the sweep below"; it does not — those cases guard against narrowing, not against a second writer.
RECURRENCE: yes → A green signal proves only what it measured
FINDING · WARNING · .claude/rules/app.md:186 · four findings were answered `RECURRENCE: yes` while no law's ENFORCED declaration changed on the branch, leaving ADR-0002's obligation unpaid and unnamed.
RECURRENCE: no
FINDING · WARNING · docs/evidence/feat-smart-layer-b2c-project-grounding/review.md:24 · every recurrence line was bold-wrapped, which `^RECURRENCE:` does not match, so the gate read six findings as having no answer at all.
RECURRENCE: no
FINDING · WARNING · docs/evidence/feat-smart-layer-b2c-project-grounding/review.md:17 · a second `REVIEWED:` line survived in the record and `parseReviewRecord` takes the first match, so staleness was measured against the pre-fix commit.
RECURRENCE: no
FINDING · WARNING · src/lib/chat2/protocol.ts:150 · the working tree did not typecheck when round 1 read it, so "tsc clean" described the committed tip only.
RECURRENCE: no
FINDING · NIT · docs/SMART-LAYER-SPEC.md:298 · the new blockquote was inserted between two rows of the budget table, orphaning the `Ingestion backfill` row into a second one-row table.
RECURRENCE: no
FINDING · NIT · src/lib/chat2/protocol.ts:87 · the `PROJECT_CONTEXT_STATES` doc block was inserted between `TERMINAL_EVENTS`' doc comment and its declaration, orphaning it; `requestScope.ts:168` did the same to `parseGrounding`.
RECURRENCE: no
```

## How each was fixed

1. **`userDb` proxy.** Now THROWS, naming the db.md law. The two causes can no longer reach the
   choke point as the same value — the mechanism is structural, so no new test tier is claimed.
2. **Silent swallow.** `console.error('[chat2/loop] project context load failed', …)` at the catch,
   and the comment rewritten to say the log is HERE and why: three causes collapse into one
   user-visible state, so without it the only one that is our own defect is invisible in
   production. Round 2 confirmed the log fires only on a genuine throw — an RLS-invisible project
   returns `null` and never reaches it, so it is not noise on the ordinary path.
3. **Missing open-finding.** The entry now exists in `docs/open-findings.md`, stating what is
   covered (instructions and memory are written to be obeyed, so fencing them would be wrong), what
   is not (a pasted note body at system level), why the exposure is bounded (the user is the
   principal), and why closing it is its own mission. Round 2 judged it substantive, not a
   placeholder.
   *Mechanism, since the reviewer asked for the call:* a grep tier is reachable for the NARROW case
   of a comment naming a doc path, and is worth writing at a second occurrence. The general case —
   "a comment must not assert behaviour in another file" — is **UNENFORCEABLE**, and is recorded as
   such rather than given a mechanism that would not hold.
4. **The second-writer hole.** `settledFacts()` in `lib/chat/messageState.ts` is now the ONE writer
   and both paths call it. Round 2 confirmed the hole is closed rather than relocated: `outcome` is
   a `const` initialised before the `try`, so the catch cannot spread undefined, and the catch sets
   `streaming: false`, which the notice's render guard requires.
5. **The overclaiming comment** (round 2 — and the finding that made the fix real). The cases
   guarded `settledFacts` against NARROWING only; the shape that caused the defect is a SECOND
   WRITER, which leaves the function intact and every such case green. The comment is corrected to
   say exactly that, **and the guard it described now exists**: a source scan asserting no
   `setLastAssistant` call in `ChatView` names an honesty field directly, plus a vacuity case
   asserting both sites really do spread `settledFacts`. Comments and JSX comments are blanked
   first — this file discusses those field names at length, and a plain search would report the
   rule as a violation of itself (app.md's "a grep hits prose" trap).
   **Mutation-proven both ways:** writing a fact directly into one settle call fails the scan;
   removing the failure path's spread — the original hole, exactly — fails the vacuity case.
6. **ADR-0002's unpaid obligation.** The "Degradation must be VISIBLE" law now declares the new
   mechanism: *"And ONE writer settles it… `settledFacts` is that writer; the same test scans
   `ChatView` so a fact added to one settle call and not the other fails."* Paid for inside the
   token budget by evicting a HISTORY sentence (why `impossible` was refused for the terminal-event
   split) to `docs/case-history/app.md#settled-facts`, where the full story of this defect now lives
   too. The always-on set ends at 9,406 against a 9,420 budget — the budget was NOT raised, because
   raising it is a founder decision and there was no case for one here.
7. **Record format** (7, 8): recurrence lines unbolded and at line start; exactly one `REVIEWED:`.
8. **Transient typecheck** (9): round 1 read the tree mid-edit. Clean at the reviewed tip, verified
   by the reviewer's own run.
9. **Table split and orphaned doc comments** (10, 11): blockquote moved below the table; both doc
   comments reunited with their declarations.

## Spec axis — APPROVE, both follow-ups closed

- **Cost was not measured**, though ticket 08's acceptance names a price. CLOSED: `--project` added
  to `scripts/measure-chat-answer.mjs` (composable with `--company`, unlike `--call`); three runs
  filed in `verify-app.md` including the control. Injection's own cost: **+$0.0216** on a
  near-maximal block.
- **`docs/open-findings.md` was not written to.** CLOSED — finding 3.
- **Scope creep: none found.** Live captions, `documentRef`/snips and `streamChat` untouched,
  matching the founder's "Project grounding only".

## Standards axis — additional, all addressed

- **Duplicated Code / Primitive Obsession**: the `'ok' | 'truncated' | 'failed'` triple existed
  three times and only the parser was consulted at runtime, so a fourth state would have been
  silently dropped. One `PROJECT_CONTEXT_STATES` const with the type derived from it and a shared
  membership test, the same shape the incomplete codes already use.
- **Middle Man / Shotgun Surgery**: `ProjectForInjection` was a field-for-field copy of
  `ProjectContextInput`; it is now an alias, so a new field cannot be added to one and forgotten in
  the other.
- **Data Clumps** (`outcome`'s co-travelling honesty fields): resolved by the `settledFacts`
  extraction.

## Final state

Battery **1058/1058** green, `tsc` clean, `env:health` 9,406/9,420 with 14 spare and the unenforced
count unchanged. Of the eleven findings, six were `RECURRENCE: yes`; four bought a structural change
(a throw, a single settle function, a source scan, a single state declaration), one bought a law
declaration, and one was answered `UNENFORCEABLE` with its reason stated.
