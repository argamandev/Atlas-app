# Cold review record — ticket 08b (B2, Ask Atlas surfaces)

Branch: `feat/smart-layer-b2b-ask-atlas-surfaces`. Reviewer: `atlas-reviewer`, fresh context, two
rounds. Both rounds were told the scope narrowing is founder-approved, so "the old route still
exists" is not a finding on this branch.

## Round 1 — VERDICT: CHANGES (1 BLOCKER, 6 WARNINGs, 2 NITs)

Checked and found sound, so not listed: the `Grounding` union's refuse-don't-downgrade behaviour;
the `grounding` event being genuinely non-terminal; the injected call fenced with label and body
both defanged; `asTranscriptId`'s stated reasoning verified true (the `call` scope summary is a
constant, so no transcript id reaches the system prompt); the consumption guard re-mutated
independently (`ORIG {transcriptId:true} → MUT {transcriptId:false}`).

**FINDING · BLOCKER · `ChatView.tsx` · `callTruncated` is session-only, so after a reload an answer
written from part of a call renders as an ordinary whole answer.** The stated reason ("nothing
re-derives it, and inventing it would be worse than silence") was false: the server MEASURED it and
said so on its `grounding` event, so persisting it records a measurement. The `messages` jsonb
already carries `truncated` and `projectContext` for exactly this, at no migration cost.
RECURRENCE: yes → *Degradation must be VISIBLE.*
→ Fixed: `ChatMsg.callTruncated`, `sanitizeCallTruncated`, written on both persist paths, read in
`openConversation`. Verified by reopening the thread after a full page load.

**FINDING · WARNING · `TranscriptChatPanel.tsx` · the v2 branch recorded `e.source` and discarded
`e.state`**, so a truncated call would render identically to a whole one. Unreachable today, but
the prop takes the whole union. RECURRENCE: yes → *Degradation must be VISIBLE.* → Fixed.

**FINDING · WARNING · `TranscriptChatPanel.tsx` · `liveContext` silently dropped in the v2 branch**
— the one input the prop's own docstring predicts will be lost was the one the refusal guard
omitted. RECURRENCE: yes → *Degradation must be VISIBLE.* → Fixed: it joins the guard.

**FINDING · WARNING · `callInjection.ts` · a call whose first line busts the budget produced
"(this call has no transcribed lines yet)" while `truncated` was true**, so the prompt and the
surface said contradictory things about a call that does have lines. RECURRENCE: yes →
*Degradation must be VISIBLE.* → Fixed: three states, plus a test.

**FINDING · WARNING · evidence · the `truncated` state was driven in neither locale** and its
absence was not listed under "what was NOT rendered", so it read as coverage. RECURRENCE: yes →
*Anything that decides what a screen SAYS gets every one of its states driven in a browser, in both
locales.* → Fixed: driven in both locales by temporarily lowering the budget (no corpus call is
long enough), reverted, and the reload case driven too.

**FINDING · WARNING · `TranscriptChatPanel.tsx` · the error-beside-the-answer rewrite changes the
OLD branch too** — the live and multiview hosts the evidence said were not re-driven. RECURRENCE:
yes → same law as above. → Fixed: re-driven on `/app/live/PyuMxe88e8g` in Hebrew.

**FINDING · WARNING · evidence · neither cost line was measured**, on the branch that introduces
the stuffing. RECURRENCE: no. → Fixed: `--call` added to the measurement script; three turns
priced; and the reviewer's related observation — that the call is re-injected on EVERY turn, not
only the first — is raised in the evidence as a founder decision rather than quietly resolved.

**NITs:** `source` narrowed to `null` by closure assignment; evidence carried a stale test count.
Both fixed.

## Round 2 — VERDICT: CHANGES (1 WARNING, 3 NITs)

Round 2 independently confirmed the persist round-trip end to end, that removing `server-only`
opens no client-bundle path (`loop.ts` is the only importer, reached only from the route), that
`CALL_BUDGET_CHARS` is back at `60_000` and pinned from both sides by its own test, and that the
two-flag arg parser is correct.

**FINDING · WARNING · `messageState.ts` · the BLOCKER fix shipped with zero test coverage** while
its identical sibling `sanitizeTruncated` has five cases — so the fix was held by prose and one
manual reload. RECURRENCE: yes → *Degradation must be VISIBLE.* → Fixed: four cases in
`messageFlags.test.ts`, including one pinning that the two flags stay INDEPENDENT, so
`truncatedForPersist` can never learn to read the call flag and label a complete answer cut off.
Prose tier → test tier, which is the ADR-0002 move.

**NIT · `measure-chat-answer.mjs` · `--call` with no value fell through to an unscoped run** judged
against the wrong budget. → Refused now.

**NIT · the call scope-summary string was duplicated** between the route and the script, kept in
step by a comment. → One exported `CALL_SCOPE_SUMMARY`.

**NIT · `ChatView`'s `source` was still a closure-assigned `let`** — the shape the same commit had
just fixed in the panel. → Made consistent, and the chip path re-driven afterwards.

## Recurrence answer

Six findings carried `RECURRENCE: yes`, all against the same law — *degradation must be VISIBLE* —
and all of the same shape: a fact the server measured, dropped somewhere between the wire and the
screen. The mechanism bought this round is the test tier on the stored honesty flags
(`messageFlags.test.ts` now covers both, and asserts their independence), which is where the
BLOCKER lived. The remaining instances are surface-render decisions, whose natural tier is the
review-time ritual gate ADR-0002 describes and which does not exist yet — stated here rather than
claimed as closed.
