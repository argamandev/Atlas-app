# Cold review — 08c-2, live-caption grounding

`atlas-reviewer`, fresh context, against `main`. Verdict on the first pass: **CHANGES**.
All findings below are answered; the branch was re-run green afterwards (1090/1090, `tsc`,
`next build`).

## FINDING · BLOCKER · no `/verify-app` evidence
The live surface changed backend, gained a "no captions yet" state, a new `liveTruncated`
string and a per-turn legacy fallback, with no browser evidence in either locale.
**RECURRENCE: no** — this is the standing acceptance gate, not a law that failed.
**ANSWERED:** driven end-to-end against a real recorded call replayed mid-flight, both locales.
`docs/evidence/.../verify-app.md`, including the three states it did NOT reach and why.

## FINDING · WARNING · `turnRoute.ts` — empty captions leaked a different grounding
On the legacy fallback, `legacyLiveContext` returns `''`; the old route read
`body.liveContext || undefined`, so an empty string became "no live context" and fell through
to a **company lookup** — while the panel's caption still said "Atlas is following this call
live". A grounding the screen promises and the backend silently swaps.
**RECURRENCE: yes → `app.md`, "Degradation must be VISIBLE. Never render success UI for content
the server dropped."**
**ANSWERED, and at the choke point rather than in the branch (M3.1):** the old route now
TYPE-checks that field instead of truthiness-checking it, so empty stays empty everywhere it is
read, and it tells the model "(this call is live, but nothing has been transcribed yet)" rather
than substituting the corpus. The mechanism is the type check plus `turnRoute.test.ts` pinning
that `''` survives the handoff — the previous shape could not have been caught by a test,
because the lie happened one module away from the fact.

## FINDING · WARNING · `LiveBroadcastView.tsx` — a long call 400'd every question
The client held the entire caption stream and sent all of it every turn, so once a call passed
`LIVE_CAPTIONS_MAX_CHARS` the gate refused and every question failed with the route's English
"this grounding cannot be honoured" inside a Hebrew panel. The case that broke is exactly the
one `buildLiveBlock`'s front-truncation was written for: **the gate refused before the
truncation could ever run.**
**RECURRENCE: no** — new code, new bound. Worth noting as the shape to watch: a validator and a
budget for the same value, set in two modules, with nothing asserting their relationship.
**ANSWERED:** `clientCaptionPayload` bounds the payload at the request ceiling, keeping the END
(the same direction the server cuts). `turnRoute.test.ts` asserts a genuinely over-ceiling
payload now passes `parseGrounding`, **and** that the client bound stays ABOVE the injection
budget — because capping at the budget would have made the server never report `truncated`,
deleting the notice from the screen while the degradation grew.

## FINDING · NIT · `TranscriptChatPanel.tsx` — truncation kind read off the prop
Which half was dropped is read from the live `grounding` prop, not stored per message. Safe only
because this panel persists nothing.
**RECURRENCE: no. NOT FIXED, deliberately** — the fix is per-message storage, which is only
correct once the panel has a thread to reload. The comment at the render site names the
condition that makes it wrong, next to the code that would have to change.

## FINDING · NIT · the ticket's own status line
Still called 08c-2 open on the branch implementing it. **RECURRENCE: no.** **ANSWERED.**

## Explicitly cleared by the reviewer
- **Prompt injection.** Captions reach only the fenced user turn (`loop.test.ts` asserts they
  are absent from `system`); the label is length-bounded, newline-refused, defanged and
  quote-escaped on the fence attribute line; `LIVE_SCOPE_SUMMARY` is a constant asserted to
  carry no interpolation.
- **"Accepted ⇒ consumed" for a recipe the file scan cannot see.** The scan in
  `requestScope.test.ts` looks for scope IDS; live captions are content. The reviewer confirmed
  the behavioural coverage in `loop.test.ts` is load-bearing rather than decorative — it asserts
  the caption text is in the message the client received, the `grounding` event, and the
  source-pool seeding.
- No DB changes, no secrets, no Wave-2 gateway imports, scope clean.
