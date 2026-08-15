# Cold review — 08c-2, live-caption grounding

`atlas-reviewer`, fresh context, against `main`.

VERDICT: CHANGES
REVIEWED: 0b791cc

Every finding below is answered, and the answers landed in `1e45e30`. The branch was re-run
green afterwards: battery 1090/1090, `tsc` clean, `next build` clean, and `/verify-app` driven
against a real replayed call in both locales (`verify-app.md` beside this file).

---

FINDING · BLOCKER · no `/verify-app` evidence for a surface that changed backend

The live panel changed which route serves it and gained three states nobody had rendered — "no
captions yet", the `liveTruncated` notice, and the per-turn legacy fallback — with no browser
evidence in either locale, and no cost measurement for a 60,000-char per-turn injection against
the ticket's $0.13 line.

RECURRENCE: no

ANSWERED: driven end-to-end against `2026-07-04-real-zoom-2` replayed mid-flight, both locales.
`POST /api/chat/v2 200` twice with no legacy call — the row that matters, since every other
check would look identical had the old route quietly served both turns. `verify-app.md` also
names the three things NOT reached in a browser, rather than letting a green battery imply them.

---

FINDING · WARNING · `turnRoute.ts` — empty captions leaked a different grounding

On the legacy fallback `legacyLiveContext` returns `''`, and the old route read
`body.liveContext || undefined` — so an empty string became "no live context" and fell through
to a **company lookup**, while the panel's caption still said "Atlas is following this call
live". A grounding the screen promises and the backend silently swaps.

RECURRENCE: yes → app.md, "Degradation must be VISIBLE — never render success UI for content the
server dropped"

ANSWERED at the choke point rather than in the branch (M3.1): the old route now TYPE-checks that
field instead of truthiness-checking it, so empty stays empty everywhere it is read, and it tells
the model "(this call is live, but nothing has been transcribed yet)" rather than substituting
the corpus. Mechanism: the type check, plus `turnRoute.test.ts` pinning that `''` survives the
handoff. Worth naming for the next occurrence — the lie happened one module away from the fact,
which is why nothing local to either module could have caught it.

---

FINDING · WARNING · `LiveBroadcastView.tsx` — a long call would have 400'd every question

The client held the entire caption stream and sent all of it every turn, so once a call passed
`LIVE_CAPTIONS_MAX_CHARS` the gate refused and every question failed with the route's English
"this grounding cannot be honoured" inside a Hebrew panel. The case that broke is exactly the one
`buildLiveBlock`'s front-truncation exists to serve: the gate refused before the truncation could
ever run.

RECURRENCE: no

ANSWERED: `clientCaptionPayload` bounds the payload at the request ceiling, keeping the END — the
same direction the server cuts. `turnRoute.test.ts` asserts a genuinely over-ceiling payload now
passes `parseGrounding`, AND that the client bound stays ABOVE the injection budget: capping at
the budget would have meant the server never sees more than it can carry, so it would never
report `truncated`, deleting the notice from the screen while the degradation grew. The shape to
watch: a validator and a budget for the same value, set in two modules, with nothing asserting
their relationship — that assertion is now a test.

---

FINDING · NIT · `TranscriptChatPanel.tsx` — the truncation kind is read off the prop

Which half of the call was dropped comes from the live `grounding` prop, not stored per message.
Safe only because this panel persists nothing, so there is no reload for the fact to survive.

RECURRENCE: no

NOT FIXED, deliberately: the fix is per-message storage, which is only correct once the panel has
a thread to reload. The render site carries a comment naming the condition that makes it wrong,
next to the code that would have to change.

---

FINDING · NIT · the ticket's own status line still called 08c-2 open

RECURRENCE: no

ANSWERED — the ticket now records it as built, with what is still owed spelled out.

---

## Explicitly cleared by the reviewer

- **Prompt injection.** Captions reach only the fenced user turn (`loop.test.ts` asserts they are
  absent from `system`); the label is length-bounded, newline-refused, defanged and quote-escaped
  on the fence attribute line; `LIVE_SCOPE_SUMMARY` is a constant asserted to carry no
  interpolation.
- **"Accepted ⇒ consumed" for a recipe the file scan cannot see.** The scan in
  `requestScope.test.ts` looks for scope IDS; live captions are content. The reviewer confirmed
  the behavioural coverage in `loop.test.ts` is load-bearing rather than decorative — it asserts
  the caption text is in the message the client received, the `grounding` event, and the
  source-pool seeding.
- No DB changes, no secrets, no Wave-2 gateway imports, scope clean.
