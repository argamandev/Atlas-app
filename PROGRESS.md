# PROGRESS.md

Decision log across sessions — what shipped and *why*. Newest first. Keep entries to ~3-5 bullets.
For the project overview, stack, and conventions, see `CLAUDE.md`.

---

## 2026-07-02 — Timlul Wave 1 DELETED (clean-start Phase 1) — merged to main, pushed

**Status:** merged to `main` (`bd7a951`) and pushed to `Atlas-app`. −2,584 lines / 29 files, +3 lines.
Verified: `tsc` clean · 45 tests · clean `next build` (34 routes) · founder click-through · **a real
Recall+Zoom live test end-to-end on the cleaned tree** (bot → captions → 4-min buffer → drain →
finish `completed`, correct call: 2026-07-01, 382.6s).

- **Deleted per `LEGACY.md` Wave 1:** legacy routes (`/home /dashboard /companies /processing /transcript`),
  components (`landing dashboard transcript processing companies platform layout`, `ui/Button`, `ui/Badge`),
  orphaned `useProcessingTimer`, and `src/middleware.ts` (its matcher only guarded deleted legacy routes).
- **Login repointed first** (the trap the guard test can't see — string navigation): `LoginForm` +
  `auth/callback` redirected to the legacy `/dashboard` → now land on **`/app/home`**. PROGRESS had
  claimed this was already done; the code disagreed — fixed for real now.
- **Wave 2 gateway kept** (4 files: `/` page, `LoginForm`, `JoinForm`, `dotted-surface`) until Atlas
  has its own login/landing.
- **Flagged for a dedicated pass (not fixed here):** `/app/*` has no middleware auth gate (the deleted
  middleware never covered it either — pre-existing); ARCHITECTURE.md still lists deleted files
  (Phase 4 rewrite covers it).

---

## 2026-06-27 — "Latest call" shows the just-ended call during finish + SHIPPED to production

**Status:** **Pushed to `origin/main` → deployed to timlul-ai.com** (Global Live Call + this fix together), after a
cold-context `reviewer` pass returned **SHIP**. `tsc` clean · 44 tests · clean `next build`.

**Fix:** the company "Latest call" was hard-filtered to `status='completed'`, so a just-ended call (in `processing`
for the drain+polish window) was missing from that slot until the polished transcript landed. New pure helper
`companyLiveDisplay()` (`liveTiming.ts`, unit-tested) + `CompanyOverview` now polls `/api/live/finish` and surfaces
the in-flight call as "Latest call" linked to the live/raw view, then `router.refresh()`es to the finished row when
polishing completes. i18n `live.preparing`.

**Reviewer follow-ups (non-blocking, deferred — none break correctness):**
- *HIGH (tech debt):* `LiveAudioProvider` puts 10fps values in context → its consumers re-render 10×/s. Safe today
  (page tree referentially stable), but port `PlayerProvider`'s `useSyncExternalStore` pattern before adding more consumers.
- *MEDIUM:* recorded + live global bars/chips can overlap if both are active at once (rare); `live.active` doesn't
  auto-clear when a call is fully `over` while the user is away (bar/chip linger, engine keeps polling); `endedInFlight`
  stays true on a `failed` polish (shows "being prepared" forever) — treat `failed` like `completed`.
- *LOW/NIT:* unused `getPlayingRel`; "Return to live" copy after `over`; `?delay=` override sticks across re-`start()`.

---

## 2026-06-22 — Global Live Call: live audio persists across navigation — LIVE-TESTED ✓, SHIPPED

**Status:** **Shipped to production (origin/main) on 2026-06-27** after a real live Zoom test (2026-06-26) + a passing
reviewer pass. `tsc` clean · 44 tests · clean `next build`. Plan: `docs/superpowers/plans/2026-06-20-global-live-call.md`.

**Live test (2026-06-26, real Zoom call — תמיס Q2 2026, ~8 min):** PASSED end-to-end. Joined at the live edge →
**navigated across the app with audio still playing** + the **"Return to live"** chip brought you back → source
ended → buffer drained → finish pipeline produced the correct organized transcript (תמיס, Q2 2026, ~8.1 min,
real audio). The crown-jewel feature held up; the engine relocation didn't regress the live experience.

**Known follow-up (non-blocking):** the "call ended → trigger finish pipeline" effect lives on the live *page*
(`LiveBroadcastView`). If a user is navigated **away** at the moment a call ends, the finish/auto-swap won't
fire until they return to the live page. Fine at single-call scale; handle before report-season concurrency.

**Build-time decision NOTE:** branched off the *old* `main` (031164e), parallel to the design overhaul
`feat/atlas-ui-kit` (also unmerged). The design work did **not** touch the 3 core global-live files; reconcile
`feat/atlas-ui-kit` onto the new `main` next.

**What shipped (mirrors the recorded global player):**
- **`LiveAudioProvider`** (`src/lib/live/LiveAudioProvider.tsx`) — app-shell context that OWNS the live
  Web-Audio engine (AudioContext, `/api/live/state` poll, PCM pump, 100ms ticker, buffer/drain math). Engine
  internals moved **verbatim** out of `LiveBroadcastView` (relocation, not rewrite); added a `start/join/stop/
  active` lifecycle + `viewing`/`chatOpen` flags. Mounted in `app/app/layout.tsx` beside `PlayerProvider`.
- **`LiveBroadcastView` is now a consumer** — deletes its engine, reads state + controls from `useLiveAudio()`.
  UI is byte-for-byte the same. Starts the engine on mount (idempotent), flags `viewing` so the global bar/chip
  hide while on the live page, and tears the engine down on unmount **only when the call is fully over** (drain
  done → swap to finished); plain navigation leaves it running so audio persists. `LiveSession`'s finish
  pipeline is unchanged (`onSourceEnded`/`onLiveOver` still fire from provider `liveEnded`/`over`).
- **`GlobalLiveBar` + `ReturnToLiveChip`** in `ShellChrome`, gated on `active && !viewing` — navigate away from
  the live page and the audio bar docks at the bottom (its ✕ ends the call) with a "Return to live" chip back to
  `/app/live/live`, audio playing the whole time. i18n `live.returnToLive` (EN/HE).

**Build-time decision (plan flagged "one bar vs two"):** chose **Option B** — the live page keeps its existing
in-column bar; the global bar shows only once you leave it. Lowest-risk to the crown-jewel live page (its
layout/overlay/bar are untouched); both bars read the same provider so the playhead is continuous. Can unify to
a single persistent bar later if desired.

**Live-test checklist (with founder):** join a real Zoom call → audio + captions sync → navigate Home/Company/
Chat with audio still playing → "Return to live" chip brings you back at the live edge → source ends → drains →
auto-swaps to the finished transcript (live engine stops, recorded player takes over, no double audio).

---

## 2026-06-20 — Transcript UI polish (live + offline) — BUILT, AWAITING FOUNDER REVIEW

**Status:** On branch `feat/transcript-ui-polish` (off `main`). **8 commits**, each isolated. `tsc` clean ·
43 tests · clean `next build`. **NOT pushed/merged** — founder reviews at `:3000` first, then we push + I
review/test. Spec/plan: `docs/superpowers/plans/2026-06-20-transcript-ui-polish.md`.

**Changes (founder-approved):**
- **Chat button on Live** — opens the existing Ask-Atlas side panel directly (no selection needed).
- **Yellow text selection** in both views — `.select-mark ::selection` on the shared `TranscriptBody`
  (the *act of selecting* text → highlighter yellow; karaoke highlight unchanged).
- **Live notification** — appends "On our platform the call is still LIVE until we finish the 4-minute
  buffer." and **no longer auto-dismisses** (reverts the 5s close; stays until ✕).
- **Minimizable speaker/timeline panel** (offline) — collapses to a thin rail like `CollapsiblePanel`.
- **Removed two dead buttons** (offline) — the auto-scroll toggle (redundant now: the scroll-pause + "↓ Back
  to current" chip manages it) + the page-refresh.
- **Copy icon shows a "T"** (offline) — `CopyTextIcon`.
- **Universal audio-bar fix** — the "white block" was `ShellChrome`'s full-width reserved band (`pb-[84px]`);
  removed it so side panels run full-height + the black pill floats (the pill itself unchanged). Transcript
  scroll areas keep their own transparent bottom padding so last lines clear the pill. Bar is now **chat-aware**
  (`chatOpen` on the player context → `MediaPlayer` adds `lg:pe-[396px]`), so the offline chat opens like Live
  — and Live inherits it when it later adopts the global bar.

**Founder review (2026-06-20): looks good.** 4 follow-ups queued on the SAME branch before push (#1/#2 are
fixes to this pass): (1) finished view — chat open should **minimize** the speaker panel (it currently
unmounts it); (2) the offline chat button should **open the side panel**, not navigate to `/app/chat`;
(3) a slick **"Open audio bar"** chip to reopen the docked bar after ✕ (resume position, no refresh);
(4) **drag-to-scrub** the audio timeline (currently click-only). Still verify: Home/Chat bottom content behind
the floating pill.

**Pipeline ahead (founder's framing):** finish this UI polish → **make the LIVE audio bar global** (hear the
call across pages, like the offline player) → then the **second big part: a more advanced investor-call
product built on top of this layer.**

---

## 2026-06-20 — feat/live-phase2 SHIPPED to main (real Zoom test passed)

**Status:** `feat/live-phase2` **merged to `main`** and pushed to GitHub after a successful real Recall + Zoom
test (~13-min תמיס call, 4-min buffer). 21 commits. `tsc` clean · 43 tests · clean `next build`. Branch deleted.

**What the live test confirmed:**
- **Keep-LIVE-through-the-buffer-drain works** — the view no longer cuts off when the source audio stops; it
  stays live and drains the buffer, then becomes a finished recording → auto-swaps to the organized transcript.
- **The wrong-transcript bug is fixed (capture reset).** The finished transcript was unmistakably THIS call
  (תמיס, ~13 min, 1,400 words, fresh opening *"טוב, אנחנו ממש עכשיו מתחילים…"*) — not the old accumulated pile.
- Finish fired at source-end and completed; Home/company stay live through the drain; the "AI is processing"
  card auto-dismisses after 5s.

**Shipped this branch (detail in the dated entries below):** free-recording-after-end + 3 bug fixes · the
8-item UX polish pass · keep-LIVE-through-the-buffer-drain + clean finish · **new: pause-auto-scroll-on-manual-
scroll + "↓ Back to live / Back to current" chip** in the shared `TranscriptBody` (covers BOTH live + finished
pages; wheel/touch detection so our own programmatic scroll never trips it). Note: Recall accuracy-mode caption
lag (big batches every ~2–3 min, first ~3 min) is inherent — the buffer absorbs it (captions ran ~178s ahead
of playback during the test).

**Next:** founder's slight visual refinements (a fresh small branch each).

---

## 2026-06-19 — Keep LIVE through the buffer drain → clean finish (SHIPPED to main 2026-06-20)

**Status:** On `feat/live-phase2` (NOT merged). **7 commits** (test + engine + route + 4 UI). `tsc` clean ·
43 tests · clean `next build`. Founder-driven after a real 4-min-buffer test confirmed the abrupt cutoff.
Spec `docs/superpowers/specs/2026-06-19-live-keep-through-buffer-design.md`; plan `…/plans/2026-06-19-…md`.

**The model now:** a call is **LIVE** (incl. the buffer drain) or **FINISHED** — no "processing" surface.
This **reverts the free-recording cutoff**: when the source audio stops, the view STAYS live and drains the
buffer at 1x (re-wiring the still-tested `delayedLiveEdge`/`hostedLiveOver`/`viewerEnded` helpers); only when
the buffer fully drains does it flip to a finished recording → auto-swaps to the organized transcript when
ready (raw "default text" until then). The engine now exposes `endedAt` so every client computes the same
drain end (source-end + buffer).

**Commits:** `test(live)` drain+over compose · `feat(live-engine)` expose `endedAt` + **reset capture files
per run** (fixes the wrong/accumulated finished transcript) · `feat(live)` state proxy passes `endedAt` ·
`feat(live)` LBV keeps LIVE through the drain, raw "over" recording at drain-end (header LIVE→no-badge, the
#1 "ended" text now lives only in the card) · `feat(live)` LiveSession drain-end auto-swap + raw-until-ready
+ **5s card auto-dismiss** · `feat(live)` Home + company stay LIVE through the drain.

**Known minor gap (flagged):** a user who navigates away and returns in the narrow post-drain/pre-organized
window (~1–2 min) — the in-view + during-drain paths are fully covered; the latest-call-link-before-organized
is a small optional follow-up. **Next:** founder live Zoom test → if good, merge `feat/live-phase2` to `main`.

---

## 2026-06-18 — Live UX polish pass: 8 founder-requested refinements (SHIPPED to main 2026-06-20)

**Status:** On `feat/live-phase2` (NOT merged). **5 isolated commits** on top of the free-recording pass,
each independently revertible. `tsc` clean · 42 tests pass · clean `next build`. Awaiting the next live test.

**The 8 refinements (5 commits):**
- **`8b0ec74`** — header: the **top-right status** now shows the full localized "Sourced Investor Call ended,
  AI is processing your transcript" once the source ends (was just "הסתיים"); the **behind-live** chip is now
  localized (EN/HE) and styled as a distinct subtle pill (not plain date text); the redundant
  **"חזרה לשידור החי"** sub-toolbar button is gone (the play-bar LIVE label covers it).
- **`d1612d1`** — the floating **call-ended card** is subtler/less dominant (smaller, muted, lighter); the
  **action buttons are black** (`bg-ink`) instead of orange.
- **`5a4c7f3`** — the **buffer/pre-roll counter** message is localized (EN: "We buffer 3 minutes from the
  sourced Investor Call to generate a live transcript").
- **`bbf90e5`** — **chat GPT-4.1 fallback**: when Gemini is down/blips, `/api/chat` streams from OpenAI
  `gpt-4.1` instead (same system+context+history) so the live chat doesn't die mid-call (`x-chat-fallback`).
- **`29a1ae5`** — the **play-bar LIVE/playhead is pinned far-right** from join (YouTube-style); a real
  seek-back (>2s behind the edge) lets the thumb track position again.

**All user-facing strings go through the en/he dictionaries** (`live.endedStatus` / `live.behindLive` /
`live.buffering`). The notification cards stay English by design (institutional). **Plan:**
`docs/superpowers/plans/2026-06-18-live-ux-polish-pass.md`. **Next:** live test → if good, merge to `main`.

---

## 2026-06-18 — Live UX: free-recording-after-end + 3 bug fixes (SHIPPED to main 2026-06-20)

**Status:** On `feat/live-phase2` (NOT merged to `main`). Checkpoint `c36d3e2` + **3 isolated fix commits**,
awaiting the founder's feature‑by‑feature live test (test 1 → 3 → 2; `git revert` any single one that
misbehaves). Temp debug code stripped. `tsc` clean · tests pass · clean `next build`.

**Redesign (founder‑driven, after real 3‑min Zoom tests):** the end‑of‑call is now a **free recording**, not
a draining edge — once the SOURCE ends, the whole captured buffer is a normal recording the viewer roams
freely (badge → gray "הסתיים", LIVE button gone, scrubber = the full call). The finish fires and the
organized transcript is offered via a **button** (no forced auto‑swap). Hard lesson from the multi‑hour
chase: a **stale browser bundle** masked every fix — always hard‑refresh after a dev restart.

**The 3 fixes (commits, in test order):**
- **1 `2141360`** — LIVE/ended badge moved **top‑right** (grouped with close); a "waiting for live captions…"
  placeholder when joined before Recall's first batch (accuracy mode lags 72–188s).
- **3 `0739635`** — removed the inline banner that blocked text; finish status now shows as **floating,
  dismissible (✕) frosted‑light Apple cards** (processing / ready+View / failed+retry) + a gray header badge.
- **2 `16d7778`** — live **"Ask Atlas" grounds on the on‑screen captions** (`liveContext` → `/api/chat`); and
  `getChatContext` no longer falls back to a **different company** when a companyId is set (the wrong‑company
  bug). Finished view + global `/chat` unaffected (additive).

**Plan:** `docs/superpowers/plans/2026-06-18-live-ux-three-bugs.md`. **Next:** founder's live test → if good,
sync `main` + merge; then 2C (quote‑anchor) / 2D (HLS migration per the Quartr research).

---

## 2026-06-17 — 2B toolbar + live-flow bug chase; seamless live→organized hand-off (AWAITING FOUNDER TEST)

**Status:** Phase **2B (toolbar on the live view) DONE + founder-approved**. Three live-flow bugs found and
fixed during real Recall Zoom tests. The final UX gap — the live experience ending abruptly when the buffer
drains — is **fixed (auto-swap into the organized transcript) and self-verified; awaiting the founder's joint
test** (they're back 2026-06-17). Branch `feat/live-phase2`, **NOT yet committed**; temporary diagnostics
still in place (remove before commit).

**Shipped this session (all on `feat/live-phase2`):**
- **2B — toolbar on live** (`LiveBroadcastView`): highlight a live caption → Save Quote / Ask Atlas / Share,
  mirroring the finished page (reuses `TranscriptChatPanel` + `createQuote` + `TranscriptBody`).
  Live-specific: quote `transcriptId:null` + live-playhead `startSec`; chat `transcriptId=undefined`;
  WhatsApp-only share.
- **Bug A (mid-call CTA):** "View organized" appeared mid-live because the finish poll keyed on the reused
  static call id with a stale `completed` row. Fixed: gate the finish UX on THIS session's `sourceEnded`.
- **Bug B (wrong finished transcript):** the organized view was the old demo, not this call. Fixed —
  `runLiveBroadcastFinish` (`finishLiveCall.ts`) reads THIS airing's captured `broadcast-*.{jsonl,pcm}`,
  waits for Recall's trailing captions to catch up to the audio, re-finishes the current call;
  `POST /api/live/finish` re-finishes unless one is in flight. Proven server-side (Q2 2026 / 221s / 347 words).
- **Bug C (buffer didn't survive source-end) — the big one:** replaced the fragile `endedWall`/
  `delayedLiveEdge` drain-ramp with a **plain recording playthrough** (once `liveEnded`, the whole buffer is
  playable; `ended = viewerEnded` only when the playhead reaches the true end). **The real blocker was a
  STALE BROWSER BUNDLE** — cached old JS meant no fix or instrumentation ever loaded across dev restarts.
  After a hard refresh, an auto-trace (`/api/live/debug`) proved the drain works (`behind` 50→0 at 1×, audio
  buffered ahead, `ended` only at the true end). **Lesson: hard-refresh after every dev restart.**

**This plan's fix (awaiting test):** when the buffer fully drains, **seamlessly auto-swap into the organized
transcript** instead of a dead "ended" state. `LiveBroadcastView` already fires `onHostedOver` at drain-end;
`LiveSession` now tracks `drainedOver`, pre-loads the organized call once the finish is `ready`, and
auto-swaps when both hold (`shouldAutoSwapToFinished`, unit-tested). The manual CTA stays as an early exit.
Plan: `docs/superpowers/plans/2026-06-17-seamless-drain-to-organized.md`.

**Verified:** `tsc` clean · **43 tests** · clean `next build`. **NOT yet visually tested** — the founder tests
the seamless hand-off next. **Test recipe:** restart the replay (`REPLAY_OFFSET≈90` on a recorded session,
`scripts/live-replay-engine.mjs`) → open `/app/live/live` → **HARD REFRESH (Ctrl+Shift+R)** → join → watch
`behind` drain to 0:00 → it should become the organized transcript with no "ended" gap.

**Before commit:** strip the temp diagnostics — the dev-only green readout + the `dbgRef` trace in
`LiveBroadcastView`, and `src/app/api/live/debug/route.ts`.

---

## 2026-06-16 — Transcription resilience + admin delete/rename (branch `fix/transcribe-fallback`)

- **Root cause fixed:** a real submission (Knesset/ZIM call) died at the formatting step when
  **Gemini 3.5 Flash 503'd** — `formatWithGeminiFlash` retried only 2×/3s with **no second
  provider**, throwing away a successful, expensive IVRIT transcription. Now: Gemini retries **4×
  with exponential backoff** (5s/15s/40s), then **falls back to GPT-4.1** (reuses `OPENAI_API_KEY`,
  32k output, truncation-guarded; shared `buildFormatPrompt` keeps Gemini's prompt byte-identical).
  Proven under a **real Gemini outage** while reformatting the ZIM call (Gemini 503×4 → GPT-4.1
  delivered 11 speakers / 112 lines).
- **IVRIT default → accurate model** (`ivrit-ai/whisper-large-v3-ct2`) with an automatic **accurate →
  turbo → Whisper** chain; the actual model used is reported in diagnostics. Railway env
  `RUNPOD_IVRIT_MODEL` set to match.
- **Cheap re-runs:** transcript + word-timings + audio are persisted **before** formatting, and a
  failed/retried row reformats only (skips download + IVRIT). New `scripts/reformat.mjs <id>`.
- **Admin delete + rename** (company page, admin-only via `profiles.role='admin'`): `DELETE
  /api/transcripts/[id]` (unlinks `scheduled_calls`, deletes the row, best-effort removes stored
  audio; quotes auto-detach) and `PATCH` rename (edits `formatted_data.company`/`quarter`).
  `AdminCallControls` renders rename/delete beside each finished call.
- **Personal-transcribe ("transcribe your own audio")** was designed + built as a fully-isolated,
  removable bolt-on, then **dismissed for now** — parked on branch `personal-transcribe-parked`
  (recoverable). The additive DB columns (`transcripts.kind`/`description`) + `user_quotes` table
  remain in the DB but are inert (unreferenced by deployed code).

---

## 2026-06-16 — Live transcript UX COMPLETE (2A transition + polish) → shipped to `main`

**Status:** The live→finished "one call matures" UX is DONE and merged to `main` (from
`feat/live-ux-2a`), tested live end-to-end (Or Yam replay under תמיס). **Phase 2 (2B/2C/2D) is next.**

**What shipped (on top of Phase 1's finish pipeline):**
- **Unified live view** — Home + Company entries open ONE route (`/app/live/live` → `LiveSession` →
  `LiveBroadcastView`) with ONE buffer: `LIVE_BUFFER_SEC` (5-min default; `NEXT_PUBLIC_LIVE_BUFFER_SEC`
  override — local tests use 60s).
- **Pure timing engine** (`src/lib/live/liveTiming.ts`, unit-tested): `interpolatedEdge` (smooth edge
  between 1.5s polls → no jittery "behind"/timers), `delayedLiveEdge` (after source-end the buffer
  **drains** at 1x to the true end → no cutoff, no timeline jump), `hostedLiveOver` (drain-based
  finished mode → kills the return-to-live-after-ended bug), `bufferGate` (countdown).
- **2A inline swap** (`LiveSession`): source ends → `POST /api/live/finish` runs Gemini
  (`finishLiveCall`) → poll the **non-auth** `GET /api/live/finish` → prominent **"View the organized
  transcript"** button → swaps `LiveTranscriptView` **in place** (same URL; audio continues via
  `initialSeek`). "Try again" on failure; English AI-status text; new `GET /api/live/finished-call/[id]`.
- **Refresh-safe**: playhead persisted (sessionStorage) + restored on join; finish state re-derived on
  mount; already-ended-on-load skips the drain ramp.
- **Polish**: clickable **"LIVE"** on the player bar → jumps to the live edge; ready overlay reads
  "available — join" (no misleading future-time); "-X מאחורי שיחת המשקיעים המקורית"; cross-client
  "return to live" converges via the engine's shared edge (~1s — exact lockstep deemed out of V1 scope);
  `ReturnToTranscriptChip` hidden while a transcript is displayed (`PlayerProvider.viewingId`).
- **Gemini fallback merged** (parallel session, `transcription.ts`): accurate-IVRIT default + **GPT-4.1
  fallback when Gemini 503s** + exponential backoff → the finish is 503-resilient.

**Verified:** `tsc` clean · 42 tests · clean `next build`; founder confirmed every reported issue fixed.
**Test harness:** `scripts/finish-live-call.ts` (+ `runDemoFinish`), `scripts/prep-replay-session.mjs`,
`scripts/verify-finish.ts`, replay via `scripts/live-replay-engine.mjs`. Specs/plans under
`docs/superpowers/` (2026-06-16-live-*).

**NEXT — Phase 2 (continuing):** 2B toolbar-on-live (Save Quote / Ask Atlas / Share on a live caption)
→ 2C quote-as-anchor (live quotes carry into finished) → 2D unified/persistent live audio player
(truly-gapless swap).

---

## 2026-06-16 — Thread A Phase 1 EXECUTED (finish hand-off) — DONE (tested + shipped; see top entry)

**Status:** Phase 1 (the spine) built, self-verified, and run against the recorded תמיס session — a
real finished transcript row exists, **awaiting admin test in the app**. All work is in the working
tree, **uncommitted** (founder to review/commit). Spec + plan written and committed to docs.

**TEST THIS:** open **`/app/live/live-finish-demo-tamis-2026-06-14`** in the V1 app. Expect: תמיס
Q1 2026 · audio plays · **karaoke highlights words in sync** · click-word seeks audio · Gemini speaker
turns (גיא ברנע מנכ"ל / מיכל אדרי סמנכ"לית כספים / analysts) · the toolbar (Save Quote / Ask Atlas /
Share). NB: the recording is a rough two-session test capture whose spoken content is אור ים אנרגיה,
attached to תמיס — so body text won't match the header; a known asset quirk, **not** a pipeline bug.

**What shipped** (Phase 1 = ended live call → normal finished `transcripts` row; NO IVRIT, NO YouTube —
reuses only Gemini polish + the stored shapes):
- `src/lib/live/finishLiveCall.ts` — pure, unit-tested transforms (normalize-session / synthesize
  word-ends / build `word_segments` / duration / pcm-bytes) + orchestration: trim captured PCM → MP3
  (ffmpeg 32 kbps mono) → upload to `audio-temp` → Gemini polish (reuses `formatTranscript`) →
  idempotent upsert of a completed row. Renders via the EXISTING `loadCompletedCall` →
  `LiveTranscriptView` (word-timed karaoke + toolbar) for free — the displayed/karaoke words come from
  `word_segments`; Gemini's `formatted_data` supplies the speaker turns proportionally.
- `src/lib/live/finishLiveCall.test.ts` (10 tests) · `scripts/finish-live-call.ts` (runner) ·
  `scripts/verify-finish.ts` (headless render-precondition check).
- Spec `docs/superpowers/specs/2026-06-16-live-transcript-ux-design.md` · plan
  `docs/superpowers/plans/2026-06-16-live-transcript-phase-1.md`.

**Decisions taken autonomously:** attach demo to תמיס (ticker 1097229); idempotent synthetic id
`live-finish-demo-tamis-2026-06-14`; use the FIRST of the recording's two concatenated sessions
(759 words, ~6:40) + trim the MP3 to it (stops session-2 audio bleed); resolve the demo row owner
deterministically (admin profile → newest transcript → demo user) because the zero-UUID demo user
fails `transcripts_user_id_fkey`.

**Verified:** 10 unit tests green · `tsc --noEmit` clean · `next build` green (22 routes) ·
`finish-live-call` exit 0 · `verify-finish` → status completed, audio HTTP 206 `audio/mpeg`, 759 timed
words, 8 Gemini speakers, all render preconditions pass. Cold-context `reviewer`: **no blockers, no
security holes**; 2 majors fixed (orphan audio → deterministic filename; arbitrary owner →
deterministic), plus a karaoke binary-search sort guard.

**Known/minor:** a couple of orphan mp3s from earlier runs linger in `audio-temp` (harmless temp
bucket; the script now overwrites a single deterministic object). The live path still has no live
*speaker* capture — Phase 1 leans on Gemini's proportional turns (the asset has no speaker field).

**NEXT — Phase 2 (after admin OK):** live-mode richness — toolbar on the live view, quote-as-anchor
carrying live→finished, live audio surviving navigation, same-page live→finished transition. All
demoable via `scripts/live-replay-engine.mjs`. Write the Phase 2 plan, then build + test.

---

## 2026-06-15 — Thread A (RESUMED 2026-06-16 → see top entry): live→finished "one call" UX

**Status:** Brainstormed with the founder; decisions below are **locked**. **Paused mid-design** to
chase the live webinar bot test (Thread B). No code written (brainstorming HARD-GATE respected).
**Resume by:** present the full design in sections → write spec to `docs/superpowers/specs/` →
founder review → `writing-plans` → build **Phase 1**.

**The vision — one call that *matures* (not two things):** a call (e.g. "Q2 2026") has ONE identity.
It's LIVE (streaming raw Recall captions, already quotable/shareable/Ask-Atlas-able); when it ends the
SAME call runs through Gemini → becomes the finished transcript on the company page with full
functionality. Live or finished = the same kind of page; one's just streaming and ~5 min behind.

**Locked decisions:**
- **The LIVE view must FEEL like the finished view** (founder's core ask): while live, the user can
  walk to other pages with the (delayed) live audio still playing + a Return-to-transcript chip, and
  highlight a live caption → **Ask Atlas / Save Quote / Share** — same toolbar as finished.
- **Recall gives speakers** (participant = Zoom display name + is_host + per-word timestamps). Best
  finished transcript = Recall participant boundaries/timing + Gemini role detection (מנכ"ל/CFO/מנחה)
  + typo cleanup; same capture also fixes the live "one-block captions" gap. Caveat: per-Zoom-
  participant, not voice diarization — weak when several people share one account.
- **Quotes = "auto-upgrade & deep-link"** (founder chose): a quote is stored as an ANCHOR (which words
  + the moment), NOT frozen text. Renders best-available text — raw while live, corrected once polished
  — and deep-links to the exact spot + audio in the finished transcript. Falls back to the saved
  snapshot only if a chunk's word count changes. Leans on the pipeline's "keep same words in order" rule.
- **Build path = C→A** (founder chose): two phases (C) toward the unified **"one page, two modes"**
  end-state (A — one transcript page running live-mode or finished-mode; audio layer lifted into the
  app shell so it survives navigation in BOTH; quote/share/Ask-Atlas on the one page → identical by
  construction, can't drift).

**Phase 1 (the spine — build first, biggest value):** turn an ended live call into a normal finished
transcript so the existing finished UX renders it for free:
- Capture Recall raw at call end (text + speakers + per-word timestamps).
- Encode the engine's captured PCM → MP3 → upload to Supabase Storage → `audio_url` (polish is
  post-call; capturing is the only irreversible step).
- Build `word_segments` (IVRIT-shaped) from Recall words WITH speaker per segment.
- Run Gemini polish (same `formatWithGeminiFlash` prompt as the IVRIT path, correct company context)
  → `formatted_data`.
- Insert a `transcripts` row (formatted_data + audio_url + word_segments + company_id + duration,
  status=completed) under the company → `/app/live/[id]` → `loadCompletedCall` → `LiveTranscriptView`
  renders audio karaoke + quote/share/Ask-Atlas.

**Phase 2 (the live richness):** Quote/Share/Ask-Atlas ON the live view + live audio that survives
navigation (lift the live Web-Audio engine into the app shell, like the finished global player) + the
quote-anchor data so live-saved quotes carry into the finished transcript.

**Code facts for a fast resume:**
- `LiveTranscriptView` (finished) ALREADY has it all: global player (`usePlayer`), `createQuote`,
  share (WhatsApp + `/print/[id]`), Ask-Atlas (`TranscriptChatPanel`), karaoke; loaded via
  `loadCompletedCall` from a `transcripts` row.
- `LiveBroadcastView` (live) is streaming-only: own Web-Audio engine that dies on navigation, NO
  quote/share/Ask-Atlas, NO global player; company hardcoded to תמיס (placeholder until MAYA).
- Reusable as-is: Gemini polish (`formatTranscript`/`formatWithGeminiFlash`), transcripts-row creation,
  `word_segments`+`audio_url`+`loadCompletedCall`, quotes table.
- **Demo asset available now:** old תמיס live session rotated to `scripts/out/sessions/` (`*.pcm` +
  `*.jsonl`) — Phase 1 can be built & demoed against it WITHOUT a live call.

---

## 2026-06-15 — Live webinar bot test: Zoom registration is the real wall (Core 1/2)

- **Tested 2 Recall bots into a real registration-required Zoom *webinar*** (Atlas = live→platform,
  Sagi = record-only; treated as a תמיס test). Rig was solid end-to-end (`live-broadcast.mjs` engine
  + cloudflared tunnel + new `scripts/live-webinar-bots.mjs`); Recall accepted every bot. **All 4
  launches died `fatal: zoom_token_expired` — no bot got in.**
- **Root cause (confirmed by a founder screenshot):** the registrant `…/w/{id}?tk=…` link is a
  **single-use, short-lived *landing* token** — opening it hits Zoom's "Join meeting" chooser and
  **consumes** it. The founder opened every link (to join / screenshot), so the bot always got an
  already-burned token. We used Recall's *correct* method (meeting-id + `tk` + `zoom.user_email`);
  the method was fine, **token freshness** was the blocker.
- **Zoom OAuth does NOT fix this** (verified in Recall docs): signed-in/ZAK bots only bypass
  *"authenticated-users-only"* meetings and **"cannot skip waiting rooms or bypass registration."**
  Earlier hunch corrected before building the wrong thing.
- **Real fix = freshness + automation:** the untested decisive experiment is register → **never open
  the link** → fire the bot within seconds. For Core 2 (MAYA fleet) the hard part isn't getting Zoom
  links — it's a tight **auto-register → grab fresh `tk` → launch bot** pipeline (token never
  human-touched). OAuth only helps where we host/co-host (mint clean tokens via Zoom API) or for
  auth-only meetings.
- **Tooling/leftovers:** `scripts/live-webinar-bots.mjs` (create/atlas/sagi/status) added; old תמיס
  recording rotated to `scripts/out/sessions/`. The brainstorm for the live→finished "one call" UX
  (Phase 1 polish pipeline) is **paused mid-design, not lost** — resume there next.

---

## 2026-06-15 — Rebrand → **Atlas** (name + logo across the V1 app)

- **New product name: Atlas** (Latin serif wordmark), replacing תמלול / Timlul. Founder
  decisions: **Latin "Atlas" via the real logo image**; **Hebrew UI shows the transliteration
  אטלס** (English UI = "Atlas"); **scope = V1 app (`/app/*`) only** — the legacy root product
  keeps the old name. **Colors untouched** (explicit founder constraint — the warm, near-mono V1
  palette already matches the logo's cream/dark-serif world).
- **Critical nuance honored**: in Hebrew, תמלול is *also* the noun "transcript" (`transcript:`,
  `חזרה לתמלול`, the hero, etc.). Renamed **only the brand-name uses** (`common.brand`, metadata
  title, chat assistant name), never the noun — a blind find-replace would have broken the product
  vocabulary.
- **Logo asset, zero new deps**: `scripts/prep-brand-assets.mjs` (pure Node zlib — no sharp/
  ImageMagick/ffmpeg available) decodes the transparent wordmark, trims the heavy internal padding
  to the glyph bbox (645×296 → **398×135**), re-encodes → `public/brand/atlas-wordmark.png`. New
  `BrandWordmark` DS component renders it as a **CSS mask filled with `currentColor`** → ink on
  light surfaces, light on dark, transparent on any background, crisp at any size. `NavRail` uses it
  (expanded) + a serif "A" monogram (collapsed). Added a favicon (`src/app/icon.png`) — the
  wordmark's **actual "A" glyph** traced by the same script (bilinear-scaled, ink on a rounded cream
  tile); there was none before.
- **Atlas voice / identity** (founder goal: "give the product real character, like Claude"): chat
  subhead → "**Ask Atlas** anything about a company's investor calls and filings."; highlight-to-ask
  button → "**Ask Atlas**" (was "Ask about this"); composer placeholder → "**Ask Atlas…**"; system
  prompt → "You are **Atlas**…".
- **Verified**: `tsc` clean + `next build` green (22/22) + offline composite preview of the wordmark
  on panel/white/dark surfaces + `next dev` smoke (`/app/home` 200, `/icon.png` 200). **Committed and
  fast-forward-merged to `main`, pushed to origin.**
- **Parked (revisit later — founder call)**: chat visuals + UX and the Atlas name/voice context will
  keep evolving as the product grows; the **in-transcript side-chat** gets a dedicated visual + naming
  pass (Atlas fits there perfectly). Deferred now to build bigger features. Also intentionally left
  out of git: the untracked `תמיס/` (8.3 MB report PDF) and `Product Reference/` design refs — decide
  if/how to store those (repo vs. external/LFS).

---

## 2026-06-15 — Chat polish (RTL output + reference composer → native Claude look)

- **Status**: chat logic + conversation are **starting to get good** — streaming, markdown, RTL
  output and the quote→chat reference flow work; the assistant feels real, not a thin wrapper.
  **The chat interface looks okay right now**; it'll be **better shaped later and adjusted to match
  Claude's interface** more precisely. Changes are in the working tree, **not yet committed**.
- **Shipped this session**: dynamic RTL on chat output (content-driven `detectDir`, not `dir="auto"`);
  `<br>`-in-table-cell rendering via a tiny self-contained remark plugin (no new dep, only touches
  `<br>`); flattened the history reference block (`TranscriptChatPanel`).
- **Reference composer — re-done to Claude's look**: a first pass went **too grey (`#EFEDE8`) and
  too puffy** (rounded card floating in a grey sleeve); founder course-corrected against the real
  reference (`Product Reference/refernce chat interface/side-chat-refernce.jpeg`). Now `ChatComposer`
  is **flat, predominantly white**, with a **faint 1px hairline** dividing the reference row from the
  input + a **thin outer hairline border**, and the excerpt wrapped in **both an opening and closing
  quote**. Founder confirmed the row IS divider-separated. *Good-enough for now; finer Claude-match
  to come.*
- **Lesson logged** (memory `matching-design-references`): match a reference's real character
  (Claude = flat/white/hairline/minimal, not grey/puffy) and **describe understanding + confirm
  before implementing** visual changes.
- **Parked (revisit later)**: Hebrew inside markdown **tables** still pins left instead of hugging
  the right edge.

---

## 2026-06-14 — Design pass + 4 features (player / streaming chat / side-chat / diarization)

- **Design pass**: folded the Claude-Design look into the working product (no rebuild) — fade-up/
  pop-in/pulse-live motion + softer card/float shadows; bigger-then-dialled-back home hero; upcoming
  cards **flat at rest, smooth shadow on hover** (per founder feedback); calendar polish; My-Quotes
  **collapsible quarters + user-named folders** (`quote_folders` table + `quotes.folder_id`). Kept
  the **MediaPlayer as-is** and transcripts **RTL Hebrew** (added a chapters/speakers side panel).
- **Feature 4 — Global audio player**: lifted the recorded-call player into the app shell
  (`PlayerProvider` + one `<audio>`), so audio survives navigation + plays while chatting; floating
  **Return-to-transcript** chip; clickable **My Quotes** toast. `LiveTranscriptView` now consumes the
  global player. *Why*: foundation for the in-transcript chat + a far better listening UX.
- **Feature 5 — Streaming chat**: real Gemini SSE → token stream; **markdown rendering**
  (`react-markdown`+`remark-gfm`, RTL-aware `.md` typography) so replies read like Claude, not raw
  `**`/tables; thinking-dots. *Why*: the chat felt like a thin LLM wrapper.
- **Feature 6 — In-transcript side chat**: highlight → ✦ Ask → side panel (transcript stays, audio
  plays); while open, **highlighting auto-references** into the composer; new refs append at the
  bottom and ride into their message (history preserved). Composer is a **unified two-toned box**
  (warm reference header + white input) matching `Product Reference/Chat-quote-reference-visualgoal.jpeg`.
- **Feature 1 — Diarization editing**: additive `transcripts.speaker_edits` overlay +
  `applySpeakerEdits` (pure passthrough when absent → zero regression; verified on a real transcript
  then reset to pristine); `PATCH …/diarization` recomputes the full boundary list; "Edit speakers"
  reassigns a selected run. *Deferred*: adding a brand-new speaker; optimistic (non-refresh) update.
- **Verified**: `tsc` + `next build` (22/22) green per feature; dev-server smoke 200; streaming +
  diarization endpoints exercised live. Built on branch `feat/product-enhancements`, merged to `main`.
- **NEXT (today)**: (1) **test the live feature on a real call**; (2) keep polishing chat UX. Advanced
  features start tomorrow.

---

## 2026-06-14 — Deployed to Railway + Core 1 live-on-platform (built, first test, rebuilt)

- **Shipped Spec 1 + deployed**: merged the 9 transcript/chat fixes to `main`, deployed on
  **Railway → `timlul-ai.com`**. Fixed post-login redirect (`/dashboard` → `/app/home`; the old
  product still lives at root routes). **Chat switched Claude Sonnet → Gemini 3.5 Flash**
  (`thinkingBudget:0`) — shares `GEMINI_API_KEY`, works on the deploy.
- **Finished-transcript polish**: speaker names now come from Gemini's `formatted_data` (relabel
  IVRIT timed words, karaoke untouched) instead of "Speaker N"; "Open with LLM" replaced by
  **Share-as-PDF** (clean `/print/[id]` route → browser Save-as-PDF); quote→chat passes company +
  quote + specific call.
- **Core 1 on the platform (built)**: home "Live Now" + company Overview **auto-detect** a live
  call (poll `/api/live/state`); `/app/live/live` streams the broadcast. Data flows browser →
  same-origin proxy routes (`/api/live/state`, `/pcm`) → live engine (`LIVE_ENGINE_URL`, default
  the local spike, tunnelled for the deploy). The live engine = the spike (`live-broadcast.mjs`).
- **First real live test (תמיס Zoom)** ✅ proved the loop end-to-end: Zoom → Recall bot → platform
  → karaoke, **audio↔text sync good**, live auto-appears on home when the bot is admitted, closing
  Zoom ended the call. Bugs surfaced → **rebuilt the live view to BE the V1 page** (same header,
  tabs, `TranscriptBody`, **`MediaPlayer` audio bar**) and **fixed join-at-live-point** (was
  playing from call start; now drops in at `liveEdge − buffer`), buffer countdown, play/pause/
  seek/volume (Web Audio). Verified against a **replay of the recorded session**
  (`scripts/live-replay-engine.mjs`, serves `out/broadcast-audio.pcm` + `broadcast-lines.jsonl`).
- **Known / next (re-test tomorrow on a real call)**: live captions render as **one block** (no
  speaker turns — the spike captures word+timestamp but not Recall's per-word speaker; production
  fix = capture speaker → real speaker segments). Accuracy-mode captions arrive in ~72–188s chunks
  (**why the buffer must be the full 5 min** so captions are ready when audio plays). Big chunks
  fall back to **raw** (Gemini changed word count) → production fix = sentence-level correction.

---

## 2026-06-13 — Spec 1 (transcript experience + chat) + live-pipeline direction

- Diagnosed: finished YouTube transcripts show no audio / no word-sync because legacy rows
  predate the `audio_url` + `word_segments` pipeline (which already persists both). Fix =
  re-process in place (`scripts/reprocess-audio.mjs`), not a pipeline rewrite.
- Scoped Spec 1 (`docs/superpowers/specs/2026-06-13-transcript-experience-and-chat-design.md`):
  9 transcript/chat fixes — audio karaoke on finished calls, always-RTL, go-to-line+highlight,
  real refresh, paragraph-correct quote speaker, editable speaker names, working search,
  "Open with LLM" (replaces PDF), transcript-scoped chat context, persisted conversations.
- Core-tech review of the live pipeline. Locked: **raw-live + polish-after** (no LLM in the live
  path — scales to many concurrent calls; Gemini polishes only the finished transcript),
  **Railway** host (= permanent webhook URL for free), Recall supports **Zoom Webinars** (bot as
  attendee; registration link + passcode). Spec 2 productionizes the live broadcast; the finished
  live call reuses Spec 1's audio-synced replay.
- PDF dropped in favour of "Open with LLM" (ChatGPT/Claude/Gemini hand-off).

---

## 2026-06-11 — V1 scoped + data layer seeded (4 real companies, mock MAYA)

- **V1 product description received** (full page map now in CLAUDE.md): Home/Calendar/Chat/
  Company/Live-Transcript pages, RTL 3-layer sidebar. Partner is building the design system
  (~2 days); frontend lands then and we wire it to the backend. Until then: backend fitting only.
- **Data layer shipped** (migration `20260611_006`, live in Supabase): `companies` +
  `scheduled_calls` + `transcripts.company_id`. Seeded 4 real companies — תיגבור (1105022,
  שירותים), תמיס (1097229, נדל"ן — identified via Globes/Bizportal after MAYA blocked scraping),
  רג"א (ניקיון עירוני), קווליטאו (1083955, שבבים) — with descriptions + 3 logos in
  `public/logos/` (תמיס logo: manual add pending). 4 mock Q2-2026 calls; תיגבור+רג"א
  deliberately simultaneous (19.6) to test multi-call UX.
- **Core 3 decision locked**: live calls' finished transcripts = Recall raw text (speaker names
  + per-word timestamps) straight into Gemini — no IVRIT re-transcription (measured tie on
  quality, Recall adds speakers/timing for free). IVRIT remains for the YouTube path.
- **Flagged**: leftover foreign tables in Supabase (patients/sessions/documents/products);
  `products` has RLS disabled (critical advisory) — user to clean up/decide.
- **Next**: frontend + design system arrive → integration plan (quotes table, chat endpoints,
  Core 1 productionization, ingest the 2 seed YouTube calls linked to companies).

- **The full product loop ran live**: real 2-person Zoom call → Recall bot (audio websocket +
  transcript webhook) → Gemini 3.5 Flash live correction → viewer page playing audio ~5 min
  behind with synced karaoke captions → call ended → broadcast drained gracefully. Spike:
  `scripts/live-broadcast.mjs` (+ `live-player.mjs` replay, `live-bakeoff.mjs` A/B harness).
- **Engine bake-off (measured on live reads of `fixtures/live-bakeoff-script.he.txt`)**:
  Recall-accuracy = best Hebrew quality, rolling 72–188s chunk delay (fits 5-min buffer);
  Gladia = 2.7s median lag but ~25 errors/3min (kept as possible "instant mode"); ElevenLabs
  disqualified (no live events, no transcript, 3 attempts); IVRIT 45s-chunks = close 2nd
  quality at ~62s but requires audio infra. **Decision: Recall-accuracy + Gemini live
  correction; delay embraced as the buffer.** Post-Gemini, Recall-raw ≈ IVRIT-raw on final
  transcript quality — engine choice driven by live experience, not final output.
- **Gemini live-correction validated**: company-context constrained prompt fixed האגירה/EBITDA/
  NOI/מח"מ/מט"ח live in 1.5–6s/chunk. Gotchas burned in: `thinkingBudget: 0` mandatory
  (reasoning leaked into captions); paid tier mandatory (free tier 429s); 350-word chunks break
  word-count preservation → production needs sentence-level correction + anchor alignment.
- **Post-call assets confirmed**: full recording (mp4→mp3) + final transcript downloadable —
  must be copied to our storage before Recall retention deletes them. Audio + polished
  transcript both shown on platform.
- **Next**: Core 1 design doc → production build (`live_calls` table, `/live/[id]`, Railway
  webhook URL, multi-call concurrency), then Core 2 (MAYA → automatic bot fleet). User V1
  product description incoming.

---

## 2026-06-10 — VISION LEVEL-UP: from "paste a link" to the Israeli institutional platform

- **New big vision** (partnership formed after strong hedge-fund feedback): the Quartr-equivalent
  for the Israeli market — institutional-only, prestige adoption. Solve report-season drowning
  (200+ calls/season): track + produce insights from **every** Israeli public company's investor
  call, live and post-call.
- **New product process**: MAYA/TASE API (company profiles + call Zoom links, automated) →
  Recall.ai bot fleet joins calls → **live transcripts hosted on-platform** (audio + captions in
  sync, ~5 min buffer OK) → post-call, raw text/audio runs through the existing pipeline →
  polished transcript stored in our DB.
- **Roadmap reordered to backend core missions**: Core 1 = live transcript of one call (NOW);
  Core 2 = automatic bot fleet from MAYA; Core 3 = finished-transcript pipeline (done, needs
  input rewiring). PDF/share/audio-click demoted to "later, with the frontend guide" — a full
  frontend description (maybe a skeleton) is arriving from the partner.
- **MAYA groundwork**: `MAYA/maya_api-guide.pdf` scanned — TASE Data Hub portal: register → app →
  API key; REST + `apikey` header; rate limit 10 req/2s (HTTP 429); call-announcement product is
  paid and needs Data Sales approval (starting in days). Design the integration behind a clean
  interface until the real schema is visible.

---

## 2026-06-10 — Feature 1 COMPLETE: IVRIT → Gemini 3.5 Flash pipeline live in production

**What shipped:**
- **New pipeline**: IVRIT (RunPod) → `parseTitleMeta` (company/quarter from YT title, no LLM) →
  `formatWithGeminiFlash` (Gemini 3.5 Flash, company-aware holistic prompt) → `parseGeminiOutput`
  (structured speaker blocks) → user. GPT-4o fully removed.
- **Prompt** (in `formatWithGeminiFlash`): gives Gemini the company name + "Israeli public company"
  context; instructs organize by speaker, fix confident typos only, never rephrase/summarize.
- **UI**: tighter same-speaker paragraph spacing (`mb-1.5`); yellow flag rendering for uncertain words
  already wired via `TranscriptBody` `renderText`.
- **Proxy**: Decodo residential proxy (`YTDLP_PROXY` on Railway) added to bypass YouTube bot-detection.
- **Quality**: transcripts are visually excellent — confirmed on קוואליטאו Q1 2026 live test.
  Gold-measurement score ~40 token-errors on אמפא (vs 31 with old GPT-4o+entities pipeline), but
  visual quality and speaker organization are significantly better. Deliberate trade-off accepted.

**Why Gemini over GPT-4o:**
GPT-4o's constrained diff-only approach scored better on the gold metric (31 errors, 0 introduced)
but produced robotic, hard-to-read output. Gemini's holistic approach produces natural, well-organized
transcripts the analysts actually want to read. Quality-over-measurement was the deliberate call.

**Remaining gaps (not blocking, revisit later):**
Per-company entity DB; IVRIT per-word confidence scores; per-line `startSec` for audio playback.

**Next feature: Feature 2 — PDF download + Share.**

---

## 2026-06-09 — Feature 4 / Live Zoom Transcription — Recall.ai quality spike

**Goal:** Validate Recall.ai as the live-transcription engine before building the UI — confirm
Hebrew quality, per-word timing, and the participant/data schema.

**What was built:**
- `scripts/recall-spike.mjs` — a Node.js spike script (no Railway/webhook needed). Three commands:
  `start "<zoom_url>"` (creates bot, saves id to `.recall-spike-bot.json`), `status`, `fetch`
  (polls until transcript ready, writes `fixtures/recall-spike.{transcript.json,.he.txt}`).
- Bot config: `recallai_streaming` provider, `prioritize_accuracy` mode (the only Recall mode that
  supports Hebrew — `low_latency` is English-only), `language_code: "auto"` (handles Hebrew+English
  code-switching in financial terms).
- Bot name: "Timlul". Reads `RECALL_API_KEY` (and optional `RECALL_REGION`, default `us-west-2`) from `.env.local`.

**Live test result (bot `f46700bf`, 2026-06-09T15:43Z):**
- Hebrew quality: **excellent** — clean recognition, natural financial vocabulary preserved.
- Transcript JSON schema: `[{ participant: { name, id, is_host, platform, email }, words: [{ text,
  start_timestamp: { relative (float seconds from call start), absolute (ISO) }, end_timestamp }], language_code }]`
- Per-word timestamps available — both relative and absolute ISO. This is also the audio-sync
  foundation for Feature 3's `startSec` line timestamps.
- Participant identified by Zoom display name. `is_host` flag available.
- `prioritize_accuracy` transcript is ready 3–10 min after call ends (not real-time streaming).

**Status:** Spike complete. Quality proven. **Next: build the live-transcript page in the website.**
Target UX: user sends a Zoom link → bot joins → `/live/[botId]` page shows transcript building
in real-time with RTL Hebrew, speaker labels, and audio sync. Need: Recall webhook → Supabase →
SSE/Realtime → the page. Or: poll Recall API directly from the page during the call.

---

## 2026-06-09 — Manual model comparison experiment (in progress)

**Goal:** Find out which model produces the best Hebrew investor-call transcript from raw IVRIT output,
so we can decide how to improve the pipeline.

**Protocol:**
1. User sends a YouTube link → Claude extracts the raw IVRIT transcript text and pastes it back.
2. User takes that raw text and submits it with a free-form "fix + organize" prompt to three model
   chat UIs simultaneously: **ChatGPT (GPT-5.5)**, **Claude Sonnet 4.6**, **Gemini Flash 3.1**.
3. User listens to the full audio recording and manually produces a **perfect gold transcript**.
4. Compare all three model outputs to the gold → count errors fixed / introduced / remaining.
5. Brainstorm findings: which model/approach wins, what the gap tells us about the pipeline.

**Why:** The manual Gemini test (2026-06-09) on the אמפא Q1 2026 transcript showed Gemini's
free-form approach fixed ~8 critical domain errors that our constrained GPT-4o pipeline missed
(היוון, שיעור התפוסה, זרוע הפיננסים, האגירה, TLV, אמפא ישראל). But Gemini hallucinated the
CEO name (רדי → לוי). This test will give us a clean multi-model comparison on a fresh transcript
with a new gold standard.

**Status:** Waiting for user to send a YouTube link. Claude will run the IVRIT pipeline and return
the raw text in-chat. No API calls needed from the user side — pure manual chat-UI test.

**Expected learning:** Which model's context understanding is strongest for Hebrew IR calls;
whether the hallucination risk is a Gemini-only issue or universal; what prompt engineering
(entity list, stricter instructions) closes the gap to perfect.

---

## 2026-06-09 — Locked the correction pipeline (Feature 1 baseline) + Claude experiment

- **Locked the constrained, gold-measured correction layer** (`src/lib/correction.ts`) as the product's
  correction step. `formatWithGPT4o` Step 0 = `generateEntities` (knowledge-first auto entity list,
  GPT-4o) → `correctTranscript` (**diff-only**, entity-guarded, context-coherence flags) → speaker-tag
  the raw text + apply corrections per line (decoupled). Best measured: אמפא **46→31 token-errors, 0
  introduced**. The diff-only output + entity-match guard (`applyConfident`) is what stops the over-reach
  that plagued the old free-rewrite GPT pass.
- **Claude Sonnet 4.6 experiment — tested, did not win.** Same IVRIT raw, swapped only the correction
  brain (`scripts/claude-test.ts`). V1 (no report) 46→41, 1 introduced; **V1 + adaptive thinking 46→39,
  2 introduced** (Claude's best) — still short of GPT-4o+entities (31), and it corrupts 1–2 good words.
  Report-as-context is a **dead end for both models** (no-thinking V2 over-reached → 5 introduced;
  thinking-V2 ran the 50K-token report away and burned the whole budget). **Verdict: the entity list is
  the lever, not the model.** Claude's *flagging* (detection) was excellent, though. Spec:
  `docs/superpowers/specs/2026-06-09-claude-correction-test-design.md`.
- **Feature 1 is "good-enough" DONE** (product call): clean + honest yellow flagging + speaker
  organization. Explicitly **not** perfect — we will return to it; this pipeline is the core of the product.
- **Revisit-later list (deliberate):** per-company canonical entity DB + cross-company learning loop
  (biggest remaining lever); IVRIT per-word confidence + audio for the genuinely-ambiguous residual
  (e.g. cap-rate היוון/רבעון); a Claude pass once we have a Claude-tuned prompt. Source-side IVRIT
  biasing stays closed (proven no-op).
- **Misc:** added `@anthropic-ai/sdk` (also serves the upcoming live-transcripts feature); admin
  "תמלל מחדש" button + backend force-path inserts a new row so the original is kept for A/B.

---

## 2026-06-07 — Cleanup, foundations & the transcript-quality gate

- **Purged the abandoned "insider transactions" feature** (full purge). Deleted 11 `src/` files,
  the entire `worker/` dir (`maya-poller` cron), `render.yaml`, the `resend` dependency, dead
  `mock-data.ts`, and insider-only env vars (`RESEND_*`, `GREEN_API_*`, `CRON_SECRET`). The feature
  was fully isolated — nothing in the transcript product imported it. DB tables left in place
  (harmless, reversible). Verified `tsc` + `next build` clean afterward.
- **Reverted the font-size bump** from commit `3c51315` — only the `fontSize` block in
  `tailwind.config.ts`, back to its prior values. Left accent color and `font-mono-num` (changed in
  the same commit) alone; the complaint was size only.
- **Added `CLAUDE.md` and this `PROGRESS.md`** — the project had neither. CLAUDE.md is the
  per-session memory; PROGRESS.md is the decision log.
- **Built the transcript-quality gate**: Bearer-token auth on the transcript API (so automation can
  drive the real product), `scripts/transcribe-batch.mjs` (submits a URL list, polls, dumps results),
  and the **`/transcript-review`** skill that audits output for Hebrew typos/speaker errors and feeds
  `KNOWN_CORRECTIONS`. Feature 1 is now gated on a clean reviewer report. Reviewer runs against the
  local dev server.
- **Skills decision**: build exactly one (`/transcript-review`). Code review uses the built-in
  `reviewer` agent — no skill needed.

---

## Earlier milestones (pre-log, summarized)

- **Security hardening**: auth on `GET /api/transcripts`, RLS on `transcripts`, removed plaintext
  password storage from the join flow (now `inviteUserByEmail`), fixed an open redirect.
- **Database user-creation bug**: fixed the `handle_new_user` Supabase trigger (wrong columns +
  `search_path`).
- **Rebrand** "Sentiment." → **"תמלול."** across the app.
- **Sign-out**: replaced a dropdown with a plain `<a href="/api/auth/signout">` after a z-index
  overlap kept intercepting the click.
- **Inline transcript editing**: company/quarter/speakers (with app-wide name sync) + line text +
  highlights, saved via `PUT /api/transcripts/[id]`.
- **Unified navbar** (`AppNav`), **Companies** accordion page, dashboard refactor, join form fields.
- **Transcription quality phase 1**: engine/model tracking + admin badge; wired the previously-dead
  `KNOWN_CORRECTIONS` + GPT proofread pass; Whisper fallback on IVRIT failure. IVRIT confirmed
  running in production via the badge (`ivrit · …turbo-ct2`).
