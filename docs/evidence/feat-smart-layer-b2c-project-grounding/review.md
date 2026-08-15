# Cold review — 08c-1, project grounding on `/api/chat/v2`

Branch `feat/smart-layer-b2c-project-grounding`. Three reviewers, run in parallel on the same diff
(`git diff main...HEAD`): the repo's `atlas-reviewer` (cold context, verdict-bearing) plus a
Standards axis and a Spec axis.

The reviewer explicitly cleared, and this record does not re-litigate: the `TurnScope` design (a
project is not a fifth `Grounding` recipe) and that it is tested at the layer a regression would
show; the `failed`-does-not-end-the-turn asymmetry; RLS through the caller's own client; the
cache-stable prefix claim; the accepted-⇒-consumed guard still being honest for `projectId`.

---

## Round 1 — `atlas-reviewer` at `1eef987`

```
REVIEWED: 1eef987
VERDICT: CHANGES
```

FINDING · WARNING · `src/lib/chat2/loop.ts:264` · `if (!scope.userDb) return null` made a route that
forgot the client indistinguishable from "RLS says this project is not yours", so our own wiring bug
rendered to the user as `failed`.
**RECURRENCE: yes → M3 · Fix at the choke point, with the FACT it is deciding on, never a proxy.**
FIXED: the missing client now THROWS with a message naming the db.md law, which routes it to the
catch and its log. The user-facing state stays `failed` because it honestly is.
*Mechanism:* the throw is the mechanism — the two causes can no longer reach the choke point as the
same value. No new test tier is bought, because the distinction is now structural rather than
checked.

FINDING · WARNING · `src/lib/chat2/loop.ts:275` · the catch swallowed the load error and NOTHING
logged it; the comment's justification "the query layer logs it" was false — `lib/db/projects.ts`
throws without logging, and neither `projectSource.ts` nor the route logs either.
**RECURRENCE: yes → M1 · A green signal proves only what it measured** (a claim about another
file's behaviour, restated rather than checked).
FIXED: `console.error('[chat2/loop] project context load failed', …)` at the catch, and the comment
rewritten to say the log is HERE and why — the three causes collapse into one user-visible state,
so without it the only one that is our own defect would be invisible in production.

FINDING · WARNING · `src/lib/chat2/projectInjection.ts:44` · the header claimed the unfenced
project-SOURCE exposure was "Filed in `docs/open-findings.md`", and no such entry existed — the code
documented a paper trail that was not there.
**RECURRENCE: yes → M1.**
FIXED: the entry is now actually in `docs/open-findings.md`, stating what is covered (instructions
and memory are meant to be obeyed, so fencing them is wrong), what is not (a pasted note body), why
the exposure is bounded (the user is the principal), and why closing it is its own mission (it would
change `buildProjectContext`, the old route and the capacity meter together).
*Mechanism, and an honest split — the reviewer asked for a call and this is it:* for the NARROW case
of a comment naming a doc path, a grep tier is reachable and is worth writing when a second instance
appears; for the general case "a comment must not assert behaviour in another file", this is
**UNENFORCEABLE** — no scan can read a claim in prose and check it against another file's meaning.
Not promoted to a law on one occurrence; recorded here so a second occurrence is recurrence against
something.

FINDING · WARNING · `src/lib/chat2/protocol.ts:150` · the working tree did not typecheck, so the
reported "tsc clean / 1052 green" described `1eef987` only.
**RECURRENCE: no.** Transient: the reviewer read the tree mid-edit while round-1 fixes were being
applied. The tree typechecks and the battery is green at the reviewed tip below.

FINDING · NIT · `docs/SMART-LAYER-SPEC.md:298` · the new blockquote was inserted between two rows of
the budget table, orphaning the `Ingestion backfill` row into a second one-row table.
**RECURRENCE: no.** FIXED: blockquote moved below the table. (Also caught independently by the
Standards axis, which named it as M1 — the edit measured the wording, not the render.)

FINDING · WARNING · `src/components/chat/ChatView.tsx:500` · when the stream breaks mid-answer the
catch set only `error`/`errorKind`, so a turn that had ALREADY reported `projectContext:'failed'`
rendered its partial answer with no notice and persisted none. The same gap existed for
`callTruncated` and `source`.
**RECURRENCE: yes → Degradation must be VISIBLE (never render success UI for content the server
dropped).**
FIXED, and this is the one that bought a real mechanism, per ADR-0002. The defect was two writers
settling the same message, one of which built its own object. There is now ONE — `settledFacts()` in
`lib/chat/messageState.ts` — and both paths call it.
*Mechanism:* `chat/messageFlags.test.ts` gains four cases, including one that asserts the failure
path carries exactly what the success path carries, and one that guards the guard by pinning the key
set so narrowing the function fails rather than passing more quietly. **Mutation-tested:** deleting
`projectContext` from `settledFacts` fails 3 cases. The reviewer's related question — whether
settled-message-only scope is acceptable — is now moot for these fields, because the failure path
carries them.

## Standards axis — additional, all addressed

- **Duplicated Code / Primitive Obsession**: the `'ok' | 'truncated' | 'failed'` triple existed
  three times (builder type, event literal, parser cascade) and only the parser is consulted at
  runtime — a fourth state would have been silently dropped. FIXED: one `PROJECT_CONTEXT_STATES`
  const in `protocol.ts` with the type derived from it and an `isProjectContextState` membership
  test, the same "one declaration" shape the incomplete codes already use.
- **Middle Man / Shotgun Surgery**: `ProjectForInjection` was a field-for-field copy of
  `ProjectContextInput`, and `buildProjectBlock` re-mapped between them. FIXED: it is now an alias,
  so a new field cannot be added to one and forgotten in the other.
- **Data Clumps** (`outcome`'s five co-travelling honesty fields in `ChatView`): resolved as a side
  effect of the `settledFacts` extraction above.
- One Standards finding is **NOT ACCEPTED**: that `requestScope.test.ts` opts `projectId` out of the
  accepted-⇒-consumed scan. It does not. The `void projectId` the reviewer quoted is in a different
  case — *"one recipe puts at most ONE GROUNDING id"* — where excluding the project is the whole
  point, since a project is not one of the mutually-exclusive alternatives being counted. The scan
  itself sweeps `projectId`, and that was **mutation-tested**: removing every `scope.projectId` read
  from `loop.ts` fails it with the intended message. The `atlas-reviewer` independently confirmed
  the guard is honest for the field.

## Spec axis — APPROVE with two follow-ups, both closed

- **Cost was not measured.** Ticket 08's acceptance names a price and the evidence file had none.
  CLOSED: `--project` added to `scripts/measure-chat-answer.mjs`; three runs filed in
  `verify-app.md`, including the CONTROL that attributes the $0.06 breach to ticket 07's existing
  red rather than to this branch. Project injection's own cost: **+$0.0216** on a near-maximal block.
- **`docs/open-findings.md` was not written to.** CLOSED — see round-1 finding 3.
- **Scope creep: none found.** Live captions, `documentRef`/snips and `streamChat` untouched,
  matching the founder's "Project grounding only".

---

## Round 2 — after the fixes

Battery **1056/1056** green, `tsc` clean, `env:health` within budget. Every round-1 finding is
answered above with a fix and a recurrence line; three of the four `RECURRENCE: yes` findings bought
a structural change (a throw, a single settle function, a single state declaration) rather than a
comment.
