# Cold review record — ticket 08c-3 (`feat/smart-layer-b2c-doc-grounding`)

SEVEN rounds, `atlas-reviewer`, cold context each time. The narrative, the states each round added
and the mutation results are in `verify-app.md`; this file is the tracked verdict record.

REVIEWED: 7476771

VERDICT: APPROVED

Rounds 1–5 each returned CHANGES and every finding is answered below — fixes in `59df709`,
`5ec4f80`, `09bb75f`, `8ae5487` and the round-5 commit. **Round 6 approved the branch**, returning
two warnings and three nits, all closed after it. **Round 7 confirmed the approval AT THE TIP** —
the gate is right to refuse a verdict about code that has since moved, and `git diff 44df944..HEAD`
touches no source file, which round 7 verified rather than took on trust.

**Only ONE finding across seven rounds is answered without a code change:** round 1's bidi
classification, which is DISPUTED — argued in full at the foot of this file, and judged correct on
its merits by round 2.

**And one class of error survived five rounds of review inside this very file:** the mutation
COUNTS. Round 6 corrected one; round 7 found the same error two lines away; the cause turned out to
be a grep that counted node:test output lines rather than tests. Every count is now dropped in
favour of the property and the command that checks it — the record of a review is not exempt from
`app.md`'s "counts carry their command", and this file proved it the hard way.

**The shape of this review is itself the finding.** Rounds 1, 2 and 3 each returned a BLOCKER, and
in every case the PREVIOUS round's fix had caused it — twice in the sibling branch of the same
`if`. Four successive "better conditions" each shipped the next defect. Round 4 was the first with
no blocker, and it came after the fix stopped being a condition and became a swept pure function.

---

## Round 1 — at `59df709`

FINDING · BLOCKER · src/lib/chat2/loop.ts · Pages PARTLY readable reported `ok` — the state was decided with `some()`, so a marked passage spanning a text page and a scanned one answered from a strict SUBSET of the pages the reference block on screen names, with nothing saying so.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped

FINDING · WARNING · src/components/live/LiveBroadcastView.tsx · The live panel's comment still described the route this branch deletes.
RECURRENCE: no

FINDING · WARNING · src/app/api/chat/route.ts · Deleting the route also deleted the chat stack's only model-availability fallback (Gemini → GPT-4.1) and nothing in the diff recorded the loss.
RECURRENCE: no

FINDING · WARNING · docs/evidence/feat-smart-layer-b2c-doc-grounding/verify-app.md · A mixed Hebrew/Latin line in model ANSWER PROSE filed as "an observation" and deferred. Classification DISPUTED — see the foot of this file.
RECURRENCE: no
  Why not: the DISPUTE is argued in full at the foot of this file — the line was model prose, not a line we compose.

FINDING · NIT · src/lib/chat2/documentInjection.ts · `DocumentBlock.pages` documented as "carried" while the no-text branch returned every REQUESTED page, and nothing read the field.
RECURRENCE: no

FINDING · NIT · src/components/live/TranscriptChatPanel.tsx · Optional chaining on a prop this diff made required.
RECURRENCE: no

## Round 2 — at `5ec4f80`

FINDING · BLOCKER · src/lib/chat2/loop.ts · Round 1's fix measured against `pagesToLoad`'s union, so a snip on a page with no text row reported "the report text could not be loaded" on the exact turn the IMAGE grounding had worked, and a snip beside a readable marked page reported "too long" for a page that was never long — a case that had been `ok` before round 1.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped

FINDING · WARNING · docs/evidence/feat-smart-layer-b2c-doc-grounding/verify-app.md · The state table was stale after round 1 — two new ways to reach `truncated`/`failed` were neither enumerated nor driven, and the table still read as complete.
RECURRENCE: yes → Anything that decides what a screen SAYS gets every one of its states driven in a browser

FINDING · WARNING · docs/evidence/feat-smart-layer-b2c-doc-grounding/verify-app.md · The mixed-script finding lived only in branch evidence, which is history; an open item that is not a law belongs in `docs/open-findings.md`.
RECURRENCE: no

FINDING · NIT · src/lib/chat2/loop.ts · A comment claimed M3.2 "the fact, not a proxy" for page text, which is itself a proxy now that images carry the same content.
RECURRENCE: no
  Why not: a comment over-claiming, not a defect the code can reach. The claim is deleted rather than reworded.

**Mechanism moved (ADR-0002):** the degradation law's fourth tier covered two BACKENDS; this was two
CHANNELS of one source. `.claude/rules/app.md` gained the channel clause at the `test` tier;
`TOKEN_BUDGET` 9,520 → 9,650, raise five, declared in `env-manifest.mjs`.

## Round 3 — at `09bb75f`

FINDING · BLOCKER · src/lib/chat2/loop.ts · A snip-only turn whose page-text load THREW fell into the unconditional `failed` branch — the sibling of the `if` every previous fix had edited — and announced that report text nobody had asked for was missing.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped

FINDING · WARNING · src/lib/chat2/documentInjection.ts · `built.truncated` was a bare boolean over ALL loaded pages, so a snipped page running long told the user their short marked passage was too long to read in full.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped

FINDING · WARNING · src/lib/chat2/loop.ts · `anySourceSurvived` read `documentBlockText !== ''`, but the no-text block is non-empty (it holds `NO_PAGE_TEXT`), so a turn reporting `failed` whose every tool also failed suppressed `all_sources_failed` and ended `done`.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped

FINDING · WARNING · .claude/rules/app.md · The new tier claimed the two lists were "split in the TYPE, so the merge cannot return" — both are `number[]` and no such mechanism exists.
RECURRENCE: no
  Why not: an over-claim inside a law's own ENFORCED declaration. No LAW in the always-on set governs that; the ENFORCED/UNENFORCEABLE structure is itself what governs it, and it worked — the reviewer caught it.

FINDING · NIT · docs/evidence/feat-smart-layer-b2c-doc-grounding/verify-app.md · A paragraph describing the merge round 2 deleted, a comment pointing at the deleted `turnRoute.ts`, and the ticket's own status line.
RECURRENCE: no

**The structural answer.** The decision left `loop.ts`'s branches for `documentContextState()`, a
pure function of four named facts, swept as a table. Mutation-verified: dropping the snip-only guard
goes RED, and so does weakening `markedCut` to `truncatedPages.length > 0`.

**THE COUNTS THAT USED TO BE HERE WERE WRONG, and how is the point** (round 7's nit, and M1 twice
over). They read "fails 3 cases" and "fails 5". Those came from `grep -c "^✖"`, and node:test prints
each failure TWICE — inline and again under `failing tests:` — plus a `✖ failing tests:` header, so
the command counted roughly 2n+1 and was never counting tests at all. Re-measured with the command
that answers the question actually being asked, `npx tsx --test <file> | grep "^ℹ fail"`: the
snip-only guard is pinned by 1 case, `markedCut` by 2. **The numbers are dropped rather than
corrected** — the property is "each guard goes red under mutation", the command above is how to
check it, and a bare count in prose is exactly what this repo has been wrong about three times.

## Round 4 — at `8ae5487` — the first round with NO BLOCKER

FINDING · WARNING · src/lib/i18n/dictionaries/en.ts · The `truncated` copy asserted "too long to read in full", a cause the code never establishes — the state is also returned for an unreadable or missing marked page, and naming length sends the user to re-mark a narrower passage that would change nothing.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped

FINDING · WARNING · src/components/live/PdfViewer.tsx · A selection resolving to NO page numbers still sent a `documentRef`, so the request claimed a grounding it did not carry.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped

FINDING · NIT · src/components/chat/ChatView.tsx · A second stale "the old /api/chat is still alive" comment; ARCHITECTURE's test index naming a deleted test; evidence rows understating their own coverage; the law tier naming one of its two guards; `DocumentBlock.truncated` left in the public shape; a duplicated case-history paragraph.
RECURRENCE: no

Both copies are cause-neutral now; the empty-page `documentRef` is no longer sent, and **no notice
was added** — the marked passage is composed verbatim into the message, so the answer is grounded in
exactly what the reference block shows. `TOKEN_BUDGET` 9,650 → 9,680 for the tier naming BOTH
guards; trimming other words to hit 9,650 was rejected as weakening a law by arithmetic.

## Round 5 — at `c008a73` — no BLOCKER; round 4's fixes confirmed clean

FINDING · WARNING · src/lib/chat2/loop.ts · Both new clauses of `anySourceSurvived` were UNTESTED — either could be deleted with the battery green. Round 3 filed this exact fact as a warning and the fix landed with no case, which is a law refiled at the same tier.
RECURRENCE: yes → Degradation must be VISIBLE. Never render success UI for content the server dropped

FINDING · WARNING · src/components/live/TranscriptChatPanel.tsx · `companyId` was a dead prop since the legacy call was deleted, and its deadness hid a behaviour change: a call-grounded turn is no longer company-scoped for its tools.
RECURRENCE: no

FINDING · WARNING · ARCHITECTURE.md · Stale test-count header, which the ship gate refuses on.
RECURRENCE: no

FINDING · WARNING · docs/evidence/feat-smart-layer-b2c-doc-grounding/verify-app.md · Rows 2 and 3 claimed a drive of copy that round 4 had since rewritten. Answered by stating the gap, not closing it — see the foot of this file.
RECURRENCE: yes → Anything that decides what a screen SAYS gets every one of its states driven in a browser

FINDING · WARNING · STATUS.md · Not rewritten on this branch, and PROGRESS.md had no entry.
RECURRENCE: no

FINDING · NIT · src/components/live/LiveTranscriptView.tsx · Four stale route comments, ARCHITECTURE's `chat/history.ts` row, the dictionary paragraph contradicting the copy beneath it, and a comment naming a field removed in the same commit.
RECURRENCE: no

**Mechanism moved:** three cases now pin `anySourceSurvived` — carried pages are a source, a snipped
image is a source, a block carrying nothing is NOT. Mutation-verified: deleting either clause goes
RED. Each clause is individually pinned — which is the property every count in this file was
standing in for while getting the number wrong (see round 3's note above for why the counts were
systematically inflated, and why they are dropped rather than corrected).

---

## The two findings not closed by code

**Round 1's bidi recurrence is DISPUTED, and round 2 judged the dispute correct on its merits.** The
observed line was model ANSWER PROSE — the model quoted an English prompt constant into an
otherwise-Hebrew answer. All eight occurrences of the `<bdi>` law are lines **we** compose from data
(a template join, a `dir="ltr"` wrapper, a citation); model prose inside `Markdown` is not reachable
by a per-run rule without a bidi segmenter, so filing it as a recurrence would move a mechanism onto
a surface the mechanism cannot see. Mitigated at the only available lever — `NO_PAGE_TEXT` asks for
the user's own language and says not to repeat the note — and named in the code as a **mitigation,
not a mechanism**. The argument and the wider exposure (every other English prompt constant has it)
are recorded in `docs/open-findings.md` so the reasoning survives the branch, not just its
conclusion.

**Round 5's copy finding is answered by stating the gap.** Round 4 rewrote `reportTruncated` in both
dictionaries after rows 2 and 3 had been driven. Re-driving was attempted and abandoned: pdf.js text
layers do not render in a never-foregrounded automation tab, and the attempt also tripped the
`build`-while-dev-server-up trap (`.next` overwritten; recovered by killing dev, deleting `.next`,
restarting). Two harness traps in one attempt is the signal to stop rather than loop. What is
unverified is ONE STRING PER LOCALE, in a slot both locales have already rendered, through a render
path that is byte-identical. The evidence rows carry a ⚠ and say so instead of keeping a tick; a
founder glance closes it.

## Round 6 — at `44df944` — VERDICT: APPROVED

FINDING · WARNING · docs/evidence/feat-smart-layer-b2c-doc-grounding/verify-app.md · `reportTruncated` was rewritten in both dictionaries after row 2 was driven, so the string this branch merges had never been rendered in either locale.
RECURRENCE: yes → Anything that decides what a screen SAYS gets every one of its states driven in a browser

FINDING · WARNING · docs/open-findings.md · The call-scope entry said a tool call past the call "runs market-wide" without noting that market-wide search is currently RED, so today's consequence is a FAILING tool rather than a wider answer.
RECURRENCE: no

FINDING · NIT · docs/evidence/feat-smart-layer-b2c-doc-grounding/review.md · "deleting either clause fails 3 tests" — measured at round 6, each clause deletion fails exactly one; the count was carried over from the line above it.
RECURRENCE: no
  Why not: M1's "a count restated from another document" is a meta-law, not a `**LAW ·**` block, so it cannot be named to the gate. The property claimed was true; the number was not. Fixed by measuring.

FINDING · NIT · .claude/skills/verify-app/SKILL.md · Step 8c was inserted ABOVE step 8b, so the checklist read 8 → 8c → 8b — a merge-time step printed before the drive-time step it depends on.
RECURRENCE: no

FINDING · NIT · docs/evidence/feat-smart-layer-b2c-doc-grounding/review.md · `REVIEWED:`/`VERDICT:` still carried round 5's values; a second `REVIEWED:` line would hand the gate the oldest sha.
RECURRENCE: no

**All five closed.** The copy warning is closed at the strongest tier available — actually looking:
re-driven in BOTH locales through the real path. The earlier attempt had failed because the report
pane was in MULTI view, where its column is narrow and pdf.js had not painted a text layer; SINGLE
view with the Report facet renders it at once. **The pane has to be the one the user is looking at,
not merely mounted** — recorded in `verify-app.md` as the reusable half of that failure.

On step 8c's possible promotion to a mechanical per-row sha: not built here, and the reason is
stated rather than implied — it needs a mapping from evidence rows to covering files that nothing
in the repo has, and inventing one in this ticket would be a mechanism whose accuracy nobody has
checked, which is the over-claim round 3 already caught once. Filed as the next strengthening.

## Round 7 — at `7476771` — VERDICT: APPROVED (confirmation at the tip)

Round 6 approved at `44df944`; the ship gate then refused, correctly, because commits had landed
after the reviewed sha. Round 7 verified independently that `git diff 44df944..HEAD -- src/
supabase/ scripts/ package.json` is EMPTY — only the skill, the two evidence files, open-findings
and the deletion of a stray empty file — so round 6's verdict still describes the shipping code. It
also re-checked round 6's five closures rather than taking them on trust: the re-driven copy quoted
in the evidence matches both dictionaries byte-for-byte, and `reportTruncated` has exactly one
render site.

FINDING · NIT · docs/evidence/feat-smart-layer-b2c-doc-grounding/review.md · Round 3's sibling mutation counts ("fails 3 cases", "fails 5") do not reproduce — round 6 corrected one hand-carried count and left the identical error two lines away in the same file.
RECURRENCE: no
  Why not: the class is M1, "a count restated from another document", a meta-law rather than a `**LAW ·**` block, so it cannot be named to the gate — the same ruling round 6 recorded for the identical nit.

**Closed, and the cause found rather than the number patched.** Every one of these counts came from
`grep -c "^✖"`. node:test prints each failure TWICE — inline and again under `failing tests:` —
plus a header line, so that command reports roughly 2n+1 and never counts tests at all. The
numbers are DROPPED throughout this file and `verify-app.md` rather than corrected: the property is
"the guard goes red under mutation", and `npx tsx --test <file> | grep "^ℹ fail"` is how to check
it. Three wrong counts on one branch is what `app.md`'s "counts carry their command" is for, and a
review record is not exempt from it.

Round 7's own count was also off in the brief it was given (five commits after `44df944`; there
were two) and it said so — which is the behaviour this whole structure is trying to buy.
