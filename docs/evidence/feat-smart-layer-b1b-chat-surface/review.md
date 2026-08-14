# Cold review record — ticket 07 / B1b (chat surface)

Branch `feat/smart-layer-b1b-chat-surface`. Reviewer: `atlas-reviewer` subagent, cold context, one
dispatch per round. Full narrative and the browser evidence are in `verify-app.md`; this file is the
tracked verdict list.

**Rounds: 4.** Every round found something real. The
recurring failure across all four was one thing, and it is worth naming at the top rather than
burying: **I repeatedly fixed the INSTANCE and claimed the CLASS**, twice writing the overclaim into
the evidence file as proof.

---

## Round 1 — VERDICT: CHANGES (2 BLOCKER, 2 WARNING, 2 NIT)

FINDING · BLOCKER · `src/components/chat/ChatView.tsx` · `transcriptId` was uuid-gated onto
`ChatScope` and read by no tool and no prompt, while `/app/chat?transcript=` rendered a chip naming
that call — the surface promising a grounding the backend had dropped.
**RECURRENCE: yes → "Degradation must be VISIBLE. Never render success UI for content the server
dropped."** Answered by moving the law off prose for this shape: `transcriptId` removed from
`clientScopeIds`/`ChatScope` so the state is unrepresentable, `useV2 = !projectId && !transcript`,
and a new battery guard in `requestScope.test.ts` that every accepted id is consumed. That guard
then failed twice more — see rounds 2 and 3.

FINDING · BLOCKER · `ChatView.tsx` · `searchModeHint` gated on `mode` rather than `shownMode`, so
after pinning a company the screen kept saying "No company was identified" beneath the `@company`
chip — the same contradiction fixed for the chips one JSX block above, in the same commit.
**RECURRENCE: yes → "Anything that decides what a screen SAYS gets every one of its states driven
in a browser, in both locales, before it merges."** Answered by renaming the raw state
`reportedMode`, so a render reaching for "what the server last reported" announces itself (M3.3),
and by driving the pinned/unpinned states in both locales.

FINDING · WARNING · `ChatView.tsx` · Under v2 `source` is permanently `null`, so `CitationChip`
never renders — the migrated chat lost its citation affordance and no document said so.
**RECURRENCE: no.** Accepted and stated rather than closed: nothing fabricates a chip, but the user
gets less than before. Owned by ticket 08, which has to put anchors on the wire; recorded in
`STATUS.md` and `verify-app.md`.

FINDING · WARNING · `src/lib/db/companies.ts` · Alias hits were prepended then `.slice(0, 20)`, so a
broad stem could evict the company whose name was typed exactly.
**RECURRENCE: no.** Ordering by which query found a row is a proxy for relevance (M3.2); replaced
with `matchRank` over every name including matched aliases, split to `lib/company/matchRank.ts` so
it is testable at all (8 tests, both directions).

FINDING · NIT · `ChatView.tsx` · The transcript chip rendered `${company} · ${quarter}` as one
un-isolated mixed Hebrew/Latin line.
**RECURRENCE: yes → the bidi law.** 8th recorded occurrence and a NEW SHAPE: the line was
PRE-JOINED upstream, so the renderer had no runs left to wrap and `git grep 'dir="ltr"'` — the
command the 5th occurrence left behind — cannot see it. Answered by fixing the CONSTRUCT
(`page.tsx` passes the parts separately), recording the occurrence and its addendum in
`docs/case-history/app.md`, folding the new rule into the law's own sentence, correcting the
always-on count 7 → 8, and filing four more rendered instances of the construct in
`docs/open-findings.md` rather than fixing surfaces this ticket does not own.

FINDING · NIT · `ChatView.tsx` · A prior turn that ended `incomplete` was replayed to the model as a
finished answer.
**RECURRENCE: no.** History now labels it. (Round 2 found this fix incomplete — see below.)

---

## Round 2 — VERDICT: CHANGES (1 BLOCKER, 3 WARNING)

Confirmed real and complete: the `reportedMode`/`shownMode` fix, the `useV2` gate across all three
ChatView call sites, the bidi construct fix, and `matchRank`.

FINDING · BLOCKER · `src/lib/chat2/requestScope.test.ts` · The round-1 mechanism counted
`toolDefs.ts` — which holds the `ChatScope` interface — as a consumer, so an id declared there and
read by nothing passed. The evidence file claimed the shape was mechanically closed.
**RECURRENCE: yes → M2 · Never let a test certify an untrue premise.** Answered by removing
`toolDefs.ts` from the list and re-proving with the reviewer's own injection. **This answer was
itself insufficient — see round 3.**

FINDING · WARNING · `ChatView.tsx` · The history label read `incomplete || truncated`, its own
two-field guess at a question `truncatedForPersist` answers from three; it missed
`errorKind: 'truncated'`, reachable on exactly the route `useV2` keeps alive.
**RECURRENCE: yes → M3.1 · Fix at the choke point.** Answered by routing through
`truncatedForPersist`.

FINDING · WARNING · `ChatView.tsx` · A server-resolved company whose name lookup failed left
`companyId` set and `companyName` null, so no chip, no unpin and no search chip rendered — the chat
silently scoped to a company the user could neither see nor undo.
**RECURRENCE: yes → "Degradation must be VISIBLE … never a fabricated fourth state."** Answered by
gating both controls on the scope rather than the name, with `pinnedUnknownCompany` copy in both
locales, and by DRIVING the state end to end (fail `/api/companies/<uuid>`, let the server resolve).

FINDING · NIT · `db/companies.ts` · `searchCompanies` also feeds `HomeSearch` and
`CompanyOverview`, which were not exercised.
**RECURRENCE: no.** Stated as a limit of the evidence rather than claimed verified.

---

## Round 3 — VERDICT: CHANGES (1 BLOCKER, 1 WARNING, 1 NIT)

All three were the same mistake in three places.

FINDING · BLOCKER · `requestScope.test.ts` · The guard still counted a bare TYPE DECLARATION as
consumption — declaring `callId` on `ModeFacts` in `mode.ts`, still a listed consumer, left it
green. Removing `toolDefs.ts` had fixed the instance, not the class, while the evidence claimed
"consumption now means the id is read where behaviour happens".
**RECURRENCE: yes → M2, for the second time on the same guard.** Answered one tier up, as the
reviewer suggested: the guard now requires a **value-position read** (`/\.\s*<id>\b/`), since a read
is always `scope.companyId` and a declaration is always `companyId?: string` with nothing before it.
Proved against BOTH prior defeats, not just the newest. Its strength is now stated at its real
level: it proves the id is read somewhere, NOT that the read changes an answer. **Round 4 then
proved even this answer wrong — see below.**

FINDING · WARNING · `ChatView.tsx` · The enclosing chip-row condition still keyed on `companyName`,
so on the old route a real scope with a missing name rendered no row and the round-2 inner fix never
ran.
**RECURRENCE: yes → same law as round 2's third finding.** Answered by leading the condition with
`companyId`, then dropping `companyName` from it entirely — it was redundant and was the only path
that could render an EMPTY row. Driven per state (blank → no row; transcript-only; company-scoped;
unnamed scope).

FINDING · NIT · `ChatView.tsx` · The persisted turn wrote `truncated: outcome.incomplete != null`
inline, one screen below where the identical inline guess had just been removed.
**RECURRENCE: yes → M3.1.** Answered by routing through `truncatedForPersist`, with equivalence
checked numerically across `undefined`, `null` and three real codes rather than assumed.

---

## Round 4 — VERDICT: CHANGES (1 BLOCKER, 1 WARNING, 1 NIT)

Cleared this round: the chip-row condition (no chip renders where it should not, no empty row
reachable), the truncatedForPersist equivalence at the persisted-turn site, and the
case-history/open-findings bookkeeping for the 8th bidi occurrence.

FINDING . BLOCKER . requestScope.test.ts . The value-position regex matched ANY object property of
that name, so tools.ts reading input.companyId (the model tool argument, an unrelated object) kept
the guard green with every real scope.companyId read deleted — vacuous for the one id the surface
actually sends.
RECURRENCE: yes -> M2, third time on this guard, and M3.2 (a proxy, not the fact). Answered by
matching the RECEIVING OBJECT too, and proved with the reviewers own experiment: deleting every
scope./facts. companyId read now fails the guard while input.companyId remains.

FINDING . WARNING . verify-app.md . The claim "a false alarm, never a false pass" was false when
written, and a false pass existed in the tree at that moment.
RECURRENCE: yes -> M1. Corrected in place in both the evidence file and the test header; the limit
is now stated as a limit rather than a guarantee.

FINDING . NIT . requestScope.test.ts . The missing-body deepEqual enumerated the accepted ids, so it
fired before the scope guard whenever a field was added and obscured which mechanism caught what.
RECURRENCE: no. Now asserts the property without naming the ids.

---

## The meta-answer this branch owes (ADR-0002)

Two laws were hit repeatedly and their tiers did not hold:

- **M2 (never let a test certify an untrue premise)** fired twice against the same guard I wrote to
  satisfy a different law. Both times the mechanism looked stronger than it was, and both times I
  wrote the overclaim into the evidence file. Both false sentences are marked corrected **in place**
  rather than deleted, because the record of a mechanism overclaiming is the thing that makes the
  next one honest.
- **"Anything that decides what a screen SAYS gets every state driven in a browser"** is declared
  `ENFORCED none`, natural tier "a ritual gate at review, which does not exist yet". This is now the
  **third consecutive branch** where a mode/notice state was found by looking rather than by a
  mechanism. **This is a founder call, not mine to take:** either the ritual gate gets stood up, or
  the law is marked `UNENFORCEABLE` with its reason. It must not be re-filed at prose a fourth time.
  Raised in the handoff rather than silently deferred.
