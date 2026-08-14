# Ticket 07 (B1b) — `/verify-app` walkthrough

**Verified 2026-08-14**, `/app/chat` on `localhost:3000`, signed in as the founder through the real
Chrome (the sanctioned path — no credential in this transcript). Dev server started clean; no stale
server, no `npm run build` while it ran.

Console: **zero errors or exceptions** in both locales, across every state below.

---

## What was driven, in both locales

| State | HE | EN | Result |
| --- | --- | --- | --- |
| Search-mode chip on an unscoped turn | ✓ | ✓ | `מצב חיפוש · הצמדה לחברה` / `Search mode · Pin to a company` |
| Search-mode hint under the composer | ✓ | ✓ | `לא זוהתה חברה, ולכן אטלס עונה עם ממצאים מכל השוק.` / `No company was identified, so Atlas is answering with leads from across the market.` |
| "Pin to a company" tap → `@mention` dropdown | ✓ | — | Opens the dropdown with the company + logo; selecting it pins |
| Pinpoint chip + unpin control | ✓ | ✓ | `@בזק` + `חיפוש בכל השוק במקום` / `Search the whole market instead` |
| Unpin tap → back to search mode | — | ✓ | Chip row flips to `Search mode · Pin to a company` |
| Degradation notice, `all_sources_failed` | ✓ | ✓ | see below |
| A clean `done` answer shows NO notice | — | ✓ | grounded Bezeq answer, block quotes, no false "cut off" line |
| Company chip bidi | ✓ | ✓ | measured, see below |
| Conversation persists to the sidebar | ✓ | ✓ | thread appears under RECENT CHATS |

### The degradation notice, rendered from the CODE

Hebrew:
> כל חיפושי המקורות בתשובה הזו נכשלו, ולכן דבר בה אינו מבוסס — אל תסתמכו עליה.

English:
> Every source lookup failed on this answer, so nothing in it is grounded — do not rely on it.

Both rendered **beside** the model's own text, not instead of it, in the rust `#B0533E` the other
honesty notices use. This is the `all_sources_failed` code arriving from a REAL unplanned failure
(the unscoped retrieval timeout, `measurements.md` §1) — not a simulated one.

**Stated limit (M1): 1 of 9 incomplete codes was rendered live.** The other eight share one code
path and one lookup; what is proven mechanically rather than by eye is that each has non-empty,
distinct, actually-Hebrew copy (`src/lib/chat/incompleteCopy.test.ts`) and that the wire code maps
to it exhaustively by type. Rendering the remaining eight needs the model to be driven into
`max_tokens`, a refusal, and a pause on demand, which nothing here can force. Said rather than
implied.

---

## The bidi law, measured rather than eyeballed

`rules/app.md` requires proving a `<bdi>` actually changes the render — "a `<bdi>` that changes
nothing looks identical to one that fixes everything." The company chip (`@` + a Hebrew company
name) was measured live in the EN locale (`<html dir="ltr">`), moving `dir` on the container and
re-reading the run's x-position:

| container `dir` | `<bdi>` offset from the span's start |
| --- | --- |
| (none — as shipped) | 11px — `@` first, then the Hebrew run |
| `auto` | 11px |
| `ltr` | 11px |
| `rtl` | **0px** — the runs swap |

Two things this establishes. The layout **is** direction-sensitive (the `rtl` row moves it), so the
measurement is not vacuous. And under `dir="auto"` the line does **not** flip — which is the
`<bdi>` doing its job: it isolates the Hebrew so the parent's auto-resolution sees only the neutral
`@` and stays LTR. Without the isolation, `auto` would resolve from `ב` and flip the whole chip.

`dir` is on the container (`<html>`), never on the mixed line — the span carries no `dir` attribute
(`spanDirAttr: null`, confirmed in the same probe).

---

## One defect found by looking, and fixed

After tapping "pin to a company", the chip row rendered `@בזק` **and** `מצב חיפוש` at the same
time — two controls on one row contradicting each other about what the next answer would be scoped
to. `mode` is a fact about the last turn the server reported; the user had just changed the scope of
the next one.

Fixed by rendering from `shownMode`: when a company is pinned client-side the surface computes the
mode with `chatMode()` — **the same pure function the server decides with, over the same single
fact**, so this is one vocabulary evaluated in two places rather than a client-side guess. Before
the user pins anything the server's report still governs, because only it can know what
`resolve_company` did mid-turn.

Re-verified after the fix in both locales: pinned → `@company` + unpin, no search chip; unpinned →
search chip + hint, no unpin control.

---

## Observed, NOT a ticket-07 defect — filed so it is not lost

An **English** question came back with a **Hebrew** answer on the pinpoint path, despite the system
prompt's `LANGUAGE. Reply in the user's language`. That is a `chat2/systemPrompt.ts` behaviour
inherited from ticket 06, not the surface this ticket built, and the surface rendered it correctly
(Markdown's `detectDir` right-aligned the Hebrew inside the LTR page). Filed here rather than fixed,
because changing the system prompt is a ticket-06 change that re-prices every answer measured in
`measurements.md`.

---

# Round 2 — after the cold review

The `atlas-reviewer` returned **CHANGES**: 2 BLOCKERs, 2 WARNINGs, 2 NITs. All six are addressed;
each fix is re-verified below rather than assumed.

## BLOCKER 1 — a scope the backend accepted and ignored

`transcriptId` was uuid-gated onto `ChatScope` and read by **no tool and no prompt**, while
`/app/chat?transcript=…` ("open in chat" from a call) rendered a chip naming that call. The surface
promised a grounding the backend had silently dropped — success UI for content the server never
used.

Fixed in three places rather than one, because patching only the call site would leave the shape
open:

1. **`transcriptId` removed from `clientScopeIds` and `ChatScope`.** A field the type cannot express
   is a field no route can quietly accept and ignore (M3.3). Ticket 08 adds it back *together with*
   whole-call injection — the only order in which it is honest.
2. **`useV2 = !projectId && !transcript`.** One rule, stated once: a surface goes to v2 only when v2
   can honour every grounding that surface displays. TypeScript then proved the v2 request could no
   longer carry a transcript id — the field was dead code and the compiler said so.
3. **A mechanism, not just a fix** (ADR-0002). `requestScope.test.ts` now asserts every id
   `clientScopeIds` returns is consumed somewhere in `src/lib/chat2`. This moves the law from prose
   — the tier that had just failed — to `test`.

**CORRECTED AT ROUND 2 — the first version of this claim was FALSE.** See the round-3 section
below: the guard counted `toolDefs.ts` as a consumer, so an id declared on `ChatScope` and read by
nothing passed. What follows was the proof I ran, and it was too weak to catch that.

**Proved the guard is not vacuous:** re-introducing `transcriptId` into `clientScopeIds` fails 3
tests including the new one; restoring passes 9. The guard also **blanks comments before searching**,
because `toolDefs.ts` now carries a comment explaining the removal — a plain substring search finds
that comment and goes green on the very defect it exists to catch (app.md's "a grep hits prose"
trap, the same reason the `DEMO_USER_ID` guard blanks comments).

**Verified in the browser**, `?transcript=hii8RivJK9I`: the chip renders, no mode chip appears, and
patching `window.fetch` shows the turn going to **`/api/chat`**, not `/api/chat/v2`.

## BLOCKER 2 — the same contradiction I had just fixed, one JSX block below

`searchModeHint` still gated on `mode` rather than `shownMode`, so after pinning a company the
screen kept saying "No company was identified…" directly under the `@company` chip. My earlier fix
changed the two chips and missed the hint — in the same commit.

Fixed, and then fixed *properly*: the raw state is renamed **`reportedMode`**. Nothing in a render
should want "whatever the server last reported", so the wrong choice now announces itself at the
call site (M3.3). Every JSX branch reads `shownMode`.

**Re-verified in the state the bug actually lived in** — a live thread, then pin:

| State (thread present) | pinned chip | unpin | search chip | search hint |
| --- | --- | --- | --- | --- |
| pinned | ✓ | ✓ | **absent** | **absent** |
| after unpin | absent | absent | ✓ | ✓ |
| pinned again via the dropdown | ✓ | ✓ | **absent** | **absent** |

## WARNING — alias hits could evict an exact name match

Alias rows were prepended and the union `.slice(0, 20)`'d, so a broad stem ("בנק") could push the
company whose name was typed exactly off the end. Ordering by *which query found a row* is a proxy
for relevance (M3.2); the fact relevance rests on is how well the term matches. Now ranked by
`matchRank` — exact / prefix / contains, over every name including matched aliases.

Split into `src/lib/company/matchRank.ts` so it is testable at all: `db/companies.ts` imports
`supabaseAdmin` at module load, so nothing in it can be reached from a test process — the same
reason `toolDefs.ts` was split from `tools.ts`. 8 tests, including both directions (an exact *name*
match beating a weak alias hit, and an exact *alias* match beating a weak name hit — the fix must
not simply invert the old bias) and the empty-term case, where `''.includes('')` would otherwise
rank the entire directory 0.

## WARNING — v2 has no citation chip, and that is a real loss

Accepted and **stated rather than closed**: under v2 `source` is permanently `null`, so
`CitationChip` never renders on the migrated chat. Grounding lives in fenced tool results and
`chunkId` anchors that never reach the client, so the main chat has lost its citation affordance
relative to the old route. Nothing fabricates a chip — the honest failure — but the user gets less
than before. **Ticket 08 owns this**: it is the same surface work, and the citations contract
(§2.4) needs anchors on the wire, which is a change to the event stream, not to this component.

## NIT — the transcript chip's mixed run

`${company} · ${quarter}` ("קבוצת תיגבור · Q4 2025") rendered as one un-isolated mixed line. Fixed
at the **construct** (the law's first VERIFY step): the page now passes `company` and `quarter`
separately instead of pre-joining them, because a concatenated string cannot be isolated by the
component that renders it. Each run gets its own `<bdi>`; the neutral separator stays outside both.

Measured live: `קבוצת תיגבור` resolves `rtl` at x=905, `Q4 2025` resolves `ltr` at x=980 — two
runs, two directions, container untouched.

## NIT — a partial answer was replayed to the model as whole

The surface knew a prior turn was cut off and showed a notice saying so, then handed the model a
plain `{role, content}` claiming it was a finished reply. History now appends
`[This answer was cut off before it finished — it is not complete.]` for any turn carrying
`incomplete` (this session) or `truncated` (after a reload) — the same two fields the persistence
path reads.

## Battery after round 2

**986/986 green**, `tsc` clean, zero console errors in both locales.

---

# Round 3 — after the second cold review

Round 2 returned **CHANGES**: 1 BLOCKER, 3 WARNINGs. It confirmed as real and complete: the
`reportedMode`/`shownMode` fix, the `useV2` gate (all three ChatView call sites covered), the bidi
construct fix, and `matchRank`.

## BLOCKER — my own mechanism was gameable, and my evidence said it was proven

The round-1 guard listed `toolDefs.ts` among the "consumers". `toolDefs.ts` holds the `ChatScope`
**interface** — the declaration is the subject under test, not evidence about it. So adding
`callId` to *both* `clientScopeIds` and `ChatScope` — round 1's exact defect shape — left the guard
**green**, because the identifier appears in the type.

This is worse than the original defect. A guard that reads its own subject as proof **certifies an
untrue premise** (M2), and the round-2 section above stated the shape was mechanically closed. That
sentence has been marked corrected in place rather than deleted.

**CORRECTED AGAIN AT ROUND 3 — this claim was ALSO false.** Removing `toolDefs.ts` fixed the
INSTANCE, not the class: declaring `callId` on `ModeFacts` in `mode.ts` (still a listed consumer)
sailed through, because a substring cannot tell "declared" from "used". See round 4 below for the
version that holds and for what it actually proves.

Fixed at round 2: `toolDefs.ts` removed from the consumer list.

**Re-proved with the reviewer's own injection** (the one that defeated the previous guard): with
`callId` in `clientScopeIds` **and** `ChatScope`, the guard now FAILS; restoring, 9/9 pass. The
earlier proof was too weak because it only injected into `clientScopeIds`, which is exactly the
half the flawed consumer list could still see.

## WARNING — the history label grew its own second opinion

The label read `incomplete || truncated`; `truncatedForPersist` answers the same question from
**three** fields. The missing one, `errorKind: 'truncated'` (a stream that broke this session), is
reachable on precisely the route `useV2` keeps alive for project and transcript chats. Now routed
through the choke point (M3.1): one function decides "is this answer partial", and both the storage
path and the model ask it.

## WARNING — a resolved company could be invisible and un-undoable

If `adoptResolvedCompany`'s name lookup failed, `companyId` stayed set while `companyName` was
null — so the company chip, the unpin button and the search chip all rendered nothing, and the chat
sat silently scoped to a company the user could neither see nor escape. A fabricated fourth state,
which the degradation law forbids.

Both controls are now gated on the **scope** (`companyId`), not on the name. An unnamed scope
renders `@a company` / `@חברה` (new copy, both locales) rather than disappearing. The escape hatch
exists precisely when the name is missing.

**DRIVEN, not reasoned about.** The state was reproduced end to end: start unscoped, fail only
`/api/companies/<uuid>` (the lookup `adoptResolvedCompany` uses), then ask a question naming a
company so the SERVER resolves it via `resolve_company`. The chip row then reads:

| locale | chip row |
| --- | --- |
| en | `@a company` · `Search the whole market instead` |
| he | `@חברה` · `חיפוש בכל השוק במקום` |

Before the fix that row was empty. Also re-checked that the ordinary company entry point
(`?company=<id>`) still renders its chip WITH the logo and offers the unpin control — the gating
change from `companyName` to `companyId` did not disturb it. Zero console errors.

## NIT — other callers of `searchCompanies`

Accepted and stated: `searchCompanies` also feeds `HomeSearch` and `CompanyOverview`, whose result
sets now include alias hits and are rank-ordered. The browser verification above exercised only the
@-mention dropdown. The change is additive (no company that matched before stops matching) and the
ordering is by match quality, so an exact hit ranks at least as well as it did — but those two
surfaces were **not** driven, and that is a limit of this evidence, not a claim about them.

## Battery after round 3

**986/986 green**, `tsc` clean.

---

# Round 4 — after the third cold review

Round 3 returned **CHANGES**: 1 BLOCKER, 1 WARNING, 1 NIT. All three were the same mistake in three
places — **I fixed the instance and claimed the class.** Recording that plainly, because it is the
actual lesson of this branch and it cost three review rounds.

## BLOCKER — the guard was defeated a second time, by a different door

Round 2's fix removed `toolDefs.ts` from the consumer list. Round 3 declared `callId` on
`ModeFacts` in `mode.ts` — still a listed consumer — and the guard stayed green. A substring search
cannot tell a declaration from a use, so removing one file only moved the hole.

**The version that holds** uses the discriminator the two shapes actually differ by: a read is
always `scope.companyId` / `facts.companyId`; a declaration is always `companyId?: string` with
nothing before it. The guard now requires a **value-position read** — `/\.\s*<id>\b/` — not a
substring.

**Proved against BOTH earlier defeats**, not just the newest one:

| injection | previous guard | current guard |
| --- | --- | --- |
| `callId` declared on `ChatScope` in `toolDefs.ts` (round 2's defeat) | green ✗ | **fails ✓** |
| `callId` declared on `ModeFacts` in `mode.ts` (round 3's defeat) | green ✗ | **fails ✓** |
| nothing injected | green | green (9/9) |

**What it proves, stated at its real strength** (the previous two statements of this were both too
strong): the id is READ in a value position somewhere in the consuming files. It does not prove the
read changes an answer — a read inside a dead branch would still pass. It fails **safe** in the
other direction too: a destructured read (`const { companyId } = scope`) has no dot and would be
reported as an orphan. No consumer uses that form today; if one appears, the test fails loudly and
asks the author to widen the pattern. A false alarm, never a false pass.

## WARNING — the same instance/class mistake, in the chip row

Round 2 changed the two *inner* branches to gate on `companyId` instead of `companyName`, but the
*enclosing* row condition still asked for `companyName`. On the old route — project chat, where
`useV2` is false and `shownMode` cannot rescue it — a real company scope with a missing name still
rendered nothing, and the inner fix never got to run. `companyId` now leads that condition.

## NIT — a second opinion beside the choke point, again

The freshly persisted turn wrote `truncated: outcome.incomplete != null` inline, one screen below
the history mapper where the identical inline guess had just been removed for missing a field.
Both now ask `truncatedForPersist`.

## The honest summary of this branch's review history

Three rounds, and the recurring failure was not any single defect — it was **claiming a class was
closed when only an instance was**. It happened to the mode chip (fixed the chips, missed the
hint), to the scope guard (twice), and to the chip row (fixed the inner branches, missed the
outer). Two of those overclaims were written into this evidence file as proof, which is the part
that matters: `docs/case-history` exists because a mechanism that looks stronger than it is, is
worse than one honestly marked partial. Both false sentences above are marked corrected in place
rather than deleted.

## Battery after round 4

**986/986 green**, `tsc` clean.
