# READY-FOR-REVIEW QUEUE — append-only, newest last
<!-- Lanes append when work is ready; the supervisor processes top-down and appends the verdict
     AND every reviewer finding (findings must not evaporate — /fleet-lint greps for repeats).
     Line types (greppable):
       [ts] READY lane · branch · what it does · how verified · migrations/shared-surface changes
       [ts] VERDICT lane/branch — APPROVED/CHANGES (+notes)
       [ts] FINDING branch · BLOCKER|WARNING|NIT · file:line · one-sentence defect
       [ts] AMEND lane/branch — new commits added to an already-queued READY entry
       [ts] CORRECTION lane/branch — factual fix to an earlier entry (the old line stays)
     Evidence refs in READY entries must be durable paths in the main checkout
     (docs/evidence/<branch>/ or scripts/out/sessions/) — see /ship lane step 6.
     APPEND ONLY. Never rewrite this file. -->
[2026-07-02 14:35] READY supervisor · feat/knowledge-compounding · Karpathy-advisory R1-R5 (fleet-lint skill, FINDING/DECISION conventions, answers-filed rule, Mission-5 hook, in-repo gate tests) · verified: 36-case gate suite + 45 tests + tsc · no migrations
[2026-07-02 14:35] VERDICT supervisor/feat/knowledge-compounding — CHANGES (round 1: 5 findings) then APPROVED (round 2: zero remaining, reviewer re-ran gate suite itself)
[2026-07-02 14:35] FINDING feat/knowledge-compounding · WARNING · docs/ENVIRONMENT.md:57 · doc pointed future agents at session-temp scratchpad test scripts (dangling pointer) — fixed: suite checked into .claude/hooks/gate-tests.mjs
[2026-07-02 14:35] FINDING feat/knowledge-compounding · WARNING · docs/ENVIRONMENT.md:69 · procedures row omitted fleet-lint (skill-list drift) — fixed
[2026-07-02 14:35] FINDING feat/knowledge-compounding · NIT · docs/ENVIRONMENT.md:66 · claimed a lint check that did not exist (token budget) — fixed: check added to fleet-lint
[2026-07-02 14:35] FINDING feat/knowledge-compounding · NIT · .claude/skills/ship/SKILL.md:31 · verbatim-vs-[ts] format contradiction — fixed: supervisor prepends timestamp
[2026-07-02 14:35] FINDING feat/knowledge-compounding · NIT · fleet-lint/parallel-work · DECISION had two documented homes + queue-recycle durability gap — fixed: single home + lint-before-recycle law
[2026-07-03 12:25] READY supervisor · chore/doc-growth-guards · 3 doc-growth guards (PROGRESS compaction check, stale-plan banners + 30-file sweep, ARCHITECTURE drift bar) + .obsidian gitignore · verified: 45 tests + tsc + 36 gate tests, reviewer verified all 30 stamps · no migrations, no shared types
[2026-07-03 12:25] VERDICT supervisor/chore/doc-growth-guards — APPROVED (1 NIT, fixed pre-merge)
[2026-07-03 12:25] FINDING chore/doc-growth-guards · NIT · .claude/skills/fleet-lint/SKILL.md:44 · check 9 said banner is "first line after the title" but stamps sit one blank line below — literal reading would mis-flag all 30 files; reworded to "first content line after the title"
[2026-07-03 13:30] READY supervisor · chore/progress-compaction · PROGRESS.md June-era compaction per check 8 (25 entries -> era summary; raw 779 lines verbatim to docs/archive/) + VISION Core 1 speaker-capture to-build · verified: reviewer byte-diff on archive, 45 tests + tsc · no migrations
[2026-07-03 13:30] VERDICT supervisor/chore/progress-compaction — CHANGES (round 1: 1 BLOCKER + 2 NITs) then APPROVED (round 2, reviewer re-verified archive byte-identical; 2 residual NITs fixed pre-merge)
[2026-07-03 13:30] FINDING chore/progress-compaction · BLOCKER · PROGRESS.md:170 · era summary dropped the still-open live speaker-capture gap (captions = one speakerless block, no participant data captured) — load-bearing for Lane I/Mission 4; restored to summary + VISION Core 1 to-build
[2026-07-03 13:30] FINDING chore/progress-compaction · NIT · PROGRESS.md:130 · line counts disagreed (~760 vs ~780, actual 779) — reconciled to exact
[2026-07-03 13:30] FINDING chore/progress-compaction · NIT · docs/superpowers/specs/2026-06-16-live-transcript-ux-design.md:8 · historical spec's "Thread A" pointer dangled post-compaction — era summary now names Thread A with archive pointer
[2026-07-03 13:30] FINDING chore/progress-compaction · NIT · PROGRESS.md:24 · 904 vs actual 903 old-line-count — fixed to 903 -> 187
[2026-07-03 13:30] FINDING chore/progress-compaction · NIT · docs/VISION.md:72 · inserted clause left a ~130-char line breaking wrap style — re-wrapped
[2026-07-04] Lane I · feat/ivrit-pipeline (16 commits, 018d8ad..c392fac) — IVRIT live pipeline MILESTONE 1: audio-only Recall ws → silence-aligned 20-45s chunker → RunPod ivrit (base64 blob, warm ~2.5s/35s chunk) → monotonic word-timeline stitcher → engine on :8788 serving the SAME /state+/pcm contract as live-broadcast.mjs (app viewer unchanged). New: src/lib/live/{wavEncode,pcmChunker,ivritStitcher,ivritParse}.ts + tests, scripts/{live-ivrit-broadcast.ts,replay-audio-feeder.mjs,spike-ivrit-live.ts,compare-live-quality.ts,make-wholefile-reference.ts,lib/runpod-live.ts}, spec+plan docs. SHARED SURFACE: src/lib/transcription.ts — pure character-for-character extraction of parseIvritSegments/extractIvritText into src/lib/live/ivritParse.ts (was appended to cross-cutting before the change; no behavior change, suite green). No DB migrations. VERIFIED: 63/63 unit tests (chunker byte-conservation, stitcher monotonicity incl. real RunPod fixture, buffer-budget rule) · tsc clean · build green · full-archive e2e replay (387s → 20 lines/146 words, monotonic 10..391.98) · quality compare vs Recall captions AND whole-file IVRIT (no chunking content loss; numbers on board) · /verify-app with eyes: karaoke live on :3002 mid-replay, buffer gate → join → highlight advancing, drift ~61s vs 60s buffer, console clean (screenshots in session, refs in state-ivrit.md). Final whole-branch review (cold context): READY TO MERGE, 0 critical; per-task reviews caught+fixed 2 Important defects (stitcher per-segment fallback 4f33fdb, engine queue resilience fccaf2d) + final hardening c392fac. FOLLOW-UP filed: tsconfig.scripts.json so scripts/** gets typechecked (repo-wide gap, affects both engines).
[2026-07-04] Lane I UPDATE · feat/ivrit-pipeline grew by one commit after the first REAL ZOOM test (2a98a83, pushed): fix(live) viewer resets on engine-session change. The real test exposed a viewer bug affecting BOTH pipelines (stale tab mixes two calls — see cross-cutting ALERT); engine /state now carries sessionId, LiveAudioProvider resets via liveSessionChanged() (unit-tested incl. the real repro, 64/64 green, tsc clean). Fix verified with eyes: joined page survived a live engine swap — words cleared, playhead re-anchored, console clean. NOTE for reviewer: this commit touches src/lib/live/LiveAudioProvider.tsx (shared live UI) — surgical addition in refresh(), engine parity contract otherwise unchanged. The ivrit ENGINE itself passed the real call (11.3 min, 34 chunks, all ON TIME, clean end flush).
[2026-07-04] Lane I UPDATE 2 · feat/ivrit-pipeline +1 commit (pushed): finish-flow wiring — engine writes the shared broadcast-* capture files + persists PCM, so the EXISTING finish path (Gemini polish -> finished transcripts row) works unchanged over IVRIT output (founder decision: end-of-call UX parity). E2E verified with eyes: replay -> ended -> POST /api/live/finish -> completed -> finished-call page renders fully, console clean. Shared-surface note: broadcast-* filenames now mean "current call's capture" from EITHER engine (cross-cutting TYPES entry filed). 64/64 tests, tsc clean.
[2026-07-04 13:07] VERDICT ivrit/feat/ivrit-pipeline — APPROVED (reviewer: 0 blockers, 1 WARNING + 2 NITs; reviewer re-ran suite itself 64/64 + tsc; supervisor gate: tests+tsc+build green in worktree, mission fit, no secrets/migrations. WARNING + comment-NIT fixed by supervisor on main pre-push; ws-close NIT = known shared M2 limitation, already filed)
[2026-07-04 13:07] FINDING feat/ivrit-pipeline · WARNING · src/lib/live/LiveAudioProvider.tsx:235 · The /api/live/state offline fallback ({lines: [], offline: true}, no sessionId) satisfies liveSessionChanged via the line-count-shrink heuristic, so a single transient engine-unreachable poll mid-broadcast wipes an active viewer's words/audio/persisted playhead and re-anchors to 0 — guard the reset with !st.offline.
[2026-07-04 13:07] FINDING feat/ivrit-pipeline · NIT · scripts/live-ivrit-broadcast.ts:106 · Retry-budget comment undercounts: each attempt can also burn the 30s submit timeout in runpod-live.ts, so true worst case is 3x(30+60)=270s, over the stated 240s-per-chunk budget.
[2026-07-04 13:07] FINDING feat/ivrit-pipeline · NIT · scripts/live-ivrit-broadcast.ts:226 · Any /ws close — incl. a Recall reconnect or stray client — sets liveEnded and flushes a premature mid-sentence tail chunk; mirrors live-broadcast.mjs's existing weakness (parity) but adds the chunk-split side effect (known M2 item: ws-reconnect).
[2026-07-06 21:40] READY Lane F — feat/frontend-import (10 commits incl. main-merge c8b26ac, pushed).
WHAT: Milestone 1 of the Claude Design import — the full V2 frontend: design tokens + fonts
(live #CB4B2E, Newsreader, JetBrains Mono data text), animation foundation (atlas-anim engine
port, LiveBeamAvatar radar-beam, verbatim keyframes), black-rail shell with Workspace+Agents
stub pages (frontend-only, behind lib/workspace/data + lib/agents/data interfaces), and
design-faithful restyles of Home (beam LIVE-NOW card), Calendar, Company (4 tabs incl. new
Reports/Webinars), Call view (dark-first data-call-theme scope, Single/Multi facets, buffer
AnimCanvas overlay, CALL SECTIONS rail), Chat + Ask Atlas (2026-07-06 design update: filled
spark icon, serif hero, warm composer, aa-panel slide-in, ask-yellow selection scope).
HOW VERIFIED: eyes-on vs rendered design (:8399) per page, EN + HE RTL mirrors, live replay
engine run (beam + karaoke + global-live-bar persistence + join flow + dark/light), real
Supabase data (Tamis specimen, real /api/chat answer with Hebrew citation chip), console
clean per page; battery green post-main-merge: tsc clean · 69/69 tests · next build.
SHARED SURFACES: token changes + SectionHeader restyle + font-mono-num→JetBrains Mono (all
pre-logged in cross-cutting 2026-07-04); NO migrations; NO API/type changes.
KNOWN GAPS (honest): drag-resize facet dividers not implemented (fixed 3-col Multi);
ghost-text autocomplete in the chat composer not implemented; Projects nav row is a stub;
webinars tab shows honest empty (no webinar type in data); one transient compositor glitch
seen once navigating company→call (not reproduced after reload, console clean — worth a
supervisor eye during review).

[2026-07-06 ~21:15] READY Lane F — feat/design-parity (stacks on feat/frontend-import; review after/with it)
WHAT: Design parity pass — founder flagged the M1 import as visibly worse than the Claude Design source.
  Root causes fixed: (1) app-wide font family was Inter/Calibri, design uses the system stack (probed
  from the RENDERED design; bundle CSS proved to be an older iteration — rejected); (2) missing design
  micro-anatomy rebuilt from the design's own markup: calendar type chips + hint + pill anatomy + hover
  context card; company identity extras (IR/indices/LIVE-TASE) + reported-quarter module + announcements
  + related companies; call-view facet chips + CALL SECTIONS default-open + stub slides/report content
  cards + design docked pill player + serif Ask-Atlas hero; home upcoming-card anatomy + TASE search
  mark + rail metrics. Density modules are stub-fed behind typed interfaces (lib/company/overview-stub,
  lib/live/call-stubs, lib/calendar/event-meta) mirroring the design demo content.
HOW VERIFIED: per-page A/B vs rendered design at :8399, EN + HE mirror + hover states; live surfaces
  against a REAL replay-engine run (join gate, karaoke sweep, behind chip, live pill, home beam,
  end-of-call teardown); tsc clean; 80 tests green incl. liveTiming invariants (77 pre-existing+new);
  next build green. Founder gate = live A/B walkthrough sheet (Artifact):
  https://claude.ai/code/artifact/f5377c95-744b-41dc-bb78-0748b6d9b7c8
  Full audit trail: docs/superpowers/plans/2026-07-06-parity-audit.md (probed foundations, findings,
  residual gaps).
SHARED SURFACES: fontFamily.sans added + body font swap (cross-cut 19:05); SectionHeader mono→SYS caps
  (cross-cut 19:40). No migrations. :8788 claimed + released (cross-cut 20:20/20:40).
KNOWN GAPS (in the sheet + audit doc): stub demo content identical across companies until real feeds;
  pill player keeps ±15/volume/close ghosts; drag-resize dividers / ghost autocomplete / Projects still
  out of scope; webinars tab designed-empty; live-broadcast header keeps plain Transcript label;
  comparison sheet is a live walkthrough (harness exposes no screenshot files); compositor glitch
  (CDP screenshot timeouts on heavy company→call navs) recurred — environmental, console always clean.

[2026-07-06 ~21:25] CORRECTION Lane F — feat/design-parity entry above: test count is 77/77 (not 80).

[2026-07-06 ~22:05] AMENDMENT Lane F — feat/design-parity round-2 (bc13af4, pushed): founder walked the
sheet and found real gaps my loop missed — frame PROPORTIONS (rail was 188px vs the design's probed
230px + 22/16 padding), Workspace/Agents stubs never truly A/B'd (my invented dashed cards = the
'cartoony outlines'; both pages rebuilt to exact design markup: black New-workspace button + 44px
search + 3-col grid; black command deck + mono agent cards + thin-dash create card), and the Ask-Atlas
open lurch (my M1 choice collapsed CALL SECTIONS on chat-open — design keeps it; also facet columns now
keep min-widths + row scrolls horizontally per design line 443). Battery: tsc clean, 77/77, verified
eyes-on. LESSON for reviewer + skill graduation: A/B EVERY page including 'done-looking' stubs, and
measure the FRAME (rail/paddings/max-widths) before components.

[2026-07-07 ~01:40] AMENDMENT Lane F — feat/design-parity round-3 (96cb676, pushed): full founder punch-list.
Theme toggle back (Warm/Black-rail/Black+white via --rail/--shell CSS vars, localStorage), serif Newsreader
page headlines (design default per founder refs), wordmark 84px, calendar full-width, call dark bg #0A0A0A
= rail (design source line 2366), PLAYER BAR REVERTED to original charcoal (founder DECISION, cross-cut
01:40-adjacent), ask-panel lurch ROOT-CAUSED (focus() mid-slide scrolled the whole document; fixed with
preventScroll — diagnosed from founder screen recording frames via ffmpeg), company Ask Atlas = in-page
light dock (no more chat-page redirect), Multi view: drag-resize gutters (design dc 2200-2237 algorithm)
+ Transcript removable with last-facet guard, quote-card hover shadow removed (design: actions fade only),
chat Projects icon = design glyph, countdown gate = single canvas ring seeded from real remaining.
Battery: tsc, 77/77, eyes-on each. NOTE: founder's two comparison videos were byte-identical (mockup
recording missing) — diagnosed from the bug video + design markup instead.

[2026-07-07 ~02:20] AMENDMENT Lane F — feat/design-parity round-4 (5a75e10, pushed): headlines to the
system/apple stack (founder final call — supersedes the round-3 serif experiment); buffer-canvas ink
INVERTED from theme per design callInkMode (dc 2422) — dark gate countdown was invisible; AnimCanvas
ResizeObserver dispatches the engine resize path so the countdown ring stays circular when the Ask
Atlas dock narrows the frame (founder screenshot showed an ellipse); LiveBeamAvatar rebuilt to the
design .ln-* anatomy exactly (50px item / 40px monogram w/ 1.5px red inner outline / 12px dot ON the
line / exact ln-pulse+ln-blink). Verified eyes-on incl. a live replay run; tsc + 77/77.
[2026-07-07 13:10] AMEND frontend/feat/design-parity - round-5 fine-tune commit b469346 on the queued branch: (1) countdown ink read per frame in atlas-anim buffer (theme flip mid-countdown no longer invisible in light mode) + countdown paced by wall clock not frame count (hidden-tab rAF suspension made the clock fall behind real time); (2) LIVE call now has Transcript/Slides/Report facet chips (shared FacetPanes extracted, finished view refactored to use them - Single and Multi verified intact); (3) auto-scroll SyncIcon button removed from the live facet bar (back-to-live chip covers it, matches finished view). Verified eyes-on: light/dark flips mid-countdown, 35s wall-clock tick check, facet toggling during live playback with audio continuing (player 1:40->2:11), finished-call Multi view. tsc clean, 77/77 tests.
[2026-07-08 03:38] AMEND frontend/feat/design-parity - round-6 commit 99b85a4 on the queued branch: (1) FONT TRUTH CORRECTED - the design uses TWO stacks; headlines use an SF Pro Display stack WITHOUT system-ui that resolves to ARIAL on Windows (not Segoe) - new fontFamily.head applied to home/calendar/company/workspace headlines, verified by canvas measureText: our greeting now measures byte-identical to the design (424.06); (2) live call gets full Multi view (Single|Multi pill, removable chips, drag gutters) via useFacetColumns extracted into FacetPanes, shared with the finished view; (3) PaneHeader fixed at 36px so all pane hairlines align across panes and meet gutters flush (founder-reported border misfit). Verified eyes-on: live Multi 3 panes + chip remove/re-add with audio rolling, finished Multi regression-checked, header-band zoom straight across. tsc clean, 77/77 tests.

[2026-07-14] READY frontend/feat/design-parity @ aecdb9e — FOUNDER-APPROVED parity work, ready for
supervisor review+merge TOGETHER WITH feat/frontend-import (review in order: frontend-import first,
design-parity on top; 26 commits total over main). Final additions since round-6: round-7 DS Tabs
scale-up (founder ask: 15px labels, taller row, inactive ink-muted not faint, 3px underline — SHARED
component, also restyles Live Transcript tabs, cross-cut logged) + home-greeting spacing investigated
pixel-by-pixel vs founder screenshots: mockup and app already identical (35px/35px subheading→search),
NO change made, founder accepted the finding. FOUNDER GATE PASSED 2026-07-14 ("okay its good" — viewed
live on :3001; DECISION line in cross-cutting). Battery: tsc clean · 77/77 tests · production build
green · founder eyes-on live (Chrome MCP extension disconnected this session — founder viewing + served-
HTML class check stood in for the screenshot pass). No migrations. Shared surfaces touched: ds/Tabs
(this entry), earlier token/font changes all previously cross-cut.

[2026-07-14 16:45] VERDICT frontend/feat/frontend-import+feat/design-parity — APPROVED (atlas-reviewer, 0 blockers / 3 WARNING / 6 NIT; supervisor battery independent: 77/77 + tsc clean in worktree @ aecdb9e; scope pass clean — zero touches to supabase/, scripts/, api/, lib/db, types). Merging to main.
[2026-07-14 16:45] FINDING WARNING lane-F/feat/design-parity — src/app/app/home/page.tsx:27 Hardcoded `quarter="Q2 2026"` is fake data inlined directly in a real page (not behind a stub module) and will silently mislabel every future live call's red tag on Home until someone remembers it.
[2026-07-14 16:45] FINDING WARNING lane-F/feat/design-parity — src/lib/company/overview-stub.ts:35 Every real company page now shows the SAME fabricated facts (IR contact, indices, fake reported quarter/CEO quote, fake MAYA announcements) with no demo/placeholder marker — stub-moduled and founder-gated, but misinformation-by-default on an investor product; needs a visible stub marker or launch-blocking TODO.
[2026-07-14 16:45] FINDING WARNING lane-F/feat/design-parity — src/components/live/LiveBroadcastView.tsx:276 `ringSecsRef` freezes the countdown seed once and never resets on a live-session change — engine restart under an open buffering tab keeps ticking the OLD session's countdown (visual only, join gating stays phase-driven, but sits beside the survive-restart invariant; deserves a session-keyed reset).
[2026-07-14 16:45] FINDING NIT lane-F/feat/design-parity — src/components/live/LiveTranscriptView.tsx:333 `segTogBtn` dead code references a `dark-toggle-on` class that exists nowhere in CSS.
[2026-07-14 16:45] FINDING NIT lane-F/feat/design-parity — src/components/live/TranscriptChatPanel.tsx:231 Send button aria-labelled `dict.common.save` — wrong label for screen readers.
[2026-07-14 16:45] FINDING NIT lane-F/feat/design-parity — src/components/live/MediaPlayer.tsx:1 UTF-8 BOM introduced before 'use client' (builds fine; byte-level tooling trap).
[2026-07-14 16:45] FINDING NIT lane-F/feat/design-parity — package.json:9 `"test"` script line lost its indentation (valid JSON, ugly diff magnet).
[2026-07-14 16:45] FINDING NIT lane-F/feat/design-parity — src/lib/design/tokens.ts:51 tokens.v2.callDark family diverged from globals.css shipped values (--call-bg:#0a0a0a); call-dark/call-panel Tailwind colors now unused — two sources of truth, one stale.
[2026-07-14 16:45] FINDING NIT lane-F/feat/design-parity — src/components/app/UpcomingCard.tsx:32 Widespread ad-hoc hex in components (also agents page, LiveBeamAvatar) violates the plan's own colors-via-tokens rule and won't follow the scheme-toggle CSS variables.
