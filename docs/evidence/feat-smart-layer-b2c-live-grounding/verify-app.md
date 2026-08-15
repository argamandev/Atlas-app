# /verify-app — 08c-2, live-caption grounding

Branch `feat/smart-layer-b2c-live-grounding`. Verified 2026-08-15, founder's Chrome via MCP,
dev server on `:3000`, replay engine on `:8788`.

## What was driven, and against what data

**A real recorded call, not a fixture.** `scripts/out/sessions/2026-07-04-real-zoom-2/`
(12MB PCM, 19 caption lines, genuinely mixed Hebrew/English speech) replayed through
`scripts/live-replay-engine.mjs` at `REPLAY_OFFSET=180` — so the call was mid-flight and the
live edge advancing, which is the only state this ticket's code runs in.

A first attempt at `REPLAY_OFFSET=400` put the edge past the 381s end, so the engine reported
`liveEnded: true` immediately and the surface was a FINISHED call — the wrong surface. Recorded
because the screenshot of it would have looked like a pass.

URL: `/app/live/live?delay=5`, joined via "כניסה לשידור עכשיו".

## Results

| Check | Result |
| --- | --- |
| Panel opens on a live call, HE | ✅ |
| Caption line reads "אטלס עוקב אחרי השיחה בשידור חי" (`askFollowLive`) | ✅ — driven by `grounding.kind === 'live'`, the new path |
| HE question, answer grounded in the CAPTIONS | ✅ — quoted the actual caption text back ("די מטורף מה שמתחיל לקרות פה"), named Context 7 / MCP |
| The answer is HONEST about what the call has not said | ✅ — "השיחה עדיין לא הגיעה לתוכן פיננסי או עסקי ממשי", unprompted |
| Locale flip to EN — layout, panel side, caption copy | ✅ — LTR, panel right, "Atlas is following this call live." |
| EN question, second turn | ✅ — "לא. עד לנקודה הזו בשיחה לא נאמר דבר על הכנסות (revenue) או שיעורי רווחיות (margins)" — true of these captions |
| Bidi in the answer (Hebrew prose carrying `Context 7`, `MCP`, `(revenue)`) | ✅ — zoomed and read; Latin runs sit correctly inside RTL sentences |
| Console errors | ✅ none |
| **Which backend actually served it** | ✅ `POST /api/chat/v2 200` — TWICE, once per turn, and NO `POST /api/chat` |

That last row is the one that matters most and is the easiest to assume: the whole ticket is
"this surface moves to v2", and every other check above would look identical if the old route
had quietly served both turns.

## EVERY state this surface can reach, each marked — enumerated BEFORE driving

The first version of this file wrote its gaps as a paragraph and silently omitted one of the
three new states, so the omission read as coverage. That is the recurrence that added step 8b to
the `/verify-app` skill; this is the list that step demands.

| State | Driven? |
| --- | --- |
| Live call, captions present, HE | ✅ driven |
| Live call, captions present, EN | ✅ driven |
| **No captions yet** (panel opened before the first caption) | ✅ **driven** — `REPLAY_OFFSET=-120`, zero lines on `/state`. Atlas answered "לא נקלט שום דבר מהשיחה… ברגע שיתחילו לדבר ותהיה תמלול זמין, אוכל לענות על סמך מה שבאמת נאמר" and did NOT answer from the corpus. This is the property the state exists for. |
| Captions truncated (`chat.liveTruncated`) | ❌ **NOT driven** — needs captions past `LIVE_BUDGET_CHARS` (60,000); the longest recorded session is ~27KB. Covered by `liveInjection.test.ts` (the cut, its direction, the label surviving, both routes agreeing on which half) and `loop.test.ts` (the event, and that the turn still answers). **A real two-hour call hits this first.** |
| Per-turn legacy fallback (snip / marked page on a live turn) | ❌ **NOT driven** — needs a report pane open on a live call. Covered by `turnRoute.test.ts` only. |
| Grounding refused (400) | ❌ not driven — unreachable from the UI now that the client bounds both the captions and the label. |
| Model/stream error beside a partial answer | ❌ not driven — unchanged by this ticket; existing panel behaviour. |

**Cost: not measured.** No `scripts/measure-chat-answer.mjs` run for a live-grounded turn. The
ticket's ≤$0.06/answer line is already known-red at 08c-1 ($0.1010 for a company-scoped turn) and
a caption injection is the same shape as the stuffed-call number, so this does not change the
red — but it has not been measured, and saying "unchanged" would be a claim nothing here made.

## Cleanup

`scripts/out/broadcast-*.pcm|jsonl` now hold the 2026-07-04-real-zoom-2 capture rather than the
tamis one they held before. Both are archived under `scripts/out/sessions/`, so nothing was lost.
