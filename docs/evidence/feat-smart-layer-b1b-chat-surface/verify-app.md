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
