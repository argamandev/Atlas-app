# State — ivrit
<!-- Private working memory. Owner-only writes. Write before walking away; read at start. -->

## Verified facts
- M1 SHIPPED to ready queue 2026-07-04: feat/ivrit-pipeline pushed (018d8ad..c392fac, 16 commits).
- RunPod ivrit worker ACCEPTS base64 `blob` in transcribe_args (no storage churn needed for
  live chunks). Latency, 35s WAV on whisper-large-v3-turbo-ct2: cold ~16-21s, warm ~2.5s.
  Poll 1s. Response: [{result:[[segment,...],...]}] with per-word start/end when
  output_options.word_timestamps=true. Fixture: scripts/fixtures/ivrit-live-spike.json.
- Engine contract parity: app pages consume /api/live/{state,pcm} → LIVE_ENGINE_URL (:8788);
  ANY engine serving that shape drives the existing karaoke unchanged. Live page URL:
  /app/live/live?delay=<sec>.
- Karaoke viewer needs only {id, raw, words:[{text,start}]}, starts non-decreasing across the
  WHOLE stream (LiveAudioProvider flattens lines in arrival order — stitcher cursor guarantees it).
- Test bench: archive at C:/Users/Sagi/Desktop/Atlas/scripts/out/sessions/2026-07-01-tamis-live/
  (387s, speech-sparse smoke clip — fine for mechanics, NOT for quality extrapolation).
  Feeder: scripts/replay-audio-feeder.mjs (SRC/REPLAY_SPEED/START_REL envs).
- Quality on smoke clip: ours 146 tok / recall 106 / wholefile-ivrit 112; agreement 56.6%/60.7%;
  divergences = loanword spellings + filler repeats; NO chunking content loss; Recall had a
  Cyrillic-garbage stretch IVRIT avoided.
- tsconfig excludes scripts/ AND **/*.test.ts → tsc "clean" proves nothing about them (tsx
  strips, never checks). FOLLOW-UP FILED: tsconfig.scripts.json + @types/ws, wire into battery.
- Known shared limitation with the Recall engine (flagged by final review, NOT fixed): ws
  close permanently sets liveEnded (a Recall reconnect would end the broadcast); pcmChunks
  grows unbounded (~230MB per 2h call) + full Buffer.concat per /pcm hit. Address before real
  2h calls (M2).

## Lessons learned  <!-- general ones graduate into skills via the supervisor -->
- Founder AFK during a mandated brainstorm → proceed with best-judgment assumptions clearly
  flagged in the spec, keep the no-code hard-gate, block on his review — not on his presence.
- Worktrees don't carry .env.local and agents are hook-blocked from copying it; founder seeds
  it once per worktree via `! cp ...` (ALERT filed; LAUNCH-KIT should say it). Windows note:
  the `!` prompt is GIT BASH — `cp`, not `copy`.
- Cold-context per-task reviewers caught 2 real Important defects the plan's own code carried
  (chunk-granular fallback losing words in mixed chunks; working-flag stall on rare throw) —
  the review loop pays for itself, keep it.
- Real-data fixture (saved spike response) made stitcher tests catch what synthetic data
  wouldn't (9-segment chunks are the NORM, not an edge).
- TaskStop on `npm run dev` kills the wrapper, orphans the node child holding the port —
  Stop-Process the PID from netstat after.
- [2026-07-04 real-Zoom test lessons — graduation candidates for the supervisor:]
- (→ live rules / test invariants) Engines hold call state in module memory + browser tabs
  live for days = a whole CLASS of session-mixing bugs. New invariant every live viewer must
  hold: SURVIVE AN ENGINE RESTART under an open tab (reset, never mix). Now unit-tested
  (liveSessionChanged) and eyes-verified. The old Recall pipeline's viewer had this latent
  for weeks — only a REAL second call exposed it.
- (→ verify-app skill) Leave no test tabs behind: my verify-app tab from yesterday became
  the founder's broken viewer today (he reused the already-open tab, stale React state +
  stale ?delay=60). End every verify session by closing/navigating the MCP tab to blank.
- (→ live-test skill) The skill is written for the OLD engine. Ivrit variant differs: bot via
  scripts/start-ivrit-bot.mjs (audio-only, no transcript provider, no /recall webhook), dev
  :3002, first captions ~1min after speech (NO 72-203s Recall lag gotcha), engine has
  sessionId. Finish/polish flow IS wired since e2a8851 (same POST /api/live/finish path).
- (→ product/M2) Whisper pinned to language:'he' hallucinates polite Hebrew fillers (תודה
  רבה loops) on English/non-Hebrew speech — mixed-language handling is a real M2 item, not a
  pipeline bug.
- (→ RESOLVED 2026-07-04) Founder decided end-of-call UX = full parity with the Recall
  pipeline (drain → הסתיים → processing → finished call), delivered by the finish-flow wiring
  (e2a8851). A separate mid-drain "source ended" indicator was NOT requested beyond parity.
- Archive real-call captures IMMEDIATELY (engine holds PCM in memory only): first real call
  saved to scripts/out/sessions/2026-07-04-first-real-zoom/ before killing the engine.

## Last session
- [2026-07-04] M1 complete via subagent-driven-development (10 tasks, 2 fix loops, final
  whole-branch review READY TO MERGE). Pushed feat/ivrit-pipeline; ready-queue entry appended;
  board updated; :8788 released. SDD ledger: Atlas-ivrit/.superpowers/sdd/progress.md.
- WAITING ON: supervisor review/merge. M2 candidates for founder to prioritize: real-Zoom
  live-test · Gemini correction layer · diarization · ws-reconnect + PCM memory hardening.
- [2026-07-04 late] Finish flow WIRED (e2a8851): engine writes shared broadcast-* capture files
  + persists PCM; runLiveBroadcastFinish works unchanged over IVRIT output; e2e verified
  (replay -> ended -> finish -> completed -> finished page renders). End-of-call UX = full
  parity with Recall pipeline per founder decision. Engine killed after test; :8788 claim
  still held for the pending Zoom round-2 (release when done). Branch head e2a8851, pushed,
  ready-queue updated twice post-M1.
- [2026-07-04 round 2] REAL-ZOOM TEST PASSED WITH FOUNDER, end to end: 19 chunks all ON TIME
  (32-45 words/chunk on dense speech, 2.4-13.5s per chunk), karaoke live, source-end -> AUTO
  finish (page-triggered) -> completed -> finished call rendered. Founder: "works really
  really good". Session-reset fix held in the wild. Capture archived:
  scripts/out/sessions/2026-07-04-real-zoom-2/. :8788 released. MILESTONE FOUNDER-TESTED —
  supervisor can merge feat/ivrit-pipeline @ e2a8851.

[graduated → rules/live.md (2-engine + survive-restart invariant + M2 limits), verify-app (close test tabs), live-test (IVRIT variant), LAUNCH-KIT (.env seeding) — supervisor 2026-07-04; marker added 2026-07-14 under the new parallel-work exception]
