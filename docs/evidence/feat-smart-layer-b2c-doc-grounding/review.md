# Cold review record — ticket 08c-3 (`feat/smart-layer-b2c-doc-grounding`)

Five rounds, `atlas-reviewer`, cold context each time. Full narrative and the states each round
added are in `verify-app.md`; this file is the tracked verdict record the ship gate reads.

**The shape of this review is itself the finding.** Rounds 1, 2 and 3 each returned a BLOCKER, and
in every case the PREVIOUS round's fix had caused it — twice in the sibling branch of the same
`if`. Four successive "better conditions" each shipped the next defect. Round 4 was the first with
no blocker, and it came after the fix stopped being a condition and became a swept pure function.

---

## Round 1 — VERDICT: CHANGES (at `59df709`)

```
FINDING · BLOCKER · src/lib/chat2/loop.ts · Pages PARTLY readable reported `ok`: the state was
decided with `some()`, so a marked passage spanning a text page and a scanned one answered from a
strict SUBSET of the pages the reference block names, with nothing saying so.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped
FINDING · WARNING · src/components/live/LiveBroadcastView.tsx · The live panel's comment still
described the route this branch deletes.
RECURRENCE: no
FINDING · WARNING · src/app/api/chat/route.ts · Deleting the route also deleted the chat stack's
only model-availability fallback (Gemini → GPT-4.1) and nothing recorded the loss.
RECURRENCE: no
FINDING · WARNING · docs/evidence/…/verify-app.md · A mixed Hebrew/Latin line in model answer prose
filed as "an observation" and deferred.
RECURRENCE: yes → A line mixing Hebrew and Latin gets a `<bdi>` per run — **DISPUTED, see below**
FINDING · NIT · src/lib/chat2/documentInjection.ts · `DocumentBlock.pages` documented as "carried"
while the no-text branch returned every REQUESTED page, and nothing read the field.
RECURRENCE: no
FINDING · NIT · src/components/live/TranscriptChatPanel.tsx · Optional chaining on a prop this diff
made required.
RECURRENCE: no
```

**The bidi recurrence was disputed and the dispute stands** (round 2 judged it "correct on its
merits"). All eight occurrences of that law are lines **we** compose from data; this was model prose
inside `Markdown`, which no `<bdi>`-per-run rule reaches without a segmenter. Filing it as a
recurrence would move a mechanism onto a surface it cannot see. Mitigated at the only available
lever — `NO_PAGE_TEXT` asks for the user's language and says not to repeat the note — and named in
the code as a **mitigation, not a mechanism**. Recorded in `docs/open-findings.md` so the argument
survives the branch, not just its conclusion.

## Round 2 — VERDICT: CHANGES (at `5ec4f80`)

```
FINDING · BLOCKER · src/lib/chat2/loop.ts · Round 1's fix measured against `pagesToLoad`'s union, so
a snip on a page with no text row reported "the report text could not be loaded" on the exact turn
the IMAGE grounding had worked; a snip beside a readable marked page reported "too long" for a page
that was never long — a case that had been `ok` before round 1.
RECURRENCE: yes → Degradation must be VISIBLE (two-CHANNEL clause, added this round)
FINDING · WARNING · docs/evidence/…/verify-app.md · The state table was stale after round 1.
RECURRENCE: yes → Anything that decides what a screen SAYS gets every state driven, both locales
FINDING · WARNING · docs/evidence/…/verify-app.md · The mixed-script finding lived only in branch
evidence, which is history; an open item that is not a law belongs in `docs/open-findings.md`.
RECURRENCE: no
FINDING · NIT · src/lib/chat2/loop.ts · A comment claimed M3.2 "the fact, not a proxy" for page
text, which is itself a proxy now that images carry the same content.
RECURRENCE: yes → M3.2
```

**Mechanism moved (ADR-0002):** the degradation law's fourth tier covered two BACKENDS; this was two
CHANNELS of one source. `.claude/rules/app.md` gained the channel clause; `TOKEN_BUDGET` 9,520 →
9,650, raise five, declared in `env-manifest.mjs`.

## Round 3 — VERDICT: CHANGES (at `09bb75f`)

```
FINDING · BLOCKER · src/lib/chat2/loop.ts · A snip-only turn whose page-text load THREW fell into
the unconditional `failed` branch — the sibling of the `if` every previous fix had edited — and
announced that report text nobody asked for was missing.
RECURRENCE: yes → Degradation must be VISIBLE (two-CHANNEL clause)
FINDING · WARNING · src/lib/chat2/loop.ts · `built.truncated` was a bare boolean over ALL loaded
pages, so a snipped page running long told the user their short marked passage was too long.
RECURRENCE: yes → Degradation must be VISIBLE (two-CHANNEL clause)
FINDING · WARNING · src/lib/chat2/loop.ts · `anySourceSurvived` read `documentBlockText !== ''`, but
the no-text block is non-empty (`NO_PAGE_TEXT`), so a turn reporting `failed` whose every tool also
failed suppressed `all_sources_failed` and ended `done`.
RECURRENCE: yes → M3.2 · give the choke point the FACT, never a proxy
FINDING · WARNING · .claude/rules/app.md · The new tier claimed the two lists were "split in the
TYPE, so the merge cannot return" — both are `number[]`; no such mechanism exists.
RECURRENCE: yes → a law declares the mechanism that ACTUALLY holds
FINDING · NIT ×3 · stale evidence paragraph, a comment pointing at deleted `turnRoute.ts`, the
ticket's own status line.
RECURRENCE: no
```

**The structural answer.** The decision left `loop.ts`'s branches for `documentContextState()`, a
pure function of four named facts, swept as a table. Mutation-verified: dropping the snip-only guard
fails 3 cases, weakening `markedCut` fails 5.

## Round 4 — VERDICT: CHANGES, **no BLOCKER** (at `8ae5487`)

The pattern broke. The reviewer's own mutations confirmed the new function holds.

```
FINDING · WARNING · src/lib/i18n/dictionaries/en.ts · `truncated` copy asserted "too long to read in
full", a cause the code never establishes — the state is also returned for an unreadable or missing
marked page, and naming length sends the user to re-mark a narrower passage that changes nothing.
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · WARNING · src/components/live/PdfViewer.tsx · A selection resolving to NO pages still sent
a `documentRef`, so the request claimed a grounding it did not carry.
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · NIT ×5 · a second stale "/api/chat is still alive" comment in ChatView; ARCHITECTURE's
test index naming a deleted test; evidence rows 16–17 understating their own coverage; the law tier
naming one of its two guards; `DocumentBlock.truncated` left in the public shape; a duplicated
case-history paragraph.
RECURRENCE: no
```

Both copies are cause-neutral now; the empty-page `documentRef` is no longer sent, and **no notice
was added** — the marked passage is composed verbatim into the message, so the answer is grounded in
exactly what the reference block shows. `TOKEN_BUDGET` 9,650 → 9,680 for the tier naming BOTH
guards; trimming other words to hit 9,650 was rejected in the note as weakening a law by arithmetic.

## Round 5 — VERDICT: CHANGES, no BLOCKER (at `c008a73`)

Round 4's fixes confirmed clean — the chain of fix-causes-next-blocker is broken.

```
FINDING · WARNING · src/lib/chat2/loop.ts · Both new clauses of `anySourceSurvived` were UNTESTED —
either could be deleted with the battery green. Round 3 filed this fact as a warning and the fix
landed with no case: a law refiled at the same tier.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped
FINDING · WARNING · src/components/live/TranscriptChatPanel.tsx · `companyId` prop dead since the
legacy call was deleted, and its deadness hid a behaviour change: a call-grounded turn is no longer
company-scoped for its tools.
RECURRENCE: no
FINDING · WARNING · ARCHITECTURE.md · Stale test-count header; the ship gate refuses on it.
RECURRENCE: no
FINDING · WARNING · docs/evidence/…/verify-app.md · Rows 2/3 claimed a drive of copy round 4 had
since rewritten.
RECURRENCE: yes → Anything that decides what a screen SAYS gets every state driven, both locales
FINDING · WARNING · STATUS.md · Not rewritten; PROGRESS.md had no entry.
RECURRENCE: no
FINDING · NIT ×4 · four stale route comments, ARCHITECTURE's `chat/history.ts` row, the dictionary
paragraph contradicting the copy beneath it, a comment referring to a field removed in the same
commit.
RECURRENCE: no
```

**Mechanism moved:** three cases now pin `anySourceSurvived` (carried pages are a source, a snipped
image is a source, a block carrying nothing is NOT). Mutation-verified: deleting either clause fails
3 tests.

**The one finding NOT closed by code**, stated rather than ticked: rows 2/3's copy was not
re-rendered after round 4 rewrote it. Re-driving was attempted and abandoned — pdf.js text layers do
not render in a never-foregrounded automation tab, and the attempt also tripped the
`build`-while-dev-server-up trap. What is unverified is one string per locale, in a slot both
locales have already rendered. The rows say so instead of keeping a tick.
