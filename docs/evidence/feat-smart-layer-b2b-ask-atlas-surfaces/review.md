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
RECURRENCE: no
WHY NOT: deliberate, not convenient. The law is about what MERGES; nothing merged. The shortfall
was in a draft evidence file, caught by the cold review that exists to catch it, working as designed. Answering "yes" would claim a defect reached the
product when it did not, which is the same overclaim in the other direction (M2).
FIX: driven in both locales by temporarily lowering the budget (no corpus call is long enough),
then reverted; the reload case driven too.

FINDING · WARNING · src/components/live/TranscriptChatPanel.tsx:246 · the error-beside-the-answer
rewrite changes the OLD branch too — the live-captions and multiview hosts the evidence states were
"unchanged and were not re-driven". A correct change, verified on neither surface it lands on.
RECURRENCE: no
WHY NOT: same as the finding above — a draft evidence file, corrected before merge by the review
step the law depends on.
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

Five findings carry `RECURRENCE: yes`, all naming *Degradation must be VISIBLE*, and all of one
shape: a fact the server measured, dropped somewhere between the wire and the screen. **The
mechanism bought is a fourth tier on that law** — an honesty fact is PERSISTED with the message,
never held in view state, and `chat/messageFlags.test.ts` now covers each stored flag and asserts
they stay INDEPENDENT. That is exactly where the BLOCKER lived and exactly where prose had been
carrying it: prose tier → test tier, in this commit, per ADR-0002.

**Two findings were answered `no` on purpose, and it is worth saying why rather than letting the
count speak.** The two browser-verification findings describe a DRAFT evidence file that claimed
coverage it did not have — caught by the cold review that exists to catch it, before anything
merged. The law they would have named is about what merges. Answering "yes" would have claimed a
defect reached the product, bought a mechanism for a failure that did not happen, and made the
recurrence signal itself less trustworthy — the same overclaim as a green test asserting a wrong
outcome (M2), pointing the other way.

## Round 3 — the verdict this branch merges on

REVIEWED: 0bdb196
VERDICT: APPROVED

Round 3 ran at the frozen tip `21d83b07`, verified every round-1 and round-2 fix in the diff rather
than taking the record's word for it, and re-checked the branch's own claims independently
(`parseGrounding` refuses rather than downgrades; `asTranscriptId` is a stated shape gate and the
consumption test derives its id list from the union; the `supabaseAdmin` call read is legitimate
shared-corpus per migration `20260801_014`; the panel's new error rendering reuses the shipped
`ErrorLine`/`<bdi>` shape, opening no new bidi surface). It raised one WARNING and one NIT; the NIT
was fixed in `0bdb196` and re-read at that tip, which is the sha recorded above.

FINDING · NIT · src/components/live/TranscriptChatPanel.tsx:213 · the v2 refusal guard throws an
untranslated English developer string into a Hebrew-first panel, where `ErrorLine` renders it in
the place a Hebrew answer belongs.
RECURRENCE: no
FIX: `dict.chat.groundingUnsupported`, in both locales, in `0bdb196`.

FINDING · WARNING · scripts/lib/env-manifest.mjs:227 · TOKEN_BUDGET is raised a third time in three
slices by the same comment that declared at raise two that app.md's shrink "has stopped being
optional", and the only thing now scheduling that shrink is a prose note in the constant.
RECURRENCE: no
NOT FIXED HERE, DELIBERATELY: the reviewer's own disposition, and the author agrees. The raise
itself was not avoidable — ADR-0002 required a stronger mechanism in the same commit as the
BLOCKER's fix, and the branch paid 89 of the 143 tokens before asking. What is unmechanised is the
SHRINK, which is its own mission: folding app.md's rewrite into 08b would be exactly the
separate-concern mixing this repo forbids elsewhere. Carried to the founder in the handoff and in
`PROGRESS.md` so the fourth raise is not the first time anyone counts.

## Round 4 — the re-review the ship gate demanded

REVIEWED: 936148c
VERDICT: APPROVED

Three docs-only commits landed after round 3's approval (the review record itself, the collision
entry, the two founder decisions), which correctly made the recorded approval stale at the gate —
"a stale approval is an assumed answer wearing a recorded one's clothes". Round 4 re-ran at the
ship tip, verified independently that the delta was `.md`-only (4 files, +36/-3, no source, config,
migration or script), and re-checked STATUS against its 60-line cap and the always-on token budget
(9,410 / 9,420 — ten tokens of headroom, which is a fact for the next slice, not a finding here).

FINDING · WARNING · COLLISIONS.md:65 · the 08b entry names four changed files but omits two shared
surfaces this branch also changed — `lib/chat2/protocol.ts` (the event union gains the non-terminal
`grounding` event and its parser branch) and `lib/chat/messageState.ts` (`sanitizeCallTruncated`) —
so a session holding edits to the module 08a's own entry declared as THE wire vocabulary is told it
need not rebase.
RECURRENCE: no
FIX: a correction line appended to `COLLISIONS.md` naming both, and saying which entry it corrects.
Appended rather than edited, because that log is append-only by construction.

FINDING · NIT · .scratch/smart-layer-build/issues/08-ask-atlas-surfaces.md:3 · the `Status:` header
still reads "SPLIT INTO 08a / 08b" while the body of the same file, STATUS.md and DECISIONS.md all
describe a three-way split with 08c open.
RECURRENCE: no
FIX: header now reads "SPLIT THREE WAYS: 08a done · 08b done · 08c OPEN", and the paragraph claiming
"only 08b can close it" — written before the split — now says 08c closes it.

FINDING · NIT · PROGRESS.md:1319 · the shipped-work entry advertises a "two-round review record" in
an evidence dir that carries more than two.
RECURRENCE: no
FIX: reads "four-round" — counted from this file, not from memory.

Confirmed at this round and worth recording, because all three were things I asked to be checked
rather than things I asserted: the DECISIONS entries quote the founder inside quotation marks with
the surrounding reasoning attributed to the session, and neither claims more than its quote
supports; the collision entries are genuine shared-type material and belong in that file; and
round 3's record does not overclaim — its two `RECURRENCE: no` answers match what landed.
