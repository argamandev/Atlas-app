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
