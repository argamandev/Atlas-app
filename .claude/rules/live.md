# Live-engine law & gotchas (read before touching live code)

- TWO engines exist, both serving the same `/state`+`/pcm` contract on :8788 (SINGLE-OWNER —
  claim in cross-cutting before starting): `scripts/live-broadcast.mjs` (Recall captions) and
  `scripts/live-ivrit-broadcast.ts` (audio-only bot → IVRIT/RunPod chunks, run via tsx). The
  app viewer doesn't care which one is up.
- Both engines hold call state in module memory, NO reset — restart for every clean test.
  `scripts/out/broadcast-*` = the CURRENT call's capture from EITHER engine (truncated per
  run; archive captures you care about to `scripts/out/sessions/` IMMEDIATELY — PCM lives
  only in engine memory until the run's files are written).
- **Viewer invariant — SURVIVE AN ENGINE RESTART under an open tab** (browser tabs live for
  days; module-memory engines restart between calls = a whole class of session-mixing bugs).
  `/state` carries `sessionId`; `LiveAudioProvider` resets via `liveSessionChanged()` (reset,
  never mix). Any new viewer/engine MUST keep this invariant, unit-tested (liveTiming.test.ts)
  — and the reset must NOT fire on the `/api/live/state` offline fallback (`st.offline`).
- STALE BROWSER BUNDLE is the #1 gotcha: hard-refresh (Ctrl+Shift+R) after every dev restart.
  MODULE_NOT_FOUND 500 = stale `.next` → kill dev, `rm -rf .next`, restart.
- Recall accuracy-mode captions lag 72–203s — the buffer absorbs it; it is NOT a bug. The
  IVRIT engine has no such lag (first captions ~1min after speech).
- IVRIT/Whisper pinned to `language:'he'` hallucinates polite Hebrew filler loops (תודה רבה)
  on English/non-Hebrew speech — mixed-language handling is an M2 product item, not a bug.
- Known shared limitation (both engines, fix before real 2h calls): a ws close permanently
  sets `liveEnded` (no reconnect), and PCM accumulates unbounded in memory (~230MB per 2h).
- Buffer = `NEXT_PUBLIC_LIVE_BUFFER_SEC` (inlined at dev-server start; restart to change).
- Gemini live correction: `thinkingBudget: 0` is mandatory (thinking leaks into captions);
  paid tier mandatory (free tier 429s under live load).
- The model: a call is LIVE (incl. buffer drain at 1×) or FINISHED — no "processing" surface.
- Cloudflared tunnels are founder-run only and expire — never reuse an old tunnel URL.
