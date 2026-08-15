# `/verify-app` — ticket 08c-3, report grounding + snips on `/api/chat/v2`

Branch `feat/smart-layer-b2c-doc-grounding`. Driven 2026-08-15 against `npm run dev` on `:3000`,
the founder's signed-in Chrome, **real data**: transcript `PyuMxe88e8g` (קבוצת תיגבור, Q1 2026)
with document `36fde52d-81d0-4567-83c6-f302c13044f0` (דוח תקופתי ושנתי לשנת 2025, 175 pages,
173 with extracted text).

Surface: `TranscriptChatPanel` inside `LiveTranscriptView` multiview (Transcript + Slides +
Report), which is the LAST caller of the old `/api/chat` and the reason it was still alive.

## Every state this surface can reach

Enumerated BEFORE driving, per `/verify-app` step 8b. A row with no verdict is the thing this
list exists to make visible.

| # | State | EN | HE | How |
| --- | --- | --- | --- | --- |
| 1 | Marked passage, pages read WHOLE (`documentContext: ok`) — no notice | ✅ driven | ✅ driven | Real selection in the report's text layer → real `mouseup` → real composer → Enter |
| 2 | Marked passage CUT (`truncated`) — Hebrew/English notice | ✅ RE-driven at round 6 | ✅ RE-driven at round 6 | Same real path, `DOCUMENT_BUDGET_CHARS` temporarily 200 (restored). Round 4 rewrote `reportTruncated` in both dictionaries after the first drive, so it was **driven again against the string that merges** — EN *"Only part of the marked report passage reached this answer."*, HE *"רק חלק מהקטע שסומן בדוח הגיע לתשובה הזו."* |
| 3 | Report text UNREADABLE (`failed`) — notice | ✅ driven | ✅ driven | Same real path, loader temporarily returning `{meta:null,pages:[]}` (restored). `reportFailed` is unchanged since the drive. |
| 4 | Snipped IMAGE reaches the model as an image block | ✅ driven (API) | — | Real PNG through `/api/chat/v2` from the signed-in page; the answer cited **page 40**, the SNIPPED page, whose text is fetched alongside the marked ones (`pagesToLoad`) |
| 5 | Snip + marked page COMPOSED with a call grounding | ✅ driven (API) | — | `grounding:whole` + `documentContext:ok` on one turn, both honoured |
| 6 | Malformed snip → 400, never a quietly shorter image list | ✅ driven (API) | — | jpeg data-url, 5 snips (cap 4), 9 marked pages (ceiling 8), bad `documentId`, two documents on one turn — all `400` |
| 7 | Plain turn, nothing attached → NO `documentContext` frame | ✅ driven (API) | — | No frame emitted; user content stays a plain string |
| 8 | Citation chip on a call-grounded answer | ✅ driven | ✅ driven | `קבוצת תיגבור · Q1 2026` under both answers |
| 9 | **Drag-marking and scissors-drag as native gestures** | ❌ NOT driven | ❌ NOT driven | CDP synthetic drags cannot create native selections (a standing `/verify-app` gotcha). The selection was made as a real `Range` on the real text layer and delivered through the component's own `onMouseUp`. **The gesture is unchanged by this ticket; the chat path it feeds is what changed.** Founder hand-check if wanted. |
| 10 | Live panel's own states (`liveTruncated`, no-captions-yet, snip on a live turn) | ❌ NOT re-driven | ❌ NOT re-driven | 08c-2's evidence covers them. What changed here is that a live turn carrying a snip no longer falls back to a second route — it stays on v2. Not re-verified in the browser. |
| 11 | Demo call (`call.id === 'demo'`) → grounds on the COMPANY, not a call id with no row | ❌ NOT driven | ❌ NOT driven | No demo call was reachable in this checkout. Reasoned and unit-typed only. |

### Added after the review rounds

The rounds created new ways to reach `truncated` and `failed`, so the table above was no longer
complete. Enumerated here rather than folded in silently — a table that grows without saying so is
the same gap this step exists to close.

| # | State | EN | HE | How |
| --- | --- | --- | --- | --- |
| 12 | Marked passage PARTLY readable (a blank page beside a good one) → `truncated` | ❌ NOT driven | ❌ NOT driven | Round 1's BLOCKER. Unit-driven only (`loop.test.ts`); the notice it renders is byte-identical to row 2, which WAS driven in both locales, so what is unverified is the state's arrival, not its rendering. |
| 13 | A marked page with NO `document_pages` row → `truncated` | ❌ NOT driven | ❌ NOT driven | Same; unit-driven. |
| 14 | A SNIP on a page with no text, beside a readable marked page → `ok`, no notice | ❌ NOT driven | ❌ NOT driven | Round 2's BLOCKER — the round-1 fix reported this as a report failure on a turn the image had grounded. Unit-driven. Rendering "no notice" has no locale. |
| 15 | SNIP-ONLY turn (no marked passage) → `ok` | ✅ driven (API) | — | Nothing on screen promises report text, so none can be lost. |

Rows 12–14 are unit-driven and not browser-driven. Stated plainly rather than counted as coverage:
each renders one of the two notices already driven in both locales at rows 2 and 3, so the untested
half is which state is CHOSEN — which is exactly what `loop.test.ts` sweeps and what a browser
could not have shown more convincingly.

Rows 9–11 are the honest gaps. 9 is a pre-existing harness limit on a gesture this ticket did not
touch; 10 and 11 are real not-driven states.

## What the API path proved, with numbers

One real turn — call grounding + `documentRef{pages:[12,13]}` + one PNG snip on page 40:

```
grounding      state=whole   source={קבוצת תיגבור, Q1 2026, PyuMxe88e8g}
documentContext state=ok
mode           search
done
```

The answer opened `בעמוד 40 של הדוח התקופתי והשנתי לשנת 2025…` and quoted that page verbatim.
Page 40 was never marked — it arrived because a SNIPPED page still gets its prose fetched, so the
image's own page keeps the text that says what its numbers are about. That is load-bearing and this
is its proof. **Where that union happens MOVED at round 2:** it was the gate merging snipped pages
into the marked list, which is exactly the defect round 2 found; it is now `pagesToLoad()`, kept
apart from the marked list the degradation state is measured against. The behaviour proved by this
run is unchanged — the sentence describing it was not.

## A defect this run found, that the battery could not

`documentContext` reported **`ok`** for a document whose pages hold no extracted text — a scanned
PDF, or a `documentId` naming no row. The read had SUCCEEDED, so the flattering branch was taken:
the model was correctly handed `NO_PAGE_TEXT` and the SCREEN said nothing at all. Success UI over
content the server never had.

Fixed at the choke point — the state is now decided on whether any page text reached the model,
not on whether the read threw (M3.2) — and pinned by
`loop.test.ts › REGRESSION: a report with NO extracted text reports failed, not ok`. Confirmed
live afterwards: a well-formed uuid naming no document now returns `documentContext: failed`.

A second, smaller one: the 400 for a malformed attachment said *"this grounding cannot be
honoured"*. Attachments are not a grounding — that is the whole point of their being a field
beside the union — so the route now names which gate refused.

## The temporary changes, and that they are gone

Rows 2 and 3 cannot be reached with real data through a real gesture: the largest real page in
this 175-page report is 3,120 chars, and 8 marked pages × 3,120 < the 25,000 budget. (It IS
reachable via the merged 12-page case, confirmed at the API level: `documentContext: truncated`.)
To render the NOTICES through the real component, two constants were temporarily changed:

- `DOCUMENT_BUDGET_CHARS` 25,000 → 200
- `loadDocumentForInjection` short-circuited to `{meta:null, pages:[]}`

Both restored. Verified by absence, not by memory: `grep -c TEMP-VERIFY` returns 0 in both files,
both files dropped out of `git diff` entirely, and the `ok` path was re-driven after the restore
(`grounding:whole, documentContext:ok, done`).

## Console

`read_console_messages(onlyErrors)` — no errors or exceptions on the surface throughout.

## Battery

`npm test` 1125 → 1126 green (the regression case above), `npx tsc --noEmit` clean,
`npm run build` clean.

## Cold review — round 1, `atlas-reviewer`, verdict CHANGES

**BLOCKER — pages PARTLY readable reported `ok`.** The fix above decided the state with
`some()` — *did ANY page survive* — which is the wrong question when a marked passage spans a
text page and a scanned one. One page arrives, `some()` says yes, the state reads `ok`, and the
answer is built on a strict SUBSET of the pages the reference block on screen names. The same
defect the `ok`-for-an-unreadable-report fix had just closed, one page over, in the fix itself.

Now a SET DIFFERENCE — `built.pages` (what the model was given) against `args.documents.pages`
(what the user marked) — which also gives `DocumentBlock.pages` its first reader and makes the
no-text branch return `[]` rather than echoing the request back. No third state was needed:
`truncated` already means "you did not get all of it". Two cases pin it (a blank page beside a
good one; a page with no row at all).

**WARNING — the live panel's comment still described the deleted route.** Corrected.

**WARNING — the retirement silently dropped the chat stack's only model-availability fallback.**
The old route ran Gemini with a GPT-4.1 streaming fallback on a 503 or blip; `/api/chat/v2` has
one engine. Real capability loss, recorded in `docs/open-findings.md` with why it is not a patch
(a second engine now has to carry tool use and image blocks, which the text-only fallback never
did) and why it is not a blocker (the failure is visible — 503, or an `error` terminal — never an
answer).

**WARNING — bidi, classified as a recurrence by the reviewer. Disputed, and mitigated anyway.**
The observed line was MODEL ANSWER PROSE: the model quoted the English `NO_PAGE_TEXT` instruction
into an otherwise-Hebrew answer, and the mixed run rendered with its punctuation on the wrong
side. `app.md`'s bidi law is about lines **we** compose from data — a company name beside a
ticker — and every one of its eight prior occurrences is that shape. Model prose inside `Markdown`
is not reachable by a `<bdi>`-per-run rule without a bidi segmenter, so calling this a recurrence
of that law would move a mechanism onto a surface the mechanism cannot see. What IS actionable is
not handing the model an English sentence it wants to quote: `NO_PAGE_TEXT` now says to answer in
the user's own language and not to repeat the note. That is named in the code as a **mitigation,
not a mechanism**, which is the honest tier.

**NITs** — `DocumentBlock.pages` documentation (fixed by the blocker fix, which gave it a reader)
and optional chaining on a prop this diff made required (removed at both sites).

After the round: `npm test` 1128 green, `npx tsc --noEmit` clean.

## Cold review — round 2, verdict CHANGES

**BLOCKER, and round 1's fix caused it.** `parseTurnDocuments` merged every SNIPPED page into
`TurnDocuments.pages`, and round 1 started measuring degradation against that list. A snip of a
scanned page has no text row, so the difference was non-empty and the surface said *"the report
text could not be loaded"* on the exact turn the IMAGE grounding had worked. A snip beside a
readable marked page said *"too long to read in full"* for a page that was never long — and that
case had been `ok` before round 1 touched it.

The two lists answered different questions and are now two things, at the TYPE rather than in a
branch: `TurnDocuments.pages` is **what the screen promised as text** (the marked passage only) and
`pagesToLoad()` is **what is worth fetching** (marked ∪ snipped, so a snipped page still gets its
prose). A snip-only turn promises no text at all, so it cannot lose any — `ok`, not a failure about
text nobody asked for. Four cases pin it.

**The law moved, per ADR-0002.** The degradation law's fourth tier named content served by two
*backends*; this was two *channels* of one source, which the tier did not reach. `.claude/rules/app.md`
now states the channel case explicitly, `ENFORCED test`, and names both halves it was got wrong in:
measure only what the named route was asked to carry, and only what the screen promised.

**WARNING — the state table was stale after round 1.** Four rows added above, three of them marked
NOT browser-driven with the reason.

**WARNING — the mixed-script finding lived only in branch evidence, which is history.** Now filed in
`docs/open-findings.md`, with the disputed classification preserved and the wider exposure named
(every other English prompt constant the model may quote has it and has not been given the clause).

**NIT — a comment claimed M3.2 "the fact, not a proxy"** for page text, which is itself a proxy now
that images carry the same content. The claim is removed rather than reworded.

After round 2: `npm test` 1132 green, `npx tsc --noEmit` clean.

## Cold review — round 3, verdict CHANGES

Three of the four findings were in code the previous two rounds had edited around.

**BLOCKER — a snip-only turn whose load THREW reported `failed`.** Round 2 fixed the branch where
the load succeeded and left its sibling — the unconditional `documentState = 'failed'` — untouched,
so a turn that promised no report text at all, and whose image grounding worked, told the user the
report text could not be loaded. Round 2's own blocker, surviving in the branch round 2 did not
edit.

**WARNING — `built.truncated` answered for both channels.** A bare boolean over every loaded page,
so a snipped page running long said the marked passage "was too long to read in full" about a
passage that was short. `buildDocumentBlock` now reports WHICH pages it cut.

**WARNING — `anySourceSurvived` read the block, not the source (M3.2).** The no-text block is
non-empty (it holds `NO_PAGE_TEXT`), so a turn reporting `documentContext: failed` whose every tool
then failed suppressed `all_sources_failed` and ended `done`. It counts carried PAGES now.

**WARNING — the law claimed a mechanism that did not exist.** The tier said the two lists were
"split in the TYPE, so the merge cannot return". Both are `number[]`; nothing prevents a re-merge.
The claim is removed and the tier names the test that actually holds — the same over-claim 08c-2's
review rejected, made again.

**The fix is structural, not another condition.** Four consecutive better conditions each shipped
the next round's defect, twice in the sibling branch of one `if`. The decision moved out of the
branches into `documentContextState()` — a pure function of four named facts — and is swept as a
TABLE where a new combination is a row. **Verified by mutation, not by reading:** dropping the
snip-only guard goes RED, and so does counting any cut page instead of a marked one; restoring is
green. (Counts deliberately omitted — the numbers first written here came from `grep -c "^✖"`,
which counts node:test OUTPUT LINES rather than tests. See the round-7 note in `review.md`.)

**NITs** — the evidence paragraph describing the merge round 2 deleted, a comment still pointing at
`turnRoute.ts`, and the ticket's own status line. All three fixed. One of those edits silently
matched nothing against CRLF and was caught by grepping for the intended RESULT, which is the trap
`app.md` files under `#crlf`.

`TOKEN_BUDGET` trimmed back to fit 9,650 after the law's wording was corrected.

After round 3: `npm test` 1135 green, `npx tsc --noEmit` clean.

### States added by round 3

| # | State | EN | HE | How |
| --- | --- | --- | --- | --- |
| 16 | SNIP-ONLY turn on a page with no text row → `ok`, no notice | ✅ driven (API) | — | Round 3's BLOCKER. Unit-swept AND re-driven against real data (below). Renders nothing, so it has no locale. |
| 17 | Marked passage whole beside a snipped page that was CUT → `ok` | ✅ driven (API) | — | Round 3's second finding. Unit-swept AND re-driven against real data (below). |
| 18 | A selection resolving to NO page numbers → no `documentRef` sent at all | ❌ NOT driven | ❌ NOT driven | Round 4's finding. The passage itself is composed into the message, so the answer is grounded in exactly what the reference block shows; nothing is owed to the screen, and no notice is right. Reasoned, not driven. |

### Round 3's fixes re-driven against REAL data

The state logic was restructured after the browser run, so it was re-driven rather than assumed —
signed-in Chrome, same document, `/api/chat/v2`:

```
marked page 12, whole                       → grounding:whole | documentContext:ok     | done
snip-only on page 999 (no document_pages row) → grounding:whole | documentContext:ok     | done   ← round 3's BLOCKER
marked page 3 (short) + snipped page 78 (the longest real page, 3,120 chars)
                                            → grounding:whole | documentContext:ok     | done   ← round 3's 2nd finding
marked page 999 (no row)                    → grounding:whole | documentContext:failed | done
```

Before round 3 the second line reported `failed` and the third reported `truncated`. Rows 16 and 17
of the state table are therefore API-driven, not unit-only; neither renders a notice, so neither
has a locale to check.

## Cold review — round 4, verdict CHANGES (no BLOCKER)

The first round with no blocker. `documentContextState()` survived mutation in the reviewer's own
hands — reordering its two leading guards goes red, weakening `markedCut` goes red, and re-supplying
the union as `markedPages` in `loop.ts` goes red — so the structural fix held where four successive
conditions had not.

**WARNING — the `truncated` copy asserted a cause the code never established.** It said "too long to
read in full", but that state is also returned when one marked page was unreadable or had no stored
row, and naming length sends the user to re-mark a narrower passage that would change nothing. Both
locales are cause-neutral now: *"Only part of the marked report passage reached this answer."* /
*"רק חלק מהקטע שסומן בדוח הגיע לתשובה הזו."*

**WARNING — a selection resolving to NO pages still sent a `documentRef`.** `PdfViewer` derives page
numbers from the selection's endpoints, and when both fail the lookup it yields `pages: []`. The
gate collapsed that to "no document", correctly, but the request had claimed a grounding it did not
carry. The panel no longer sends it. **No notice is owed and none was added**, and that is the
finding's real answer rather than a shortcut: the marked PASSAGE is composed verbatim into the
message, so the answer is grounded in exactly what the reference block shows. What an empty page
list loses is the surrounding page prose, which the screen never promised.

**NITs, all fixed** — a second stale "the old /api/chat is still alive" comment in `ChatView` (round
1 fixed this class in `LiveBroadcastView` and left this site); `ARCHITECTURE.md`'s test index still
naming a deleted test, which `testRegistry.test.ts` cannot see because it reconciles `package.json`
only; rows 16–17 marked NOT driven while the section below said they were API-driven; the law tier
naming only one of its two guards; `DocumentBlock.truncated` left in the public shape after
`truncatedPages` replaced it — the bare boolean that caused round 3's warning, re-offered to the
next reader; and a paragraph duplicated in the case history by the round-3 rewrite.

After round 4: `npm test` green, `npx tsc --noEmit` clean.

## Cold review — round 5, verdict CHANGES (no BLOCKER; round 4's fixes broke the pattern)

Rounds 1–3 each had a blocker caused by the previous round's fix. Round 4's did not, and round 5
confirmed round 4's two fixes are clean: `parseTurnDocuments` already collapsed `pages: []`, so the
panel guard is belt-and-braces rather than a new unreachable path, and `DocumentBlock.truncated` is
gone with no remaining reader.

**WARNING — `anySourceSurvived`'s two new clauses were untested.** Round 3 corrected it to count
carried PAGES rather than the presence of a block, and the correction shipped with no case: either
clause could be deleted with the battery green. A law refiled at the same tier. Three cases now
pin it — carried pages are a source, a snipped image is a source, and a block that carries nothing
is NOT (the `NO_PAGE_TEXT` fence is non-empty). **Mutation-verified:** deleting either clause fails
3 tests.

**WARNING — `companyId` was a dead prop hiding a behaviour change.** Removed from the panel and its
three call sites. The change it hid — a call-grounded turn is no longer company-scoped for its
tools, because the union carries one id per recipe — is filed in `docs/open-findings.md`, together
with the actionable half: this panel DISCARDS the `mode` event that would make it visible, while
`ChatView` renders it.

**WARNING — the state table claimed a drive of copy that no longer existed.** Round 4 rewrote
`reportTruncated` in both dictionaries after rows 2 and 3 were driven. **NOT re-driven**, and the
rows say so rather than keeping a tick: the render path is byte-identical (the same
`<p role="status" dir="auto">`, the same branch, only the string differs), and re-driving it
requires the temporary budget change again. **It was attempted and abandoned**: pdf.js text layers
do not render in a never-foregrounded automation tab — a standing `/verify-app` gotcha — and the
attempt also tripped the `npm run build`-while-dev-server-up trap (`.next` overwritten, recovered
by killing dev, deleting `.next`, restarting). Two harness traps in one attempt is the signal to
stop rather than loop. **What is unverified is one string per locale in a slot both locales have
already rendered**; a founder glance closes it in seconds.

**WARNING — `ARCHITECTURE.md`'s test-count header was stale** (1094/106 → measured 1138/105), which
the ship gate refuses on. **WARNING — `STATUS.md` and `PROGRESS.md`** were the ship gate's other two;
both done.

**NITs, all fixed** — four stale comments still describing the deleted route (`LiveTranscriptView`
×2, `PdfViewer`, `TranscriptChatPanel`), `ARCHITECTURE.md`'s `chat/history.ts` row claiming
`sanitizeHistory` runs on the `/api/chat` body (the v2 route filters history inline and does NOT
call it — recorded as a gap, not a design), the dictionary paragraph still explaining the cause the
paragraph beneath it disowns, and a comment referring to a field removed in the same commit.

After round 5: `npm test` 1138 green, `npx tsc --noEmit` clean.

## Cold review — round 6, verdict APPROVED

The branch is mergeable. Round 6 re-verified the mutation claims itself, ran the battery, tsc and
the ship gate, and read the whole diff. Its findings, and what was done:

**WARNING — the `truncated` string that merges had never been rendered.** Round 5 recorded this as
a gap rather than closing it. **It is now CLOSED: re-driven in BOTH locales at round 6** against the
copy that merges, through the real path (real selection → real `mouseup` → real composer → Enter),
with `DOCUMENT_BUDGET_CHARS` temporarily 200 and restored. The earlier attempt failed because the
report pane was in MULTI view, where its column is narrow and pdf.js had not painted a text layer;
SINGLE view with the Report facet renders it immediately. That is the fix for the harness problem
recorded in round 5, and it is worth more than the process note: **the pane has to be the one the
user is looking at, not merely mounted.** Row 2 now reads ✅ RE-driven.

Step 8c (a drive expires when the code under it changes) was judged "a REAL gate, not a dodge",
with the observation that a per-row sha would make it mechanical rather than remembered. **Not
built here, and the reason is stated rather than implied:** a per-row sha needs the ship gate to
know which files cover which row, which is a mapping nothing in the repo has today — inventing one
in this ticket would be a mechanism whose accuracy nobody has checked, which is the over-claim
round 3 already caught once. Filed as the next strengthening; the ritual tier holds meanwhile and
it is what produced this round's honest ⚠, then this re-drive.

**WARNING — the call-scope open finding understated its own blast radius.** It said a tool call past
the call "runs market-wide" without noting that market-wide search is currently RED (unscoped scan
hits `statement timeout`), so today's consequence is a FAILING tool, not a wider answer. Corrected
in `docs/open-findings.md`.

**NIT — "fails 3 tests" was wrong** (M1, a count restated rather than measured). Round 7 then found
the SAME error two lines away in the same file, which is how the real cause surfaced: every one of
these counts came from `grep -c "^✖"`, and node:test prints each failure TWICE — inline and again
under `failing tests:` — plus a header line, so the command was counting output lines at roughly
2n+1 and never counting tests at all. **Every mutation count in this evidence is now dropped rather
than corrected**: the property is "the guard goes red", and the command that answers it is
`npx tsx --test <file> | grep "^ℹ fail"`. A count in prose has been wrong three times on this
branch; `app.md`'s "counts carry their command" is the rule, and this is the third time it was paid
for.

**NIT — step 8c was inserted above 8b**, so the checklist read 8 → 8c → 8b. Reordered.

**NIT — the review record's `REVIEWED:`/`VERDICT:` must be this round's**, not round 5's, or the
gate is handed the oldest sha. Replaced.

Final: `npm test` 1138 green, `npx tsc --noEmit` clean, `npm run build` clean.
