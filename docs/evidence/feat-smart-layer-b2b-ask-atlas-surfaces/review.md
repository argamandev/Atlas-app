# Cold review record — ticket 08b (B2, Ask Atlas surfaces)

Branch: `feat/smart-layer-b2b-ask-atlas-surfaces`. Reviewer: `atlas-reviewer`, fresh context, two
rounds. Both rounds were told the scope narrowing is founder-approved, so "the old route still
exists" is not a finding on this branch.

Checked and found sound across the two rounds, so not listed below: the `Grounding` union's
refuse-don't-downgrade behaviour; the `grounding` event being genuinely non-terminal (`isTerminal`
false, parser drops an unknown `state` rather than defaulting to `whole`); the injected call fenced
with label and body both defanged; `asTranscriptId`'s stated reasoning verified true (a `call`
scope summary is a constant, so no transcript id reaches the system prompt, unlike `companyId`);
the `requestScope` consumption guard re-mutated independently (`ORIG {transcriptId:true} → MUT
{transcriptId:false}`); the persist round-trip end to end; that removing `server-only` opens no
client-bundle path; that `CALL_BUDGET_CHARS` is back at `60_000` and pinned by its own test.

## Round 1 — VERDICT: CHANGES

FINDING · BLOCKER · src/components/chat/ChatView.tsx:97 · `callTruncated` is session-only, so after
a reload an answer written from part of a call renders as an ordinary whole answer. The stated
reason ("nothing re-derives it, and inventing it would be worse than silence") is false: the server
MEASURED it and said so on its `grounding` event, so persisting it records a measurement. The
`messages` jsonb already carries `truncated` and `projectContext` for exactly this, at no migration
cost.
RECURRENCE: yes → Degradation must be VISIBLE
FIX: `ChatMsg.callTruncated` + `sanitizeCallTruncated`, written on both persist paths, read in
`openConversation`. Verified by reopening the thread after a full page load — notice survived.

FINDING · WARNING · src/components/live/TranscriptChatPanel.tsx:213 · the v2 branch records
`e.source` and discards `e.state`, so a truncated call renders identically to a whole one.
Unreachable via today's single call site, but the prop takes the whole `Grounding` union.
RECURRENCE: yes → Degradation must be VISIBLE
FIX: the state is recorded and rendered.

FINDING · WARNING · src/components/live/TranscriptChatPanel.tsx:190 · `liveContext` is silently
dropped in the v2 branch, while `usedDoc`/`usedSnips` are refused on the stated principle — so the
one input the prop's own docstring predicts will be lost is the one the guard omits.
RECURRENCE: yes → Degradation must be VISIBLE
FIX: `liveContext` joins the refusal guard.

FINDING · WARNING · src/lib/chat2/callInjection.ts:125 · a call whose first line exceeds the whole
budget keeps nothing, so the prompt says "(this call has no transcribed lines yet)" while
`truncated` is true and the surface says "based on the first part of it" — two contradictory
statements about a call that does have lines.
RECURRENCE: yes → Degradation must be VISIBLE
FIX: a third branch ("none of this call's N lines fit"), plus a test.

FINDING · WARNING · docs/evidence/feat-smart-layer-b2b-ask-atlas-surfaces/verify-app.md:34 · the
`truncated` grounding state — the honesty state this slice exists to add — was driven in neither
locale and is not listed in the file's own "what was NOT rendered" section, so its absence reads as
coverage.
RECURRENCE: yes → Anything that decides what a screen SAYS gets every one of its states driven in a browser, in both locales, before it merges
FIX: driven in both locales by temporarily lowering the budget (no corpus call is long enough),
then reverted; the reload case driven too.

FINDING · WARNING · src/components/live/TranscriptChatPanel.tsx:246 · the error-beside-the-answer
rewrite changes the OLD branch too — the live-captions and multiview hosts the evidence states were
"unchanged and were not re-driven". A correct change, verified on neither surface it lands on.
RECURRENCE: yes → Anything that decides what a screen SAYS gets every one of its states driven in a browser, in both locales, before it merges
FIX: re-driven on `/app/live/PyuMxe88e8g` in Hebrew — answer, table and citation chip unchanged.

FINDING · WARNING · docs/evidence/feat-smart-layer-b2b-ask-atlas-surfaces/verify-app.md:83 · the
ticket's acceptance carries two cost lines and neither was measured, on the branch that introduces
the stuffing — and the call is re-injected on EVERY turn, not only the first, so "stuffed first
turn" understates what shipped.
RECURRENCE: no
FIX: `--call` added to the measurement script with a per-shape budget; three turns priced
($0.0164 / $0.0537 / $0.0805). The every-turn re-injection is raised in the evidence and the ticket
as a founder decision rather than quietly resolved — dropping it would answer turn 2 without the
call its chip still names.

FINDING · NIT · src/components/live/TranscriptChatPanel.tsx:205 · `source` is assigned only inside
the event closure, the exact pattern the `outcome` object three lines above exists to avoid.
RECURRENCE: no
FIX: moved onto `outcome` — and in round 2, in `ChatView` too.

FINDING · NIT · docs/evidence/feat-smart-layer-b2b-ask-atlas-surfaces/verify-app.md:85 · records
1020/1020 while the branch's claim is 1022; a count hand-carried between documents.
RECURRENCE: no
FIX: re-read from the run, with a note.

## Round 2 — VERDICT: CHANGES

FINDING · WARNING · src/lib/chat/messageState.ts:51 · `sanitizeCallTruncated` and the whole
persisted-`callTruncated` path ship with zero test coverage while the identical sibling
`sanitizeTruncated` has five cases in `messageFlags.test.ts` — so the fix for round 1's BLOCKER is
held by prose and one manual reload.
RECURRENCE: yes → Degradation must be VISIBLE
FIX: four cases added to `messageFlags.test.ts`, including one pinning that the two flags stay
INDEPENDENT, so `truncatedForPersist` can never learn to read the call flag and label a complete
answer cut off. Prose tier → test tier.

FINDING · NIT · scripts/measure-chat-answer.mjs:57 · `--call` with no value silently falls through
to an unscoped run judged against the $0.06 answer budget, where `--company`+`--call` together is
explicitly refused two lines below.
RECURRENCE: no
FIX: a flag with no value is refused.

FINDING · NIT · scripts/measure-chat-answer.mjs:120 · the call `scopeSummary` sentence is
duplicated verbatim from the route and kept in step only by a comment saying it must be.
RECURRENCE: no
FIX: one exported `CALL_SCOPE_SUMMARY`, imported by both.

FINDING · NIT · src/components/chat/ChatView.tsx:333 · `source` is still a closure-assigned `let`
here — the shape this same commit moved into `outcome` in the panel, leaving the two surfaces
inconsistent.
RECURRENCE: no
FIX: made consistent; the citation-chip path re-driven afterwards.

## Recurrence, answered once for the pattern

Six findings carried `RECURRENCE: yes` and five of those name the same law — *degradation must be
VISIBLE* — all of one shape: a fact the server measured, dropped somewhere between the wire and the
screen. The mechanism bought this round is the **test tier on the stored honesty flags**
(`messageFlags.test.ts` now covers both flags and asserts their independence), which is exactly
where the BLOCKER lived and where prose had been carrying it. The remaining instances are
surface-render decisions whose natural tier is the review-time ritual gate ADR-0002 describes and
which does not exist yet — stated here rather than claimed as closed.
