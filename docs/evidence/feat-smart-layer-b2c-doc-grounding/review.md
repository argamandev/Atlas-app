# Cold review record — ticket 08c-3 (`feat/smart-layer-b2c-doc-grounding`)

Five rounds, `atlas-reviewer`, cold context each time. The narrative, the states each round added
and the mutation results are in `verify-app.md`; this file is the tracked verdict record.

REVIEWED: c008a73

VERDICT: CHANGES

Every finding below is answered — the code fixes are in commits `59df709`, `5ec4f80`, `09bb75f`,
`8ae5487` and the round-5 commit. One finding is answered with a DISPUTE (round 1's bidi
classification) and one is answered by stating a gap rather than closing it (round 5's un-re-driven
copy); both are argued in full at the foot of this file.

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
RECURRENCE: no — DISPUTED classification, argued in full at the foot of this file

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
RECURRENCE: no — a comment over-claiming, not a defect the code can reach; the claim is deleted rather than reworded

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
RECURRENCE: no — an over-claimed mechanism in a law's own declaration, which no LAW in the always-on set governs; the structure that governs it is the ENFORCED/UNENFORCEABLE declaration itself

FINDING · NIT · docs/evidence/feat-smart-layer-b2c-doc-grounding/verify-app.md · A paragraph describing the merge round 2 deleted, a comment pointing at the deleted `turnRoute.ts`, and the ticket's own status line.
RECURRENCE: no

**The structural answer.** The decision left `loop.ts`'s branches for `documentContextState()`, a
pure function of four named facts, swept as a table. Mutation-verified: dropping the snip-only guard
fails 3 cases, weakening `markedCut` fails 5.

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
image is a source, a block carrying nothing is NOT. Mutation-verified: deleting either clause fails
3 tests.

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
