# Live‑UX Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB‑SKILL: superpowers:executing-plans. Each task = its own commit on
> `feat/live-phase2` (founder tests after). All user‑facing text is **locale‑aware** (EN/HE dictionaries).

**Goal:** 8 founder‑requested polish items on the live view after the 3‑min real test. Confirmed verbally.

**Files:** `src/lib/i18n/dictionaries/{en,he}.ts`, `src/components/live/LiveBroadcastView.tsx`,
`src/components/live/LiveSession.tsx`, `src/components/live/MediaPlayer.tsx`, `src/app/api/chat/route.ts`.

---

### Task A — Header + sub‑toolbar (commit 1)
- [ ] i18n keys under `live`: `endedStatus` = "Sourced Investor Call ended, AI is processing your transcript"
  (HE: "שיחת המקור הסתיימה, ה‑AI מעבד את התמלול"); `behindLive` = "behind the sourced Investor Call"
  (HE: "מאחורי שיחת המשקיעים המקורית"). Add to BOTH en.ts + he.ts.
- [ ] **Ended status stays top‑right:** when `liveEnded`, the top‑right element shows the gray
  `dict.live.endedStatus` (full sentence), not "הסתיים". While airing it stays the red LIVE pill.
- [ ] **Behind‑live text (top‑left, by company/quarter):** render `-{fmt(behind)} {dict.live.behindLive}`
  (locale‑aware) and style it **distinct from the date** — a subtle pill (`rounded-full bg-subtle px-2
  py-0.5 text-2xs text-ink-muted`) so it doesn't read like the plain date text.
- [ ] **Remove** the `חזרה לשידור החי` sub‑toolbar button (redundant with the play‑bar LIVE label).
- [ ] tsc → commit `feat(live): top-right ended status text + distinct localized behind-live; drop return-to-live button`.

### Task B — Notification cards (commit 2)
- [ ] **Call‑ended (processing) card:** make it **subtler** — smaller (`text-xs`), lighter, less padding,
  more muted (it's a status, not a CTA).
- [ ] **Ready + failed cards:** change the orange `bg-[#C04A00]` action buttons → **black** (`bg-ink`).
- [ ] tsc → commit `feat(live): subtler call-ended card; black (not orange) action buttons`.

### Task C — Counter / pre‑roll message (commit 3)
- [ ] i18n key `live.buffering` = "We buffer {min} minutes from the sourced Investor Call to generate a live
  transcript" (HE: "אנחנו משהים {min} דק׳ משיחת המקור כדי להפיק תמלול חי"). Interpolate `{min}` =
  `Math.round(delaySec/60)`.
- [ ] LiveBroadcastView overlay `overlayMsg` (buffering branch) → locale‑aware via the key.
- [ ] tsc → commit `feat(live): localized buffer/pre-roll message`.

### Task D — Chat GPT‑4.1 fallback (commit 4)
- [ ] In `/api/chat`, when Gemini's `streamGenerateContent` fails (network error OR `!upstream.ok`), fall
  back to **OpenAI GPT‑4.1 streaming** (`OPENAI_API_KEY`, model `gpt-4.1`) — same system+context+history,
  re‑emit OpenAI SSE `choices[].delta.content` as the plain‑text stream. Mirror transcription.ts's fallback
  intent. Keep `x-chat-source`.
- [ ] tsc → commit `fix(chat): GPT-4.1 streaming fallback when Gemini is unavailable`.

### Task E — Play‑bar LIVE pinned far‑right (commit 5)
- [ ] In `MediaPlayer`, when `isLive`, render the scrubber **fill + thumb pinned to the far right (100%)**
  from the first frame — not `currentTime/duration` (which is ~0/0 at join and drifts in). Seeking still
  works (a seek leaves the live edge → not live‑pinned). The "LIVE" label already sits far‑right.
- [ ] tsc → commit `fix(live): pin play-bar LIVE/playhead to far-right while live (YouTube-style)`.

### Task F — Verify
- [ ] `tsc` clean · `npm test` · clean `next build`. Update PROGRESS.md. Restart engine + dev (3‑min) for the test.

## Self‑Review
- A→top-right ended text + localized distinct behind + button removed. B→subtle card + black buttons.
  C→localized pre-roll. D→chat fallback. E→play-bar pin. ✓ Each isolated + revertible.
- All new strings via en/he dicts (no hardcoded user text). Play-bar pin is `isLive`‑gated (no effect on
  finished view). Chat fallback is additive (Gemini path unchanged on success). ✓
