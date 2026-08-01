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

[2026-07-14 18:20] VERDICT supervisor/chore/environment-audit-fixes — APPROVED (atlas-reviewer, 0 blockers / 4 WARNING / 3 NIT; all warnings + 2 nits FIXED pre-merge in a follow-up commit, re-verified: 60/60 gate tests). Supervisor battery: 77/77 · tsc · gate suite. Production build not re-run post-merge: branch touches zero src/ files and build was green on identical product tree (81609d8) — noted for transparency.
[2026-07-14 18:20] FINDING WARNING supervisor/chore/environment-audit-fixes — pre-bash-gate.mjs: plain rm/Remove-Item deletion of the append-only logs was not blocked (rm-guard only fired on recursive+force). FIXED pre-merge.
[2026-07-14 18:20] FINDING WARNING supervisor/chore/environment-audit-fixes — pre-bash-gate.mjs: whole-file replacement bypasses (cp/mv onto a log, dd of=, noclobber >|) exited 0. FIXED pre-merge (destination-aware check; snapshot copies FROM logs stay free).
[2026-07-14 18:20] FINDING WARNING supervisor/chore/environment-audit-fixes — parallel-work.md ports claim "other docs never restate the numbers" was false on arrival (verify-app, ENVIRONMENT, LAUNCH-KIT prompts, live-test all restate). FIXED pre-merge: claim reworded to precedence + fleet-lint check 6 flags restatements; full de-restatement sweep left to lint.
[2026-07-14 18:20] FINDING WARNING supervisor/chore/environment-audit-fixes — ARCHITECTURE.md gate-tests.mjs row described it as "runs the test suite before commits" (wrong function + trigger) in the doc-truth commit itself. FIXED pre-merge.
[2026-07-14 18:20] FINDING NIT supervisor/chore/environment-audit-fixes — live-test step 2 still hardcoded :3000 contradicting its own IVRIT-variant note. FIXED pre-merge.
[2026-07-14 18:20] FINDING NIT supervisor/chore/environment-audit-fixes — tee --append (GNU long form) falsely blocked by the tee guard. FIXED pre-merge.
[2026-07-14 18:20] FINDING NIT supervisor/chore/environment-audit-fixes — commit 6aac755 label ("enforce append-only logs") also carries the parallel-work supervisor-note/counts rules (mislabeled payload). NOT fixed (history stays); noted as a defect class for fleet-lint check 3.
[2026-07-16] READY Lane M — feat/multiview-backend @ 47ac911 (17 commits over origin/main incl. 1 merge-from-main; range 473fe7b..47ac911, count from `git rev-list --count origin/main..HEAD` = 17, pushed). WHAT: Multiview M1 — real quarterly-report PDF behind the Report facet pane, end to end: additive migration 20260714_012 (company_documents + document_pages, RLS read-auth; APPLIED to the shared DB this session) · Hebrew-safe per-page extraction (spike algorithm, 6 quirk-case tests) · idempotent ingest lib+CLI (demo Tigbur report SEEDED, 31/31 pages) · auth-gated /api/documents + private-bucket file stream · pdf.js viewer with selectable text layer in ReportPane (stub card fallback intact) · marked PDF passage seeds Ask Atlas with documentRef grounding (auth-gated in /api/chat). Also ships the fleet append-log door (scripts/append-log.mjs + settings allow rule, founder-added). HOW VERIFIED: SDD per-task implementer+reviewer gates + final whole-branch review (9/9 fixes re-approved) · battery post-merge-with-main: 86/86 tests, tsc clean, build green · eyes-on Chrome MCP e2e on :3003 — PDF renders, Hebrew drag-selection seeds the chat, streamed answer opens "על פי הקטע המסומן בדוח הדירקטוריון" and lists the marked segments, both themes, console clean. THREE live-run bugs found+fixed during verification (b1e0240, 9c9ff0d): companies.ticker→tase_security_id · webpack-mangled pdfjs → native import from public/pdf.min.mjs · pdf.js buffer-transfer detached the upload array (0-byte PDF) + hour-long cache pinning it → extraction copies, route no-store. EVIDENCE: docs/evidence/feat-multiview-backend/2026-07-16-m1-e2e-verification.md (main checkout). SHARED SURFACES: new tables/bucket (additive, applied+logged in cross-cutting) · .claude/settings.json allow rule · public/pdf.min.mjs + public/pdf.worker.min.mjs committed pdfjs copies (re-sync BOTH on pdfjs-dist bump).
[2026-07-16 night] READY-ADDENDUM Lane M — feat/multiview-backend now @ ee5b282 (2 commits on top of the 47ac911 entry above, pushed): founder-session fixes. (1) FREEZE: hour-long word-timed calls froze on play — the call view subscribed to the raw 60fps playhead and re-rendered the whole transcript tree every frame; new usePlayerTimeDerived() re-renders only when the active word / displayed second changes. VERIFIED live: transcripts row 2gXp90F8s6w (relabeled to Tigbur Q2 2026 per founder mockup request, originals in cross-cutting) plays with karaoke tracking + the PDF pane. (2) PDF SELECTION TEXT OVERSIZED (founder-reported): pdf.js 5.4 sizes text spans via --total-scale-factor which our .pdftext CSS never derived from --scale-factor → calc collapsed → 16px fallback (~60% oversized). Derivation line added to globals.css; measured root cause (computed 16px vs intended ~9.9px). Visual confirmation pending founder morning look — Chrome disconnected overnight; NOTE for verifiers: pdf.js render pacing uses rAF, which Chrome freezes in HIDDEN tabs — the text layer only finishes while the tab is visible, so verify with the tab foregrounded. Battery post-fixes: 86/86 · tsc clean · build green.
[2026-07-16] READY-ADDENDUM-2 Lane M — feat/multiview-backend now @ 66ae692 (1 commit on top of ee5b282, pushed): founder round 2, plan at docs/superpowers/plans/2026-07-16-multiview-founder-round-2.md. (1) PDF marking now NATIVE: the [data-ask] ::selection ink color was repainting the invisible text-layer glyphs (doubled words); .pdftext selection = translucent yellow wash + transparent glyphs, verified magnified in both themes. (2) Breathing room per founder screenshot: sub-toolbar strip deleted; copy/chat/edit icons + collapsible search icon relocated into the chips row; panes start directly under the chips row. (3) Report pane zoom − /%/ + (75–200%, % resets), h-scroll past pane width; selection→Ask Atlas verified working at 125%. Battery: 86/86 · tsc · build green. Eyes-on via Chrome MCP on the Tigbur finished call. NOT done (founder answer read as ambiguous): auto-collapsing the app NavRail on call pages for true full-width — offered as follow-up.
[2026-07-16] READY-ADDENDUM-3 Lane M feat/multiview-backend @ 631173f (3 commits on top of 66ae692: 9c013eb, 7a44687, 631173f, pushed) — founder round 3 items 1-8: PDF selection anti-balloon (endOfContent guard) · direction-aware 'back to current word' chip · rail-black audio bar (TOKEN CHANGE in cross-cutting) · bar-close keeps playback (barHidden) · Report pane page nav · spaced+restyled chat seeds · Multi auto-collapses rail+speaker panel · dark-theme .md contrast. Battery: 86/86 tests, tsc clean, prod build green. Eyes-on: VERIFIED bar==rail color (rgb 10,10,10 both), Multi collapse, page nav jumps+label. PARTIAL: playback-dependent checks + selection drags BLOCKED by founder-Chrome media-service hang (even blob audio stalls at readyState 0, renderer freezes 30-60s; NOT app code — needs Chrome restart, then re-verify). Plan: docs/superpowers/plans/2026-07-16-multiview-founder-round-3.md. Items 9 (YouTube Q1 transcript swap) + 10 (Pinge feature) NOT built — need pipeline run + founder brainstorm respectively.
[2026-07-17] READY-ADDENDUM-4 Lane M feat/multiview-backend @ 35670ec (pushed) — round 3 CLOSED: items 1-8 re-verified eyes-on after founder Chrome restart (playback survives bar-close +3.5s measured; chip arrow both directions; seeded PDF text spaced vs fused raw toString proof; page nav; multi collapse/restore class-level; dark-md computed colors). Item 9 DONE: real Tigbur Q1-2026 call at /app/live/PyuMxe88e8g_live (275 word-timed segments, data verified 2642 words 0.4s-23:09, no nulls) paired with Q1-2026 report doc e231c676; Zim mockup row reverted; new CLI scripts/retranscribe-call.ts (35670ec). Battery 86/86 + tsc clean. CAVEAT: audible-playback eyes-on of the NEW row blocked by Chrome deferring media load in never-visible automation windows — founder one-look needed. Item 10 (Pinge) = brainstorm next, fresh Lane M session recommended.
[2026-07-17] READY-ADDENDUM-5 Lane M feat/multiview-backend @ 75d198d (pushed) — founder round 4: (a) FIX my round-3 regression: PDF marking was fully broken — the endOfContent guard lacked pdf.js's companion z-index rule (spans z-1 above guard z-0), so once armed at pointerdown it covered the glyphs; hit-test verified fixed (glyph span under pointer mid-drag, guard still owns margins). (b) NEW: zoom>100 auto-recenters the overflowing page + left/right pan buttons beside zoom. Battery 86/86 + tsc clean. Real-hand drag = founder confirms (CDP synthetic drags cannot create native selections — known limitation).
[2026-07-17] NOTE Lane M feat/multiview-backend — BOTH open caveats CLEARED by founder eyes/hands-on: audible playback of the new Tigbur Q1-2026 call (PyuMxe88e8g_live, karaoke tracking) confirmed working + real-hand PDF drag-select marking confirmed working ('tested it and its great'). ADDENDUM-5 @ 75d198d has no remaining caveats; supervisor review/merge now in progress per founder.
[2026-07-17 20:31] VERDICT multiview/feat/multiview-backend — APPROVED (atlas-reviewer: 0 blockers / 2 WARNING / 4 NIT; reviewer re-ran battery itself 86/86 + tsc clean, verified public/pdf.min.mjs+worker byte-identical to pdfjs-dist 5.4.296, hand-traced extraction quirk cases + auth gates, confirmed migration additive+RLS+pre-logged, no secrets, scope clean. Supervisor independent gate in worktree @ 75d198d: 86/86 · tsc clean · production build green; spot-checks on /api/documents auth, chat documentRef gate, migration SQL, settings.json allow rule all clean; mission fit confirmed). Merging to main.
[2026-07-17 20:31] FINDING feat/multiview-backend · WARNING · src/lib/documents/extract.ts:69 · pdfjs-dist is imported directly (also typed in PdfViewer.tsx:9) but never declared in package.json — it rides in as pdf-parse's transitive dep, so a future pdf-parse bump silently desyncs node_modules pdfjs from the committed public/pdf.min.mjs copies (API/worker version mismatch breaks both viewer and ingest); declare it as a direct pinned dependency.
[2026-07-17 20:31] FINDING feat/multiview-backend · WARNING · src/components/live/FacetPanes.tsx:207 · A failed/401 documents fetch silently falls back to the FABRICATED stub report (reportStub()) with no demo marker — now that real reports ship, an error path renders fake financial facts indistinguishable from real ones, amplifying the already-filed stub-before-launch finding.
[2026-07-17 20:31] FINDING feat/multiview-backend · NIT · src/components/live/LiveTranscriptView.tsx:96 · Leaving Multi dispatches collapsed:false unconditionally — autoCollapsedRef never captured the rail's prior state, so a rail the user manually collapsed BEFORE entering Multi gets force-expanded, contradicting the "restore ONLY what we collapsed" comment.
[2026-07-17 20:31] FINDING feat/multiview-backend · NIT · src/components/app/GlobalPlayer.tsx:14 · With barHidden the audio keeps playing but the only un-hide affordance lives inside the call's own transcript view — on every other page there is zero visible control over playing audio (founder-directed UX; the trap on other pages deserves a follow-up chip or mute affordance).
[2026-07-17 20:31] FINDING feat/multiview-backend · NIT · src/components/live/PdfViewer.tsx:120 · onMouseUp grounds only the selection's start and end pages (getRangeAt(0) endpoints), so interior pages of a 3+-page selection are omitted from documentRef while their text still appears in the quoted passage.
[2026-07-17 20:31] FINDING feat/multiview-backend · NIT · .claude/settings.json:14 · Bash(node scripts/append-log.mjs *) pre-approves whatever that repo-editable script does — a future edit to the script inherits blanket execution approval (same class as the existing live-replay-engine allow; worth a fleet-lint rule that allowlisted scripts get hash-pinned or review-flagged on change).
[2026-07-17 night] READY Lane M — feat/pinge @ ff4c8f9 (11 commits over feat/multiview-backend@75d198d, range 75d198d..ff4c8f9 from git rev-list --count, pushed; STACKS ON the queued feat/multiview-backend entry — review/merge that first). WHAT: Pinge snip-to-chat, founder-brainstormed same day (spec docs/superpowers/specs/2026-07-17-pinge-design.md, plan docs/superpowers/plans/2026-07-17-pinge-plan.md): scissors button on the Report pane → OS-style drag-rectangle over the PDF → offscreen 2x re-render crop (zoom-proof PNG ≤1600px) → thumbnail chip(s) in Ask Atlas (≤4, ✕-removable, cap toast) → Gemini gets inline_data images + Hebrew page captions + page-text grounding ride-along (GPT-4.1 fallback gets image_url) → answers cite the page and read digits from pixels. PLUS marking-UX unification: PDF text-mark no longer auto-opens chat — floating Ask-Atlas button when chat closed / auto-reference when open, for text AND snips, finished AND live views (live ReportPane newly wired for selection+snip). Attachments auth-gated server-side exactly like documentRef. HOW VERIFIED: TDD (13 new unit tests, suite 99/99, files registered in package.json test list) · tsc clean · prod build green · e2e on the REAL Tigbur Q1-2026 call: drag over the page-6 financial table → chip → streamed Gemini answer opened "על פי הטבלה שבעמוד 6" and read the exact table digits (358.7/358.5, 25.9/27.7, 7.2%/7.7%) · cap/remove/empty-send/unification/dismissal all probe-verified · zoom-proof capture proven numerically at 100% and 125% (chip naturalWidth matches 2x-PDF-unit math to the pixel) · console clean. ONE BUG found+fixed in verification: unguarded setPointerCapture killed the drag for synthetic/stale pointers (ff4c8f9). EVIDENCE: docs/evidence/feat-pinge/2026-07-17-pinge-e2e-verification.md (main checkout) — includes the hidden-window method notes (rAF shim, frame pumps). CAVEATS for founder one-look: real-hand drag feel · dark-theme chip/veil polish (class-verified only, hidden-window screenshots flaky) · live-view parity is code-identical but not exercised against a running engine. SHARED SURFACES: /api/chat request shape (+attachments, additive) · lib/api/chat.ts ChatInput (additive) · ds/icons +ScissorsIcon · dict live/chat +5 keys (both locales). No migrations, no DB writes.
[2026-07-23] NOTE Lane M feat/pinge - FOUNDER ONE-LOOK PASSED ('checked the pinge, it works amazingly'): real-hand drag feel confirmed. The READY entry's founder-one-look caveats are cleared; feat/pinge @ ff4c8f9 awaits supervisor review/merge with no remaining caveats. Heads-up: founder is finishing a NEW app-wide design round today (Ask Atlas panel, colors/typography, call-view UX) - Lane M recommends merging pinge BEFORE importing it, since the redesign touches the same surfaces (chat panel, call view).
[2026-07-23 01:24] VERDICT multiview/feat/pinge — APPROVED (atlas-reviewer: 0 blockers / 4 WARNING / 4 NIT; reviewer re-ran battery itself 99/99 + tsc clean, hand-checked crop math (cssScale + 2x offscreen render = zoom-proof), auth gate (attachments hard-cleared pre-lookup when no user), additive wire shape, both-locale dict keys, evidence file substantive. Supervisor independent gate in worktree @ ff4c8f9: 99/99 · tsc clean · production build green; spot-checks on /api/chat additivity, parseAttachments validation caps, scope footprint, mission fit all clean. 4 WARNINGs = fix-forward for Lane M next chapter, filed below; cross-cut gap remedied by supervisor retro-append). Merging to main.
[2026-07-23 01:24] FINDING feat/pinge · WARNING · src/components/live/TranscriptChatPanel.tsx:122 · A snip-only send stores content:'' in local messages, so the next turn's history produces a Gemini part {text:''} — Gemini rejects empty text parts, silently downgrading every follow-up in that conversation to the GPT-4.1 fallback; store outMessage in history or filter empty entries.
[2026-07-23 01:24] FINDING feat/pinge · WARNING · src/components/live/LiveBroadcastView.tsx:594 · onSnipError={() => {}} swallows snip-capture failures in the live view even though the view has a toast facility — LiveTranscriptView shows dict.chat.snipFailed, the live view shows nothing.
[2026-07-23 01:24] FINDING feat/pinge · WARNING · src/lib/api/chat.ts:12 · The shared ChatInput / /api/chat wire-shape change was never appended to cross-cutting.md before the change as parallel-work law requires (supervisor filed a retroactive TYPES line at merge time).
[2026-07-23 01:24] FINDING feat/pinge · WARNING · src/components/live/PdfViewer.tsx:186 · Client never checks the captured PNG against ATTACHMENT_MAX_B64, so a >2MB-base64 snip renders as a chip but is silently stripped server-side — the model answers without the image and the user gets no signal (known silent-fallback defect class).
[2026-07-23 01:24] FINDING feat/pinge · NIT · src/components/live/LiveBroadcastView.tsx:139 · The live view's ~60-line copy of the pdfPending/firePdfPending state machine was never exercised against a running engine — tsc-verified only.
[2026-07-23 01:24] FINDING feat/pinge · NIT · src/components/live/TranscriptChatPanel.tsx:80 · setCapMsg(true) + setTimeout run inside the setSnips state-updater — updaters must be pure; StrictMode double-invokes it (double timer, harmless today).
[2026-07-23 01:24] FINDING feat/pinge · NIT · src/components/live/TranscriptChatPanel.tsx:280 · Hebrew chip label inside a forced dir=ltr wrapper with no dir=auto on the span; evidence run was EN locale only — he-locale bidi rendering of the chip label untested.
[2026-07-23 01:24] FINDING feat/pinge · NIT · src/app/api/chat/route.ts:142 · Captions and page-text grounding assume all attachments share attachments[0].documentId — a mixed-document set would mis-caption and drop grounding for the second doc (unreachable from current UI, wire format permits it).
[2026-07-23] READY Lane M - fix/review-warnings @ af0f08d (4 commits over origin/main, range 3e7f0d5..af0f08d from git rev-list --count, pushed). WHAT: all 6 earmarked reviewer WARNINGs fixed (4 from feat/pinge verdict 2026-07-23, 2 carried from feat/multiview-backend verdict 2026-07-17): (1) snip-only sends no longer poison follow-ups into silent GPT fallback - new pure src/lib/chat/history.ts sanitizeHistory (drops empty turns, prefers apiContent = what the model actually received), applied in TranscriptChatPanel AND /api/chat (untrusted body); (2) live view now toasts snip-capture failures (was a swallowed no-op); (3) process WARNING acknowledged - no wire shapes touched this branch, lesson in state file; (4) oversized snips refused client-side with dedicated snipTooBig toast (attachmentOversized mirrors parseAttachments cap) instead of chip-renders-but-server-strips; (5) pdfjs-dist pinned exact 5.4.296 as direct dep (was transitive via pdf-parse); (6) stub report card carries a demo-content pill (both locales, covers no-doc AND fetch-error paths). HOW VERIFIED: TDD red-first on both pure functions; battery 104/104 (5 new tests, history.test.ts registered in package.json list) + tsc clean + prod build green; eyes-on Chrome MCP on :3003 (stale 07-17 dev server killed first): real Tigbur Q1 PDF path intact (1/31, scissors+zoom), poison-history behavioral probe against real Gemini = 200 + x-chat-fallback null + streamed answer (pre-fix this history 400'd Gemini into silent fallback), demo badge dark+light RTL-correct, console clean. CAVEAT: the two toast paths not visually triggered (impractical to induce); wiring typechecked + code-identical to the Pinge-verified finished-view toast. EVIDENCE: docs/evidence/fix-review-warnings/2026-07-23-warnings-verification.md (main checkout). SHARED SURFACES: none (history.ts is a new internal module; /api/chat wire shape unchanged; dict +2 keys both locales).
[2026-07-23 03:02] VERDICT multiview/fix/review-warnings — APPROVED (atlas-reviewer: 0 blockers / 0 WARNING / 0 NIT — zero findings; reviewer re-ran battery itself 104/104 + tsc, verified each of the 6 fixes against the original finding texts: sanitizeHistory alternation-safe + apiContent never reaches UI or wire · toast signatures consistent at every call site · oversize check byte-identical arithmetic to parseAttachments, boundary unit-tested · pdfjs-dist exact-pinned 5.4.296 matching committed copies + lockfile · demo pill covers no-doc/fetch-error/401 both locales bidi-safe · wire shape unchanged, scope exactly 14 claimed files. Supervisor independent gate in worktree @ af0f08d: 104/104 · tsc clean · production build green; spot-checks on pin, test registration, dual-side sanitize, shared-constant oversize check all clean. Reviewer residual notes, pre-existing on main, NOT this branch: reportFreely header label still shows over the stub card; assistant error messages enter history as assistant turns). Merging to main.

[2026-07-31] READY Lane F — feat/design-round-2 @ 88d9712 (13 commits, range a9964a8..88d9712 from git rev-list --count / merge-base, PUSHED to origin; origin/main merged in cleanly — 2 docs commits, no conflicts). 39 files changed, 1578 insertions(+), 551 deletions(-). WHAT: the founder's app-wide design round 2 (Harvey), aesthetic-only per DECISION 2026-07-25 — (1) Harvey token layer, single light theme; the Warm/Black-rail/Black+white cycle + data-scheme attribute DELETED app-wide; (2) 100-occurrence warm→Harvey hex sweep driven by the design's OWN translation table (Atlas MVP.dc.html line 154), not hand-picked; (3) shell + Home + Calendar + Chat + Company restyled; (4) call views go LIGHT (reverses the 07-07 dark-call decision) — only the black rail and black docked player stay dark; (5) multiview panes float; (6) Ask Atlas panel rebuilt to design geometry (347px) with the Pinge scissors added to the composer via a new snipBridge (TDD); (7) founder round-2 notes all fixed @ 6661c02: floats on single-view too, flat controls row (probed — the design's row has NO card), scissors always visible + mic affordance, per-context connected captions, zero separator lines. HOW VERIFIED: battery after the origin/main merge = 108/108 tests · tsc --noEmit clean · npm run build green. Parity probes EXACT vs the RENDERED design (never bundle CSS) after 2 inline fixes; accepted diff = player height 54 vs 52 (our player is intentionally not the design's). FOUNDER BIG-REVEAL GATE PASSED 2026-07-31 ("everything is good") — DECISION filed in cross-cutting. Eyes-on this session in the founder's authed Chrome: /app/home, the light call view on the real Tigbur Q1 call, the real 31-page PDF in the Report pane, and the NEW composer scissors → real drag-crop → thumbnail chip with p.1 badge. Console zero errors. EVIDENCE: docs/evidence/feat-design-round-2/2026-07-25-harvey-verification.md + 2026-07-31-founder-reveal-and-ship.md (both committed on the branch). SHARED SURFACES — READ BEFORE MERGING: design tokens rewritten (v2 warm family → Harvey grays) and the callDark..callFaint DARK-CALL FAMILY DELETED; any branch consuming tokens.v2.* or the data-scheme/atlas-scheme attribute will conflict. Lane M is gated on this merge by DECISION 2026-07-23 03:16, so its next chapter should branch off main AFTER it lands. No DB migrations, no API/wire-shape changes. RESIDUAL (not blockers, but the reviewer should see them): (a) the Gemini round-trip with a composer-originated snip was NOT re-sent this session — the chip + real crop are verified, the send path is unchanged code already verified in feat/pinge; (b) LiveBroadcastView + the countdown ring received the same mechanical Harvey color changes but were never run against a live engine (typecheck/build only) — needs a replay pass on :8788, which is single-owner and must be claimed; (c) commit 88d9712's subject line carries a stray leading "@" (my shell-quoting slip; force-push to fix is hook-blocked, so it stands as-is). TWO NON-BUGS recorded in the 07-31 evidence file so nobody re-investigates: the blinking caret in transcript text is Chrome Caret Browsing (F7) — main has 0 contenteditable / 0 inputs / user-modify read-only / designMode off; and a "PDF blown up when Ask Atlas opens" scare was the hidden-tab pdf.js re-render stall (documented in /verify-app), which resolved to a correct 985px fit the moment the tab was foregrounded.
[2026-07-31] VERDICT frontend/feat/design-round-2 — CHANGES (atlas-reviewer: 1 BLOCKER / 7 WARNING / 6 NIT). Reviewer re-ran the battery itself: 108/108 tests, tsc exit 0 (build skipped by supervisor instruction — supervisor ran it clean after wiping a stale .next). Reviewer verified clean: theme-cycle deletion complete on the runtime path (zero data-scheme reads, zero orphaned vars, one-shot localStorage migration in NavRail correct); no dark-assumption leftovers; /print/[id] unaffected; no migrations, no secrets, no legacy-gateway imports; no logic/data/auth/wire change hiding under the restyle; both snip entry points reach setSnipArmed with symmetric listener add/remove. Supervisor independently spot-checked the BLOCKER + 5 WARNINGs against the real files/screenshot — all confirmed accurate. NOT MERGED; fixes listed in the Lane F board section.
[2026-07-31] FINDING feat/design-round-2 · BLOCKER · docs/evidence/feat-design-round-2/2026-07-25-harvey-verification.md:31 · The evidence file claims "Ask Atlas panel visible in the app shot", but app-call-multi-en.jpg shows the panel CLOSED (supervisor confirmed by viewing the image: only the "+ Ask Atlas" button is present, no panel). The branch's headline surface — the 347px panel, the new composer with scissors/mic/send, its RTL mirroring — has ZERO committed visual evidence in either locale. Durable-evidence law violation: a cited artifact does not show what it is cited for.
[2026-07-31] FINDING feat/design-round-2 · WARNING · src/app/app/agents/page.tsx:16 · Agents page restyled (9 hex swaps) despite the founder scope-lock decision "Workspace + Agents get NO work this round / Untouched: Workspace/Agents stubs" — a locked-scope stowaway, undeclared in the verification file.
[2026-07-31] FINDING feat/design-round-2 · WARNING · src/components/workspace/WorkspacePicker.tsx:25 · Workspace page half-converted: colors changed but the headline was left on font-head, so its H1 is now the only headline in the app still rendering the old Arial/SF-Pro-Display stack while Home/Calendar/Company/Chat moved to font-display Newsreader — visibly inconsistent.
[2026-07-31] FINDING feat/design-round-2 · WARNING · src/components/live/LiveBroadcastView.tsx:709 · The buffering/countdown overlay is still pinned top-[63px] after the identity header shrank to h-[58px] (line 368), leaving a 5px strip of the facet-control row visible above the overlay. Supervisor confirmed both numbers in the file. On the exact live surface the evidence file admits was never exercised.
[2026-07-31] FINDING feat/design-round-2 · WARNING · src/components/company/CompanyOverview.tsx:308 · Warm gradient rgba(242,238,230,.5) survived the sweep and now washes beige over the neutral #F7F7F7 Harvey card on a real Company page — the one missed hex family in an otherwise complete conversion. Supervisor confirmed the literal is still present.
[2026-07-31] FINDING feat/design-round-2 · WARNING · tailwind.config.ts:50-60 · Eight call-* colour aliases were kept with INVERTED meanings (call-dark to #FFFFFF, call-faint to #767676) under a comment asserting they "keep the 131 existing call-* class sites rendering" and that "Task 6 DELETES these aliases" — both claims false: supervisor grepped the branch for bg-/text-/border-call-* and found ZERO usages (the 131 sites use plain globals.css classes off :root vars), and Task 6 shipped without removing them. Residue of a half-removed theme system, with a misleading comment attached.
[2026-07-31] FINDING feat/design-round-2 · WARNING · src/lib/live/snipBridge.ts:2 · The module doc, the test contract comment (snipBridge.test.ts:7 "must be HIDDEN when no real doc is present") and the evidence file (verification md:44 "The scissors correctly HIDES") all describe a hide-when-unavailable rule that commit 6661c02 replaced with always-render + disabled (TranscriptChatPanel.tsx:355). Shipped behaviour is fine; the stated contract now contradicts the code on the exact law (visible degradation) it invokes.
[2026-07-31] FINDING feat/design-round-2 · WARNING · src/lib/design/tokens.ts:50 · railText moved #A6A29A to #6B6862 on the #0A0A0A rail, taking inactive nav-item contrast from ~7.8:1 to ~3.6:1 — below the WCAG AA 4.5:1 threshold. The probe (harvey-design-tokens.json:10) records this value, so it is a FAITHFUL import of the founder's design, not a coding error; but it is a legibility regression that belongs to an explicit founder decision, not a silent side effect. FOUNDER CALL REQUIRED.
[2026-07-31] FINDING feat/design-round-2 · NIT · src/components/live/TranscriptChatPanel.tsx:356 · enabled:hover:call-ink generates nothing — call-ink is a plain globals.css class, not a Tailwind utility, so the new composer scissors has no hover feedback (same dead pattern as the pre-existing hover:call-ink sites).
[2026-07-31] FINDING feat/design-round-2 · NIT · src/components/live/FacetPanes.tsx:94 · PaneCard hardcodes rgba(28,24,14,0.06), rounded-[16px] and bg-white inline, violating the plan's own constraint ("No ad-hoc hex/radius/shadow inline in components — everything through tokens") and skipping the hairline token this branch just established.
[2026-07-31] FINDING feat/design-round-2 · NIT · src/components/live/FacetPanes.tsx:191 · Effect deps [doc, onSnip] where onSnip is an unmemoized function declaration in the parent (LiveTranscriptView.tsx:344), so the effect re-runs on every parent render — during a live call this emits a false-to-true blip through the global store many times per second, forcing an extra TranscriptChatPanel render each time.
[2026-07-31] FINDING feat/design-round-2 · NIT · src/components/ds/icons.tsx:208 · ThemeIcon is now an unreferenced export — the last orphan of the removed theme toggle.
[2026-07-31] FINDING feat/design-round-2 · NIT · src/components/live/TranscriptChatPanel.tsx:364 · A permanently-disabled mic button ("Voice ask — coming soon") is a NEW non-functional affordance added under an "aesthetic-only, no new features" lock; it also makes the composer 3 buttons vs the probe's documented 4 ("scissors left; tuner, mic, black round send right"), a deviation absent from the evidence file's otherwise-diligent deviations list. FOUNDER CALL (keep the dead button or remove it).
[2026-07-31] FINDING feat/design-round-2 · NIT · src/components/live/FacetPanes.tsx:352-385 · The PaneCard wrap left the doc-ternary branch at its old indentation and the closing div misaligned; the repo has no lint/format script to catch it.
[2026-08-01] AMEND Lane F/feat/design-round-2 @ 1475ab3 — REVIEWER FIX ROUND, back for re-gate (3 commits on top of 88d9712: af28f0b WARNINGs, b5f4ee5 NITs, 1475ab3 evidence; 16 commits over origin/main from git rev-list --count a9964a8..HEAD; PUSHED; origin/main merge = already up to date). ALL 14 FINDINGS ADDRESSED. BLOCKER (false evidence citation): the claim at 2026-07-25-harvey-verification.md:31 is corrected IN PLACE (original line kept, dated CORRECTION beneath) and the 347px panel now has real committed evidence in BOTH locales — app-ask-panel-en.jpg / app-ask-panel-he.jpg, captured via the panel's own open button; measured at capture and identical in both: width 347px, dir ltr/rtl, all 3 composer buttons present, 0 console errors (probe/ask-panel-capture.json). WARNINGs: railText -> #85817A (5.108:1 vs the #0A0A0A rail, real WCAG luminance math in probe/rail-contrast.json; DELIBERATE deviation from the import per founder decision — recorded at the token, in the probe, and in the evidence so a future parity probe does not undo it) · Workspace H1 -> font-display (verified computed Newsreader/500/34px) · Company warm rgba(242,238,230,.5) -> rgba(244,244,244,.5) per the design's OWN translation table dc line 154 (verified zero warm gradients left) · live overlay top-[63px] -> top-[58px] (MEASURED ON A RUNNING ENGINE: header bottom 58, overlay top 58, gap 0) · 8 inverted call-* Tailwind aliases DELETED after confirming zero utility-form usages across src/ · snipBridge doc + test comment + evidence aligned to the shipped always-render+disabled contract. Agents restyle and the mic button KEPT per founder decision, both now DECLARED in the evidence instead of silent. NITs: dead enabled:hover:call-ink -> enabled:hover:text-ink (same #0A0A0A, hover now actually fires) · PaneCard inline hex/radius -> new tokens.harvey.floatLine + border-float-line/rounded-win/bg-canvas · FacetPanes effect deps -> derived  boolean (was re-running every parent render and blipping the global store many times a second during a live call) · orphan ThemeIcon removed · indentation repaired. BOTH CARRIED RESIDUALS CLOSED: (1) Gemini round-trip from a COMPOSER-originated snip done end to end in the founder's authed Chrome — armed composer scissors, drag-crop of the page-1 Hebrew heading, chip with p.1 badge, activeElement confirmed to be the textarea BEFORE typing, clicked send; Gemini read the pixels ('Board of Directors Report on Corporate Affairs … three months ending on March 31, 2026. (Page 1)'), console clean (app-composer-snip-gemini-en.jpg). (2) Live-engine surfaces run against a RUNNING replay engine on :8788 (claim + release both appended to cross-cutting): buffering gate, countdown ring circular with legible dark ink on the light frame, join, live karaoke with behind-chip, black docked LIVE player — 0 console errors (app-live-buffering-en.jpg, app-live-playing-en.jpg, probe/live-engine-pass.json). HOW VERIFIED: battery 108/108 tests + tsc --noEmit clean + production build green (dev server stopped and .next wiped first); eyes-on via Playwright for the durable committed captures and the founder's authed Chrome for the real-PDF path. EVIDENCE: docs/evidence/feat-design-round-2/2026-08-01-review-fixes.md (states literally what each committed image does and does NOT show, since the BLOCKER was exactly that failure). SHARED SURFACES: tokens.harvey.railText VALUE CHANGED + tokens.harvey.floatLine ADDED + the 8 call-* Tailwind aliases REMOVED (zero usages, but any branch adding a bg-/text-call-* utility will now fail) — same design-token surface already flagged in the 07-31 READY entry. No migrations, no API/wire changes. HONEST RESIDUE: the x-chat-fallback header was not re-checked on the round-trip (answer is image-derived either way); two PRE-EXISTING dead hover:call-ink sites in SlidesPane deliberately left untouched (reviewer scoped its NIT to the new composer site, branch is under a scope lock); commit 88d9712's stray leading '@' still stands (force-push hook-blocked).
[2026-08-01] CORRECTION Lane F/feat/design-round-2 — one word was eaten by shell backtick substitution in the AMEND line directly above (my quoting slip, not a content change): 'FacetPanes effect deps -> derived  boolean' should read 'FacetPanes effect deps -> derived snippable boolean'. Everything else in that entry stands as written.
[2026-08-01] VERDICT frontend/feat/design-round-2 — APPROVED (atlas-reviewer re-gate round 2, against 1475ab3). Reviewer re-ran the battery itself: 108/108 tests, tsc clean. It verified all 14 prior findings FIXED against the real files, not against the lane's claims — notably it recomputed WCAG relative luminance itself (L(#85817A)=0.220964 vs L(#0A0A0A)=0.003035 = 5.109:1, matching the lane's claimed 5.108; worst case on the rail chip still 4.58:1), confirmed tokens.ts moved ONLY railText + the new floatLine, opened both new screenshots to confirm the Ask Atlas panel is genuinely OPEN in EN and HE, and grepped every utility form of the 8 removed call-* aliases across src/ for zero hits. BLOCKER genuinely closed: the false citation is corrected in place with a dated CORRECTION beneath the original line, and app-ask-panel-en.jpg (311,704 B) + app-ask-panel-he.jpg (310,008 B) exist and show what they are cited for. Residual (1) live-engine surfaces — BACKED by real captures from a running :8788 replay engine (claim + release both in cross-cutting). Residual (2) composer-originated snip → Gemini — PARTIAL, filed as a NIT below. Iron rules clean: zero files under supabase/, no API/lib/db/auth file in the diff, no secret-shaped hits, legacyBoundary test passing. SUPERVISOR GATE: own diff pass over 52 files — all UI/design + evidence + docs, package.json changed only to add the new test file; mission fit unambiguous. Battery on MERGED main: 108/108 · tsc clean · build green (full route table). MERGED e977823, pushed.
[2026-08-01] FINDING feat/design-round-2 · NIT · src/app/globals.css:166 · Twin of fixed WARNING #183 left behind: comment claims "components still carry the attribute; Task 6 removes the attribute" — no component carries data-call-theme (zero grep hits in src/) and Task 6 shipped, so a stale plan-promise comment still sits on the :root --call-* residue after the identical false claim was corrected in tailwind.config.ts. Carried into main knowingly.
[2026-08-01] FINDING feat/design-round-2 · NIT · src/components/live/LiveBroadcastView.tsx:366 · Stale comment "identity header (63px, design lines 253-268)" sits directly above the h-[58px] header and one line above the new comment tying 58 to 58 — the same doc-contradicts-code class this fix round just closed. Twin at src/components/live/LiveTranscriptView.tsx:459, which also still names the removed "Dark/Light" toggle. Carried into main knowingly.
[2026-08-01] FINDING feat/design-round-2 · NIT · docs/evidence/feat-design-round-2/2026-08-01-review-fixes.md:83 · The claim "composer scissors (the new round-2 entry point, not the Report-pane one)" is narrative-only — app-composer-snip-gemini-en.jpg has BOTH scissors in frame and cannot establish which one armed the snip. The artifact proves the round trip; it does not prove the entry point. The lane also self-declared that x-chat-fallback was not re-checked (answer is image-derived either way). Accepted at merge: the code path is shared and unit-tested (snipBridge.test.ts), so the risk is documentation precision, not behaviour.
[2026-08-01] READY supervisor/fix/app-login-gate — the /app/* + /print/* LOGIN GATE. src/middleware.ts (matcher-scoped, getUser() not getSession()) + pure unit-tested src/lib/auth/gate.ts (requiresAuth · resolveOrigin · loginRedirectTarget · safeNextPath) + LoginForm honouring ?next= + auth added to GET /api/live/finished-call/[id]. Written by the SUPERVISOR and deliberately sent through the same two gates as a lane's work (founder standing decision: the supervisor does not fix-and-self-review). Verified against a PRODUCTION build, both directions: anonymous 307s with destination preserved on every gated route, /print/demo gated, finished-call 401, forged X-Forwarded-Host refused, / and /auth/callback and /apple untouched; authenticated session passes through (eyes-on screenshot + in-page fetch probe). Battery 125/125 · tsc · build green. Evidence: docs/evidence/fix-app-login-gate/2026-08-01-login-gate-verification.md. No migrations, no DB change.
[2026-08-01] VERDICT supervisor/fix/app-login-gate ROUND 1 — CHANGES (atlas-reviewer: 3 BLOCKER / 4 WARNING / 4 NIT against 343d4c5). All three blockers independently reproduced by the supervisor before fixing — the reviewer was right on every one. Filed below so the defect classes reach /fleet-lint.
[2026-08-01] FINDING fix/app-login-gate · BLOCKER · src/lib/auth/gate.ts:50 · safeNextPath was a naive startsWith('/') && !startsWith('//') check, defeated by WHATWG URL parsing: /\evil.com, /\/evil.com, /<TAB>/evil.com and /<CR>/evil.com all pass and resolve to http://evil.com/ — an OPEN REDIRECT introduced by the very function written to prevent one. DEFECT CLASS: a security guard implemented as a prefix/blocklist check instead of by construction. FIXED — resolve against a throwaway origin, require the origin to survive AND requiresAuth(pathname); 79-payload battery in round 2, 0 escapes.
[2026-08-01] FINDING fix/app-login-gate · BLOCKER · src/app/api/live/finished-call/[id]/route.ts:8 · GET returned loadCompletedCall(id) — byte-for-byte the payload /print/[id] renders — unauthenticated via the SERVICE-ROLE client, so gating the page closed nothing and the branch's headline claim was false. DEFECT CLASS: gating a PAGE while the same data has an ungated API door. FIXED — 401 without a session.
[2026-08-01] FINDING fix/app-login-gate · BLOCKER · docs/evidence/fix-app-login-gate/2026-08-01-login-gate-verification.md · the evidence file certified /api/admin/requests as "correctly gated" — false: requireAdmin uses getSession(), which in auth-js 2.105.4 (__loadSession, GoTrueClient.js:2327) reads the session out of the COOKIE with a shape check and a cookie-supplied expires_at, no signature check and no network call. Same primitive backs getRequestUserId (lib/auth.ts:23) and getCurrentUser (:40). DEFECT CLASS: certifying code as safe without reading the primitive underneath. DOC FIXED; the CODE fix is deferred to its own branch and filed at the top of .claude/rules/app.md + as item 0 of docs/V1-SECURITY-AND-LAUNCH-NOTES.md.
[2026-08-01] FINDING fix/app-login-gate · WARNING · src/lib/auth/gate.ts:26 · resolveOrigin trusted x-forwarded-host from anyone, putting an attacker-controlled host in a Location: header on the one route an anonymous attacker can always reach. FIXED — honoured only on exact match with NEXT_PUBLIC_SITE_HOST.
[2026-08-01] FINDING fix/app-login-gate · WARNING · src/lib/auth/gate.test.ts:63 · the test named "refuses anything that could leave the site" exercised none of the payload families that actually leave the site — manufactured confidence in the exact function that was broken. DEFECT CLASS: a test whose NAME asserts more than its BODY. FIXED — nine payload families, each asserted twice (equals fallback AND cannot escape the origin).
[2026-08-01] FINDING fix/app-login-gate · WARNING · src/middleware.ts:54 · matcher↔GATED_PREFIXES sync was enforced by three comments and zero tests; drift is a SILENT FULL BYPASS (requiresAuth says gated, middleware never runs). FIXED — deepEqual assertion importing the real config.
[2026-08-01] FINDING fix/app-login-gate · WARNING · docs/evidence/fix-app-login-gate/2026-08-01-login-gate-verification.md:28 · the verification table was collected against a DEV server, where the matcher compiles to ^/.*$ and middleware runs on everything — so it proved requiresAuth() and never exercised the real config.matcher, and the "/apple proven at runtime" claim was wrong because middleware ran on /apple too. DEFECT CLASS: verifying a production-only mechanism against a dev server. FIXED — re-verified against next start, compiled matcher quoted from the manifest.
[2026-08-01] FINDING fix/app-login-gate · NIT · src/lib/auth/gate.ts:45 · docstring promised "non-gated falls back to the app home" while the implementation had no gated check. FIXED (implementation now does what the doc said).
[2026-08-01] FINDING fix/app-login-gate · NIT · src/lib/auth/gate.test.ts:67 · assert on safeNextPath('app/home') could not distinguish "rejected → fallback" from "accepted and normalized" because input and fallback collided. FIXED — uses a non-home target and asserts the normalization explicitly.
[2026-08-01] FINDING fix/app-login-gate · NIT · src/components/auth/LoginForm.tsx:13 · useSearchParams() has no Suspense boundary; / builds only because the root layout's getLocale() reads cookies() and forces every route dynamic. Remove that cookie read and next build fails at "/". CARRIED — worth a boundary when the login page is redesigned.
[2026-08-01] FINDING fix/app-login-gate · NIT · docs/evidence/fix-app-login-gate/app-home-authed-passes-gate.jpg · screenshot has no address bar, so it evidences "the authenticated app rendered", not the URL. FIXED by caveating in the evidence and resting the URL claim on the fetch probe, which reports its own final URL.
[2026-08-01] VERDICT supervisor/fix/app-login-gate ROUND 2 — CHANGES (1 BLOCKER / 3 WARNING / 4 NIT against c1b4171). Reviewer confirmed the CODE fixes hold: 79-payload battery against safeNextPath, 0 escapes; finished-call 401 anonymously and with a junk cookie, both real call sites still work; every row of the production evidence table re-verified independently; no false claim left in the evidence file. The blocker was docs-only.
[2026-08-01] FINDING fix/app-login-gate · BLOCKER · ARCHITECTURE.md:93 · "Note: there is no src/middleware.ts" plus "a hard login gate for /app/* pages is a flagged pre-launch task" (repeated at :351) — the doc of record told the next agent that this branch's central security artifact does not exist. DEFECT CLASS: shipping a mechanism without updating the doc that denies it exists — third instance of doc-contradicts-code in two days. FIXED.
[2026-08-01] FINDING fix/app-login-gate · WARNING · src/lib/auth/gate.ts:41 · x-forwarded-proto was passed through unvalidated once the host matched: "javascript" yielded Location: javascript://atlas.example.com/… and a chained-proxy "https,http" made new URL() THROW inside middleware — a 500 on EVERY gated route, i.e. a denial of service on the whole app. DEFECT CLASS: validating one half of an attacker-controlled pair. FIXED — first hop taken, allowlisted to http/https, with a doesNotThrow assertion.
[2026-08-01] FINDING fix/app-login-gate · WARNING · src/middleware.ts:43 · NEXT_PUBLIC_SITE_HOST is a new PRODUCTION-REQUIRED variable in no env template or deploy note; unset behind a proxy the gate falls back to the server's bound origin and sends anonymous users to http://localhost:8080/?next=… — login unreachable in production. FIXED in docs (V1-SECURITY-AND-LAUNCH-NOTES item 1 + ARCHITECTURE); .env.example NOT updated — shell access to .env* is hook-blocked, so the founder must add the line by hand.
[2026-08-01] FINDING fix/app-login-gate · WARNING · ARCHITECTURE.md:239 · test count said 108 (now 125) and the explicit file list omitted auth/gate.test.ts. FIXED.
[2026-08-01] FINDING fix/app-login-gate · NIT · .claude/rules/app.md:31 · "12 of 24 call the helpers" became 13 of 24 in this same branch (finished-call). FIXED.
[2026-08-01] FINDING fix/app-login-gate · NIT · src/components/live/LiveSession.tsx:141 · the new 401 was swallowed (if (!r.ok) return), so an expired session left the "View organized" CTA silently dead — the repo's recurring "degradation must be VISIBLE" class, this time introduced BY a security fix. DEFECT CLASS: adding a failure mode without adding its surface. FIXED — 401 redirects to sign-in carrying ?next=.
[2026-08-01] FINDING fix/app-login-gate · NIT · src/lib/auth/gate.test.ts:44 · the drift test compares matcher STRINGS, not semantics, so it cannot catch a matcher whose compiled regex under-covers requiresAuth (e.g. /app//home; harmless only because Next 308-normalizes repeated slashes before middleware). CARRIED — documented limitation.
[2026-08-01] FINDING fix/app-login-gate · NIT · agent-memory/ready-queue.md · round-1's eleven findings were never appended to the append-only queue, so /fleet-lint could not see the class. DEFECT CLASS: the supervisor enforcing the findings-must-not-evaporate law on lanes but not on itself. FIXED — this block.
[2026-08-01] VERDICT supervisor/fix/app-login-gate ROUND 3 — CHANGES (1 BLOCKER / 3 WARNING / 5 NIT against 4b7d8ef). SECURITY SUBSTANCE CLOSED: the reviewer re-broke resolveOrigin itself with 765 host×proto combinations (javascript, https,http, HTTPS, empty, whitespace, tab/CR/LF/NUL, https;http, fullwidth ｈｔｔｐｓ, U+2028, CRLF-injection, absent header, 5000-char values) → 0 throws, 0 non-http schemes, 0 host escapes, 0 CRLF; safeNextPath round-trip verified end to end from a live-call URL incl. percent-encoded Hebrew; gate.ts confirmed to have ZERO imports so it is safe in a client bundle. Every remaining finding was documentation or arithmetic. ALL FIXED THIS ROUND except two carried by decision (noted per line).
[2026-08-01] FINDING fix/app-login-gate · BLOCKER · docs/product/2026-08-01-projects-workspace-agents-brief.md:167 · a tracked, same-dated, PRESENT-TENSE doc still said "/app/* pages still have no hard login gate (API routes are gated)" and that it "now blocks the backends" — repeating both claims this branch falsified, in the exact document the founder reads to sequence the next chapter. DEFECT CLASS: the doc sweep was declared done and wasn't, TWICE on the same branch (round 2 was ARCHITECTURE.md, round 3 was this) — a repo-wide grep for the falsified claim is now the only acceptable way to close a "docs updated" item. FIXED, and rewritten to name what actually still blocks the backends (getSession, not the page gate).
[2026-08-01] FINDING fix/app-login-gate · WARNING · ARCHITECTURE.md:245 · test count said 124 while two real npm test runs said 125 — AND ready-queue.md:215 stamped that very finding FIXED while itself citing 125. DEFECT CLASS: a FALSE "FIXED" MARKER — the ledger asserting a fix the file contradicts, which is worse than the original error because it stops anyone re-checking. FIXED (125, 108 + 17 in gate.test.ts).
[2026-08-01] FINDING fix/app-login-gate · WARNING · ARCHITECTURE.md:100 · "Needs NEXT_PUBLIC_SITE_HOST … (see docs/ENVIRONMENT.md)" was a DEAD CROSS-REFERENCE — ENVIRONMENT.md contains zero mentions of that variable or any env var, so the single pointer offered to a deployer led nowhere, in the one file that WAS writable when .env.example was not. DEFECT CLASS: closing a documentation finding with a pointer nobody followed. FIXED — points at V1-SECURITY-AND-LAUNCH-NOTES item 1 and states the failure mode inline.
[2026-08-01] FINDING fix/app-login-gate · WARNING · docs/evidence/fix-app-login-gate/2026-08-01-login-gate-verification.md:15 · "unit-tested (16 tests)" contradicted line 143 of the SAME file ("17 new") — an internally inconsistent evidence file, on the branch whose round-1 BLOCKER was a false evidence claim. FIXED.
[2026-08-01] FINDING fix/app-login-gate · NIT · .claude/rules/app.md:31 · "13 of 24 call the helpers" still wrong — verified by count: 14 of 24 (13 on main + finished-call added here), and the bullet's own partition only sums to 24 at 14. Third wrong count on this branch. FIXED.
[2026-08-01] FINDING fix/app-login-gate · NIT · src/middleware.ts:45 · new URL(target, origin) was uncaught, so an operator typo in NEXT_PUBLIC_SITE_HOST (bad port, stray space, unclosed bracket) reproduced the round-2 500-on-every-gated-route DoS — resolveOrigin's "always parseable" contract held for ATTACKER input but not for MISCONFIGURATION. DEFECT CLASS: hardening against malice while leaving the same crash reachable by mistake. FIXED — try/catch falls back to the request origin.
[2026-08-01] FINDING fix/app-login-gate · NIT · src/lib/auth/gate.test.ts:41 · the drift test's string-vs-semantics limitation lived only in the gitignored ready-queue, nowhere a future editor would see it. FIXED — the limitation is now a comment in the test itself, naming the /app//home case and why it is currently harmless.
[2026-08-01] FINDING fix/app-login-gate · NIT · agent-memory/BOARD.md:363 · the supervisor's own live board section still named "/app/* has no hard login gate" as the blocking prerequisite for the next chapter. FIXED — now states that the PAGE gate is done and that getSession() is what actually blocks the backends.
[2026-08-01] FINDING fix/app-login-gate · NIT · ARCHITECTURE.md:88 · the gateway route row still read "Login → /app/home" after LoginForm gained ?next= handling. FIXED.
[2026-08-01] NOTE supervisor — CARRIED, NOT FIXED, on fix/app-login-gate: (1) .env.example still lacks NEXT_PUBLIC_SITE_HOST — shell access to .env* is hook-blocked (secrets must not enter transcripts) and the reviewer independently confirmed the block and accepted "declare it beats faking it"; THE FOUNDER MUST ADD THE LINE BY HAND before any deploy or login is unreachable in production. (2) LoginForm's useSearchParams() has no Suspense boundary and builds only because the root layout's getLocale() reads cookies() and forces every route dynamic — remove that cookie read and "/" fails to build; worth a boundary when the login page is redesigned. (3) The background finished-call pre-load in LiveSession still fails silently BY DESIGN — reviewer-confirmed correct: it is a speculative prefetch with no pending user action, and the visible path fires the sign-in redirect the moment the user actually clicks.
[2026-08-01] VERDICT supervisor/fix/app-login-gate ROUND 4 — CHANGES (1 BLOCKER / 2 WARNING / 2 NIT against d9d8cfc). Reviewer re-verified all nine round-3 findings closed (test count 125 against a real run, dead cross-reference now resolvable, evidence count consistent at 17, 14-of-24 re-counted independently, try/catch fallback proven unable to throw and reachable ONLY by misconfiguration, drift limitation now in the test, 28 findings appended with the first 174 queue lines byte-identical to the 2026-07-23 archive snapshot = append-only respected). Security substance NOT re-litigated by instruction and remains closed. ALL ROUND-4 FINDINGS FIXED.
[2026-08-01] FINDING fix/app-login-gate · BLOCKER · docs/V1-SECURITY-AND-LAUNCH-NOTES.md:5-11 · "Current posture: intentionally OPEN for the demo" still declared the product "deliberately public … without an auth wall" and "/app/* routes are NOT in the src/middleware.ts matcher → reachable with no session" — categorically false since this branch, in the SAME FILE the branch edited six lines lower, and the file ARCHITECTURE.md now sends deployers to. THIRD failed doc sweep on one branch. FIXED — posture rewritten to "PAGES GATED, API AUTH STILL NOT TRUSTWORTHY" with the getSession caveat inline so the gate is not misread as launch-ready.
[2026-08-01] LESSON supervisor — DEFECT CLASS "DOCS UPDATED, DECLARED, NOT SWEPT" (3 occurrences on one branch: ARCHITECTURE round 2 → product brief round 3 → security notes round 4; plus 3 wrong hand-counts and 1 false FIXED marker). Editing the docs you REMEMBER is not a sweep. RULE ADOPTED: a "docs updated" item is closed only by grepping the FALSIFIED CLAIM (not the feature name) across every tracked doc and inspecting each hit; legitimate survivors are dated log entries and SHIPPED-stamped plans, which must NOT be rewritten because rewriting a dated record falsifies it. Counts stated in docs come from a command, never from memory. Candidate for graduation into the ship skill's merge-time doc-truth step.
[2026-08-01] FINDING fix/app-login-gate · WARNING · src/lib/auth/gate.test.ts:107 · a RAW NUL BYTE (0x00) was embedded in the source — the proto loop's last payload was a literal NUL rather than the escape '\x00' — so git classified the whole file as BINARY: the round-3 change to this SECURITY test rendered as "Bin 8054 -> 8522 bytes, 0 insertions, 0 deletions" and was unreviewable by diff, permanently, for every future edit. DEFECT CLASS: a control character in source silently removing a file from code review. FIXED — visible '\x00' escape plus a ' ' payload; NUL count verified 1 → 0; behaviour unchanged (non-allowlisted proto → https).
[2026-08-01] FINDING fix/app-login-gate · WARNING · agent-memory/BOARD.md:36 · MISSION decision 5 still read "THE LOGIN GATE COMES FIRST — /app/* pages still have no hard gate (APIs are gated)" — the most-read text in the fleet, repeating BOTH claims this branch falsified; only the supervisor's own section at :363 had been corrected. FIXED — now "AUTH COMES FIRST — half done", naming getSession as what actually blocks the backends.
[2026-08-01] FINDING fix/app-login-gate · NIT · docs/LAUNCH-KIT.md:75 · Lane F's scope lock listed "the /app/* login gate → supervisor" among backends "sequenced behind you", from which a session BORN on that file infers the gate does not exist. FIXED — reworded to "assume you ARE behind a login", keeping the still-true API-auth half of the assignment.
[2026-08-01] FINDING fix/app-login-gate · NIT · docs/evidence/fix-app-login-gate/2026-08-01-login-gate-verification.md:97 · evidence stopped at round 2 ("Both rounds' findings, 19 in total") while the branch had had four rounds and 33 findings — accurate as written, incomplete as ship evidence. FIXED — rounds 3+4 section added, naming the recurring defect class rather than quietly correcting it.
[2026-08-01] VERDICT supervisor/fix/app-login-gate ROUND 5 — CHANGES (1 BLOCKER / 2 WARNING / 2 NIT against d2afff5). Reviewer confirmed ALL round-4 findings FIXED, including proving the NUL fix mechanically (committed blob at d2afff5 = 0 NUL bytes vs 1 at d9d8cfc; diffed the blob against a modified copy and got a normal textual unified diff, so future diffs of the security test ARE reviewable). Its own independent sweep confirmed every legitimate survivor. Reviewer's summary: "The code is done and I would approve it today" — everything remaining was prose. ALL FIXED.
[2026-08-01] FINDING fix/app-login-gate · BLOCKER · agent-memory/BOARD.md:338 · the supervisor's CURRENT status block still read "MY OWN QUEUE, both now on the critical path and neither started: (1) the /app/* login gate — offered to the founder, not yet accepted", contradicting its own older prior: block 27 lines below which already said the gate was built — the correction had landed in the ARCHIVED entry and not the live one, in a file edited at 04:30 DURING the round-4 fix pass itself. FIXED.
[2026-08-01] FINDING fix/app-login-gate · WARNING · agent-memory/BOARD.md:60 · the MISSION lane-lines still assigned "Supervisor → the /app/* login gate + the deploy/CI question" as pending, 24 lines below the decision-5 line the same fix pass HAD corrected to "half done". DEFECT CLASS: correcting the occurrence you were shown instead of every occurrence in the file you already had open. FIXED.
[2026-08-01] FINDING fix/app-login-gate · WARNING · agent-memory/state-frontend.md:63 · Lane F's Lessons still teach "/app/* pages render WITHOUT auth … all captured fine unauthenticated. Only the real PDF needs the session" — a SCREENSHOT RECIPE this branch invalidated, held by the lane that is importing three new pages TODAY. An unauthenticated capture now silently yields a screenshot OF THE LOGIN PAGE, which would pass review as evidence because it IS a real screenshot of a real page. DEFECT CLASS: a security change invalidating another lane's verification method, where the failure mode produces plausible-looking false evidence rather than an error. FIXED as far as the law allows — parallel-work bars rewriting another lane's state file, so a dated ⚠️ [supervisor note 2026-08-01] was appended to Lane F's BOARD section telling it to fold the correction in itself, use the authed Chrome profile, and assert the final URL rather than just the pixels.
[2026-08-01] FINDING fix/app-login-gate · NIT · docs/evidence/fix-app-login-gate/2026-08-01-login-gate-verification.md:106 · the adopted sweep rule said "across every TRACKED doc", which is structurally blind to agent-memory/ (git-ignored, .gitignore:40) — precisely where the BIRTH DOCUMENTS live (BOARD.md + lane state files). FIXED — rule is now "every tracked doc AND agent-memory/", and that wording is what should graduate into the ship skill.
[2026-08-01] FINDING fix/app-login-gate · NIT · docs/V1-SECURITY-AND-LAUNCH-NOTES.md:15 · "every other auth check in the app uses getSession()" was overbroad — the Authorization: Bearer branch (src/lib/auth.ts:14) uses supabaseAdmin.auth.getUser(token), which does verify. Error was in the SAFE direction (overstated the risk). FIXED — now scoped to cookie-based checks, i.e. every browser request.
[2026-08-01] LESSON supervisor — THE BIRTH-DOCUMENT BLIND SPOT. Five review rounds on one branch produced ZERO surviving code defects and FOUR consecutive failed doc sweeps, and the last one was the sharpest: the files a NEW SESSION IS BORN FROM (agent-memory/BOARD.md, agent-memory/state-<lane>.md, docs/LAUNCH-KIT.md) are the ones a git-based sweep cannot see, are the most-read text in the fleet, and are where a stale claim does the most damage — a lane born on a false premise produces confident wrong work rather than an error. RULE: any change that invalidates how another lane VERIFIES (not just what it builds) must be pushed to that lane by a dated supervisor note the same session, because the lane cannot know its recipe expired. Candidate for graduation into the ship skill's merge-time doc-truth step alongside the sweep rule.

[2026-08-01 late] READY Lane F — feat/surfaces-import @ c7608de PUSHED. 10 commits over origin/main, range 7cad8b8..c7608de, 64 files changed (+5420/-239). THE THREE-SURFACES IMPORT: Projects, Workspace and Agents imported at FULL fidelity per the founder's call (he overruled a breadth-first proposal — the sub-states are where the data model lives, so skipping them would have left the backend chapters designing blind).
  WHAT IT DOES — Projects (design 1099-1258): list, a project with Instructions/Memory/Context + capacity meter, new-project; the Projects nav button in the chat panel had been a dead affordance since design round 2 and now has a destination. Workspace (design 1263-2084): picker with working sort + both empty states, the three-stage intake, the control shell (floating panel, four detail bodies, collapsed rail, tab bar), a GENUINELY EDITABLE working document, legal due-diligence with six severity-tagged findings, and split docs with drag gutters. Agents (design 2085-2365): command deck, grid with per-card menu, finished tasks, scheduled, create-agent, and the dock (profile + chat).
  SCOPE LOCK HONOURED: no tables, no migrations, no API routes, no persistence. Everything created or edited lives in one client provider mounted in the /app shell and RESETS ON RELOAD (founder decision; localStorage deliberately not used because imitating persistence is the repo's filed fake-data defect class).
  DEMO MARKING: every stub-fed surface carries a page banner in BOTH locales, and citation blocks + agent findings + legal findings carry inline markers. The sharpest case is the working document's quote block — a fabricated Hebrew quote attributed to a NAMED executive of a real TASE issuer with a filing-shaped citation; it renders with the attribution ending "— DEMO, invented quote".
  VERIFIED: battery 149/149 (108 before this chapter -> 132 with this branch's 24 new -> 149 after merging main's gate) - tsc - build green. 22 Playwright screenshots (11 surfaces x EN/HE) + a parity probe JSON, all committed under docs/evidence/feat-surfaces-import/. ZERO console errors across all 11 surfaces in both locales. Parity measured against the RENDERED design on :4321, never bundle CSS.
  MAIN MOVED UNDER THIS BRANCH: the /app/* login gate (f05b659) landed mid-chapter and is merged in at 733b4ac (only conflict was package.json's test list, resolved as a union). All four new routes verified gated: 307 to login with the deep link preserved in `next`, including the dynamic workspace id. The authed path was re-verified AFTER the merge and captured durably.
  EVIDENCE HONESTY NOTE FOR THE REVIEWER: the 22 PNGs were captured BEFORE the gate merge from an unauthenticated browser, so they cannot be reproduced as captured. The evidence file says so at the top of the screenshot section and names authed-workspace-shell-post-gate.jpg as the only artifact proving the post-gate authed path. Flagged by the lane rather than left for the reviewer to find.
  SHARED-SURFACE CHANGES: (1) tokens.harvey.inkGhost #9C9C9C ADDED (text-ink-ghost) plus shadow tokens menu/modal/hairlift — the design's warm->Harvey table leaves five hexes the new regions use UNSET, so porting them verbatim would have put beige onto Harvey cards; mapping rule filed in cross-cutting. (2) ChatView gained ONE optional prop (mainView) and the Projects button a destination; panel, conversation state and Lane M's tests untouched. (3) A new .atlas-doc CSS cluster in globals.css.
  FOUNDER CALL FOR THE REVIEWER, DO NOT SILENTLY RESOLVE: the Workspaces picker H1 moves from Newsreader back to the sans stack at weight 600. The rendered design HARDCODES that for this one headline (line 1269) while Projects/Home resolve --head-font to Newsreader — probed, not assumed. This reverses a design-round-2 consistency fix, so it is flagged. railText #85817A was NOT touched.
  KNOWN GAPS CARRIED: the project composer, agent chat input and workspace side-chat are inert (no chat backend this chapter) and render disabled with a stated reason; Export-as-Word renders disabled with "Not in this build"; the __chat tab renders the tab shell only — wiring it to the existing Ask Atlas panel is the one piece of design 2039 not finished.
  Evidence: docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md + probe/surfaces-parity.json. Spec: docs/superpowers/specs/2026-08-01-three-surfaces-import-design.md. Plan: docs/superpowers/plans/2026-08-01-three-surfaces-import.md.

[2026-08-01 16:05] READY frontend (Lane F) · feat/surfaces-import · founder round 2 on the same
branch — 3 more commits 634fe0a..597e4c2 (range: git log --oneline 597e4c2 -3), pushed.
WHAT: the founder walked the three surfaces this afternoon, then re-cut the design (remote
Atlas MVP.dc.html edited 11:18Z, version 1785587677358929). Shipped against it:
  1. Workspaces picker H1 back to SERIF — this CLOSES the founder call filed at 2026-08-01
     in this queue (see the entry ending "...railText #85817A was NOT touched"). The founder
     resolved it by rebuilding that headline in the design as serif, so parity and app-wide
     consistency now agree. DECISION line filed in cross-cutting.
  2. A new workspace no longer renders TWO composers. The bottom bar is gated to the clarify
     stage; the intro shows only the centred composer, as the design does.
  3. Agent chat panel rebuilt to the new aesthetic: segmented tabs with the active half solid
     ink, sparkle header, snip/tools/mic composer row + helper line, live suggestion chips,
     a new "Recent agent chats" list, and Widen taking the WHOLE main area (deck and grid
     step aside) centred in the app's 720px column.
  4. AGENT_SCOPE_KINDS: 'Company' -> 'Sector', order Call/Workspace/Sector/Report. Sector
     targets derive from workspaces already on screen, not a new hardcoded taxonomy.
  5. Shared ds/PillComposer + an additive `variant` prop on Lane M's ChatComposer: a chat
     opens on the tall composer and becomes a pill after the first message, in the chat
     thread and the workspace intake. Every existing caller renders unchanged.
HOW VERIFIED: battery 152/152 (149 + 3 new agent-seed tests) · tsc · build green. Build first
hit MODULE_NOT_FOUND on _document — the documented "dev server owns .next" trap, not a broken
branch; killed dev, removed .next, rebuilt green, restarted dev on :3001. Walked with my own
eyes in BOTH locales: agents page + Recent chats, docked panel, widened panel, workspace picker
headline, intake intro (one composer), intake clarify (pill), chat empty (tall), chat after
send (pill). Hebrew RTL mirrors correctly in the new pill and the panel docks left with Hebrew
tabs and הדגמה markers intact.
EVIDENCE: docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md §4b —
including the verification LIMIT this round: the 419KB design source could not be re-fetched to
disk (DesignSync 256KiB cap · Chrome Local Network Access blocks localhost POST from HTTPS ·
claude.ai origin content is filtered on return), so parity was established against the RENDERED
design driven live in present mode, which is what rules/app.md mandates. Cost: the design is in
a cross-origin iframe, so no computed-style probes — geometry measured app-side and reconciled
against the design's layout behaviour. Deltas left standing are listed in §4b.
MIGRATIONS: none. SHARED SURFACES: chat/ChatComposer.tsx + ChatView.tsx (Lane M) — additive
variant only; ds/PillComposer.tsx is new; lib/agents/data.ts scope rename. All filed in
cross-cutting BEFORE the edits.

[2026-08-01 16:50] READY frontend (Lane F) · feat/surfaces-import · founder correction round,
commit abb1556, pushed. Founder compared the built panel against his own reference screenshot
and caught three things:
  1. The agent panel opened COLD was rendering findings straight away. The design shows a
     centred hero instead — serif "Ask anything of" over the agent name in mono, the agent's
     description, and the three suggestions as PLAIN STACKED TEXT, not pills. Findings arrive
     with the first exchange, which is what "Show me what you found" asks for; asking a
     suggestion moves the panel into the conversation view. Lesson: a panel can have an empty
     state that is a different LAYOUT, not just the same layout with less in it — I built the
     populated state from a recent-chat capture and never saw the cold one.
  2. Company is a scope again ALONGSIDE Sector (founder call): pointing an agent at one issuer
     and at a whole sector are different jobs. AGENT_SCOPE_KINDS is now
     Call/Workspace/Company/Sector/Report. Five kinds, so the panel lays them out 3-up; the
     create modal still fits one row — measured in BOTH locales, nothing clipped or wrapped
     (dock 110px each, modal 88px each, Hebrew uniform 31px height).
  3. Widen/narrow now use the design's diagonal double-arrows (new ExpandDiagonalIcon /
     CollapseDiagonalIcon). The old corner-bracket ExpandIcon stays where it is used elsewhere.
HOW VERIFIED: battery 152/152 · tsc · build green (dev killed + .next removed for the build,
then restarted on :3001). Walked in both locales via DOM-driven clicks — coordinate clicking was
unreliable because the browser window kept changing size mid-session. Confirmed: cold hero,
hero -> conversation transition on a suggestion, widen to full width and back, the 3-up scope
grid, and the create modal's one-row scope strip.
NOTE FOR THE REVIEWER: the scope test I added last round FAILED on the new list rather than
passing silently — that is the test doing its job, and it was updated deliberately, not to make
red go green.

[2026-08-01 17:30] HANDOFF frontend (Lane F) · feat/surfaces-import · FOUNDER-APPROVED, READY FOR
THE REVIEWER GATE + MERGE. Founder's words after walking it: "okay things look great".

BRANCH STATE (all counts pasted from git, not typed):
  git rev-parse --abbrev-ref HEAD        -> feat/surfaces-import
  git status -sb                         -> ## feat/surfaces-import...origin/feat/surfaces-import
                                            (in sync, nothing unpushed, tree clean)
  git rev-list --count origin/main..HEAD -> 17
  range                                  -> f7b3f23..2cb845f
  git diff --shortstat origin/main...HEAD-> 67 files changed, 5990 insertions(+), 244 deletions(-)
  git log --oneline HEAD..origin/main    -> EMPTY (origin/main 7cad8b8 is fully contained;
                                            f05b659 login gate confirmed an ancestor of HEAD)

BATTERY ON THE FINAL COMMIT: npm test -> 152/152 pass, 0 fail · npx tsc --noEmit -> clean ·
npm run build -> green. Build note for whoever re-runs it: a running dev server owns .next and
the build dies with MODULE_NOT_FOUND on _document. That is the documented stale-artifact trap,
NOT a broken branch — kill dev, rm -rf .next, rebuild. I own :3001; it is running again now, so
build in your own checkout rather than in this worktree (ship skill step 1).

WHAT THIS BRANCH IS: the three designed surfaces (Projects in the chat panel · Workspace ·
Agents) imported at full fidelity, UI ONLY. Scope lock held — no tables, no migrations, no API
routes, no persistence. Every stub-fed screen carries a visible demo marker in BOTH locales.
Then two founder rounds on top of it the same day (commits 634fe0a..2cb845f): serif Workspaces
headline · one composer per intake stage · the agent panel rebuilt to the founder's new
aesthetic incl. its cold hero state · Company restored alongside Sector · diagonal widen/narrow
icons · the panel running full height with the command deck stopping at its edge · the deck
following page direction so Hebrew prompts sit top-right · and a shared pill composer that
replaces the tall one once a conversation has started (chat + workspace intake).

EVIDENCE: docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md
(committed, in this checkout). Read §4b before reviewing — it states the ONE verification limit
honestly: the 419KB design source could not be re-fetched to disk this round (DesignSync 256KiB
cap · Chrome Local Network Access blocks a localhost POST from an HTTPS page · claude.ai origin
content is filtered on return), so parity was established against the RENDERED design driven
live in present mode, which is what rules/app.md mandates anyway. Cost: the design sits in a
cross-origin iframe, so no computed-style probes — geometry was measured app-side and reconciled
against the design's own layout behaviour. §2 also flags that the 22 PNGs predate the login gate
and cannot be reproduced unauthenticated; one post-gate authed capture is named as the artifact
that proves that path.

SHARED SURFACES TOUCHED (all filed in cross-cutting BEFORE the edits):
  - src/components/chat/ChatComposer.tsx + ChatView.tsx (Lane M) — ADDITIVE: a `variant` prop
    defaulting to the existing look. Every other caller renders unchanged.
  - src/components/ds/PillComposer.tsx (new) + two new icons in ds/icons.tsx.
  - src/lib/agents/data.ts — AGENT_SCOPE_KINDS now Call/Workspace/Company/Sector/Report.
MIGRATIONS: none.

KNOWN GAPS CARRIED (deliberate, listed in the evidence, do not treat as defects):
  - The project composer, agent chat input and workspace side-chat are INERT — no chat backend
    this chapter. They render disabled with a stated reason rather than accepting input that
    goes nowhere. The agent panel's send button is drawn solid per the design; the panel banner,
    the inline markers and the helper line are what keep that honest.
  - Export as Word renders disabled ("Not in this build"); Export as PDF uses window.print().
  - The `__chat` tab renders the tab shell only — wiring it to the existing Ask Atlas panel is
    the one piece of design 2039 not finished.
  - Smaller parity deltas (chat pill width 672 vs ~727, workspace clarify chip copy) in §4b.

REVIEWER: nothing is being hidden behind "founder approved". The founder approved how it LOOKS;
correctness, the iron rules, scope and secrets are still yours to gate.

[2026-08-01 17:45] AMEND frontend (Lane F) — the HANDOFF entry above is superseded by ONE more
commit. Founder caught a last one while I was filing the handoff: the agent panel had the two
Harvey surface tokens the wrong way round — the aside was bg-paper (#F7F7F7) carrying white
boxes, where the design is a WHITE panel carrying gray boxes. Fixed in bf9693a; probed, not
eyeballed: panel rgb(255,255,255), composer + finding cards rgb(247,247,247), chips
rgb(255,255,255).

CORRECTED HANDOFF NUMBERS (pasted from git):
  git rev-list --count origin/main..HEAD  -> 18
  range                                   -> f7b3f23..bf9693a
  git diff --shortstat origin/main...HEAD -> 67 files changed, 5990 insertions(+), 244 deletions(-)
  git status --short                      -> empty (tree clean)
  git status -sb                          -> in sync with origin/feat/surfaces-import
  BATTERY on bf9693a: npm test 152/152 pass 0 fail · npx tsc --noEmit clean · npm run build green.

Everything else in the HANDOFF entry stands unchanged.

[2026-08-01 17:23] VERDICT frontend/feat/surfaces-import — CHANGES (reviewed at bf9693a). atlas-reviewer
(cold context) + supervisor pass. 1 BLOCKER · 6 WARNING · 15 NIT from the reviewer, plus 2 supervisor
findings below. NOT MERGED. Founder standing decision 2026-07-31 applies: the lane that built it fixes it,
re-verifies eyes-on, ships back through a fresh reviewer — the supervisor does NOT fix-and-self-review.
WHAT PASSED, so the lane does not re-litigate it: scope lock is REAL (no migrations, no SQL, no API routes,
no middleware.ts/gate.ts touch, GATED_PREFIXES + config.matcher untouched, all three new routes fall under
/app/*, no legacy imports, no secrets); package.json adds NO dependency (two test files appended to the test
list, nothing else); zero localStorage/sessionStorage/cookie/fetch anywhere in src/lib/demo, src/lib/projects
or the three new component roots; dictionaries and tokens purely additive and correctly wired; no dead
bg-call-*/text-call-* utilities and no arbitrary-value shadow classes survived; demo banners present on all
seven stub-fed screens in BOTH locales with inline markers on legal findings, agent findings, file previews
and the intake build stage. SUPERVISOR BATTERY on the merge result (main + bf9693a, run in the supervisor
checkout, not the lane worktree): npm test 152/152 pass 0 fail · npx tsc --noEmit clean · npm run build green
with all three new routes compiled and Middleware 81.8 kB intact. Dictionary key parity checked mechanically:
en 420 keys / he 420 keys, zero drift, and he.ts is typed as Dictionary so tsc enforces it.

[2026-08-01 17:23] FINDING feat/surfaces-import · BLOCKER · src/components/workspace/WorkingDocument.tsx:143 —
The working document renders "✓ Saved just now" / "✓ נשמר עכשיו" (dict.workspace.docSaved, en.ts:125 / he.ts:122)
after every edit-and-blur while NOTHING is saved anywhere. Repro: /app/workspace/ws-tigbur-privatization → __doc,
type, click away, see the save confirmation, reload, all work is gone. The demo banner disclaims the CONTENT
("the figures, quotes and findings are invented") and says nothing about persistence, so it does not cover this.
This is precisely the "imitating persistence" defect the founder's 2026-08-01 decision (3) forbade when it ruled
out localStorage, and which this branch's own reducer.ts:8 names in a comment. WorkspaceShell.tsx:190 makes the
same claim statically as "Draft · saved just now". Found independently by both gates.

[2026-08-01 17:23] FINDING feat/surfaces-import · WARNING · src/components/workspace/WorkingDocument.tsx:26 —
The most dangerous element on the branch is marked in the WRONG LANGUAGE and in a user-deletable place. A
fabricated Hebrew quote attributed to a NAMED executive of a real TASE issuer ("מוטי בן־ארי · CEO") with a
filing-shaped citation ("Q2 2026 call · Q2 2026 deck.pdf") carries its only marker as a hardcoded ENGLISH suffix
"— DEMO, invented quote" inside SEED_HTML. A Hebrew reader therefore sees no הדגמה marker on the single element
most dressed as sourced fact, while every other inline marker localizes via DemoInline. Worse, the marker lives
INSIDE the contentEditable body: the user can delete it, and it travels out of the app through Export as PDF.
The founder's condition specified inline [DEMO] markers on the citation block in BOTH locales. NOTE: the
supervisor looked straight at this in workspace-document-he.png and certified the marker as adequate without
noticing it was un-localized — the reviewer caught it. Screenshot-reading is not marker-verification.

[2026-08-01 17:23] FINDING feat/surfaces-import · WARNING · src/components/workspace/WorkspaceShell.tsx:159 —
Clicking the workspace panel's primary solid-ink CTA "New workspace chat" opens a tab labelled "Workspace chat"
whose body is null (renderSpecial at WorkspaceShell.tsx:266-271 returns null for __chat; WorkspaceDocs.tsx:152
renders it blank). The user gets an empty white pane: no message, no disabled composer, no reason. That is
silent inertness, not the "visibly disabled with a stated reason" the branch's own declared gap promises — and
it is the surface's most prominent button.

[2026-08-01 17:23] FINDING feat/surfaces-import · WARNING ·
docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md:223 — EVIDENCE ASSERTS BEHAVIOUR
THAT DOES NOT EXIST. §8 states "the project composer, the agent chat input and the workspace side-chat … render
disabled with a stated reason" and that "the workspace side-chat reuses the existing Ask Atlas component" (the
cross-cutting heads-up to Lane M claims the Pinge highlight-to-ask reuse too). Neither exists: no side-chat and
no selection/quote component is imported anywhere under src/components/workspace (verified by grepping imports
and getSelection()). The same §8 contradicts itself four bullets later with "the __chat tab currently renders
the tab shell only". Same defect class as the login-gate branch's false certification (2026-08-01): a claim
about a file, written from memory rather than read off the file.

[2026-08-01 17:23] FINDING feat/surfaces-import · WARNING · src/components/agents/AgentDock.tsx:219 — The agent
profile tab's primary "Save changes" button and the "Delete agent" button have NO onClick at all, and the name
input (:165) and task textarea (:174) are uncontrolled defaultValue fields that are never read. Rename an agent,
click "Save changes" → nothing happens, no feedback; switch to Findings and back and the edit has silently
vanished. The founder's decision (3) promised agent/project editing "really works in React state" and resets
only on reload; this resets on a tab switch, which reads as data loss.

[2026-08-01 17:23] FINDING feat/surfaces-import · WARNING · src/app/app/agents/page.tsx:37 — The Report
assignment targets flat-map every workspace's PDFs, so "2024 annual.pdf" and "2025 annual.pdf" each appear TWICE
(ws-tigbur a24/a25 and ws-qualitau q24/q25). CreateAgent.tsx:152 keys those rows on t.label and :149 marks
selection by label equality, so the Report list shows duplicate rows, clicking one fills BOTH radio dots, and
React logs a duplicate-key console error — on a surface the evidence's "0 console errors across 11 surfaces"
sweep never opened.

[2026-08-01 17:23] FINDING feat/surfaces-import · WARNING · src/components/workspace/WorkspaceIntake.tsx:185 —
RTL (iron rule 5): dir="ltr" plus font-mono-num is forced onto a localized HEBREW SENTENCE, dict.workspace
.buildingSteps ('אוסף קבצים · מאנדקס financials.xlsx · מפעיל סוכנים'), so in the Hebrew locale the bidi
algorithm places the last step at the right edge and the reader meets the three build steps in REVERSE ORDER.
Iron rule 5 scopes dir="ltr" + font-mono-num to numerals and tickers, never to Hebrew-bearing prose.

[2026-08-01 17:23] FINDING feat/surfaces-import · WARNING · src/components/workspace/WorkingDocument.tsx:160 —
"Export as PDF" calls window.print() on a page whose entire layout is h-screen + overflow-hidden
(MacWindowFrame.tsx:7, AppPage.tsx <main>) with the document inside an overflow-auto pane, and no @media print
rules cover it (globals.css:488-545 only styles the legacy transcript print path). Exporting a document longer
than the pane produces ONE CLIPPED PAGE containing the nav rail, the workspace panel and the visible slice of
the text. This is exactly why /print/[id] exists as a dedicated route (rules/app.md, Hebrew PDF entry).

[2026-08-01 17:23] FINDING feat/surfaces-import · WARNING(supervisor) · src/components/chat/ChatComposer.tsx:156
— THE PILL'S SEND BUTTON CANNOT SEND. onClick={onSend} hands React's SyntheticMouseEvent to ChatView's
send(explicit?: string), whose first line is (explicit ?? input).trim() — the event is not nullish, so .trim()
throws TypeError inside an async function and the rejection is swallowed. Clicking the arrow does nothing,
forever; only Enter sends. NOT A REGRESSION: main's tall composer has identical wiring (ChatComposer.tsx:106,
ChatView.tsx onSend={send}), so mouse-send is ALREADY broken in Ask Atlas on main today — this branch carries
the defect into new code where the button is additionally never disabled, so it also fires on an empty input.
Verified by simulating the exact call semantics in node, not by reasoning alone. The root cause deserves its own
small fix on main; the pill instance belongs to this branch.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/components/projects/ProjectView.tsx:186 (and
AgentDock.tsx:337) — The "stated reason" for the inert project composer and agent chat input is delivered ONLY
via title= on a DISABLED form control, and Chrome does not dispatch hover events to disabled form controls, so
the tooltip never renders and the reason is invisible. PillComposer.tsx:46 does it correctly by putting the
title on the wrapper div. Note this NIT is what makes three of the branch's declared gaps ("renders disabled
with a stated reason") only half-true in practice.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/components/workspace/WorkingDocument.tsx:43 —
docHtml[workspaceId] ?? SEED_HTML seeds EVERY workspace's document with the same Tigbur text, so opening
"Qualitau — Q2 deep dive" shows a document titled "Qualitau — what we know" whose body discusses Tigbur's
privatization, ₪1.21B→₪1.56B and quotes a Tigbur CEO. Fabricated content attached to the WRONG real issuer.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/app/app/agents/page.tsx:26 — Derived assignment
targets include non-entities: the Sector list contains the literal "Sector" (from ws-shipping-scan's sub) and
the Company list contains "3 companies" (from that workspace's company field), so Create-agent offers
"3 companies · TASE" as if it were an issuer.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/components/workspace/WorkspaceShell.tsx:52 —
closeTab calls setActiveTab from inside the setOpenTabs updater. React state updaters must be pure and React 18
StrictMode invokes them twice in dev; latent double-dispatch waiting for a non-idempotent successor edit.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/lib/demo/DemoStateProvider.tsx:38 —
addProject/addAgent/addWorkspace compute the new id from the CLOSURE's state before dispatching, so two clicks
of "New project" inside one React batch both return the same id while the reducer assigns two distinct ones:
two projects are created, the router navigates to the first, and the second is reachable only from the list.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/app/globals.css:836 — .atlas-doc blockquote mixes a
logical border-inline-start: 2px solid with a PHYSICAL border-radius: 0 6px 6px 0, so under Hebrew the accent
bar lands on the rounded edge and the square corners face the wrong side. Same class at WorkspaceIntake.tsx:124,
where rounded-[14px_14px_4px_14px] on a self-end chat bubble does not mirror in RTL.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/components/workspace/WorkspacePicker.tsx:158 —
<bdi dir="ltr">{fileCount} {word}</bdi> and WorkingDocument.tsx:182 <span dir="ltr">{docCitations}</span> force
LTR onto a number+Hebrew-word phrase ("6 קבצים", "3 ציטוטים"), putting the digit on the wrong side for a Hebrew
reader. ProjectsList.tsx:50-57 shows the correct pattern: dir="ltr" on the NUMERAL only, the word outside.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/components/workspace/WorkspaceDetailColumn.tsx:176 —
The Chats detail column renders the raw WS_THREAD_GROUPS keys "Today"/"Yesterday"/"Earlier" untranslated in the
Hebrew locale, even though dict.common.today and dict.common.yesterday already exist.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/components/workspace/WorkspaceDocs.tsx:223 — The
Hebrew file preview instructs "סמנו טקסט כדי לצטט, לשתף, או לשאול את אטלס" (select text to quote, share or ask
Atlas) but no selection handler or highlight-to-ask is wired into the workspace preview — selecting text does
nothing. UI that teaches a capability the build does not have.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/components/chat/ChatComposer.tsx:147 — The new pill
composer adds a mic button with no onClick, no disabled and no title: a fully dead control with no affordance of
unavailability, unlike the founder-sanctioned "Voice ask — coming soon" placeholder pattern it mirrors.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/lib/agents/data.test.ts:41 — Two tests assert the
same invariant ("finished tasks point at the agent whose dock they open" :41 and "a finished task also resolves
to a real agent" :62). One is dead weight.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/lib/projects/data.test.ts:5 — The first two tests
restate the stub literals (3 projects, exact names, capacity 14, context 3, chats 4) rather than asserting
behaviour, so they go red on any legitimate content edit while catching no real defect. Only emptyProject (:44)
and the capacity-range test assert an invariant.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT · src/lib/legacyBoundary.test.ts:8 — ATLAS_ROOTS was not
extended to the two new component roots (src/components/projects, src/components/agents), so ~1.4k lines of new
app code sit OUTSIDE the Wave-2 legacy-import guard. Imports are clean today, but a future @/components/auth/…
import from those folders would pass silently.

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT ·
docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md:15 — The Battery table at the TOP
of the evidence still reads 149/149 while §4b and the handoff report 152/152 on the shipped commit. The first
number a reader sees is stale. (Supervisor confirms 152/152 is the true count on the merge result.)

[2026-08-01 17:23] FINDING feat/surfaces-import · NIT ·
docs/evidence/feat-surfaces-import/probe/surfaces-parity.json:36 — The committed probe records the app's
Workspaces H1 as "font-sans @ 34px / 600", but the shipped code is font-display … font-medium (Newsreader, 500)
after the founder's serif call. Only the word "Original" in §5 signals that the artifact no longer describes the
branch — a probe that disagrees with the code is worse than no probe.

[2026-08-01 17:23] NOTE supervisor — EVIDENCE SPOT-CHECKS THAT PASSED (claims verified against the real files,
not accepted on their word, by one or both gates): the login-gate integration (middleware.ts and gate.ts are
byte-identical to main; matcher ['/app/:path*','/print/:path*'] covers all three new routes); the
shadow-tokenization claim (shadow.menu/modal/hairlift really exist in tokens.ts AND tailwind.config.ts, and no
arbitrary multi-layer shadow class survived); demo banners in both locales on all seven page-level surfaces plus
the wide agent panel; "no persistence" (zero storage/cookie/network calls in the new modules); the inkGhost
token and its cross-cutting rationale; the bidi fixes landing as <bdi dir="ltr"> in ProjectView.tsx:368; the
agent-scope test genuinely asserting the five-kind list; and one post-gate AUTHENTICATED capture
(authed-workspace-shell-post-gate.jpg) confirmed by the supervisor to show the real workspace shell, not a login
page — the failure mode that opened today.

[2026-08-01 18:40] HANDOFF frontend (Lane F) · feat/surfaces-import @ 4e9908b · THE FIVE FIXES
ARE IN. Supersedes the [17:30] HANDOFF and its [17:45] AMEND. A fresh atlas-reviewer should run
on THIS tip.

NUMBERS (pasted from git):
  git status -sb                          -> ## feat/surfaces-import...origin/feat/surfaces-import
  git rev-list --count origin/main..HEAD  -> 23
  range                                   -> f7b3f23..4e9908b
  git diff --shortstat origin/main...HEAD -> 67 files changed, 6094 insertions(+), 244 deletions(-)
  git log --oneline HEAD..origin/main     -> 0 commits (main fully contained)
  git status --short                      -> 0 lines (tree clean)
  BATTERY on the merge result: npm test 152/152 pass 0 fail · npx tsc --noEmit clean ·
  npm run build green.

MAIN MOVED DURING THE FIX ROUND and is merged in at 4e9908b: 49edc74 (db ownership law) +
3eeda49 (docs/DATA-MODEL.md). Docs-only, no conflicts. I read DATA-MODEL.md against this branch:
it puts projects / workspaces / agents in the PERSONAL layer, which this branch does not
contradict — it creates no tables at all.

THE FIVE, each verified by DOING it in the running app with the final URL asserted (the old
unauthenticated screenshot recipe expired with the login gate; every check below ran on a real
authenticated session and confirmed location.pathname was NOT '/'):
  1. "✓ Saved just now" + "Draft · saved just now" DELETED (1226933). Nothing saves. The dead
     'saved' state and its onInput reset went too; the row now reads "Draft". 'savedJustNow'
     removed from both dictionaries. Verified: no "Saved just now" anywhere on the surface.
  2. The invented quote from a NAMED real TASE executive (1226933). Its English-only marker was
     hardcoded in SEED_HTML *inside* contentEditable — a Hebrew reader saw no marker at all, and
     the user could delete it and export the quote unmarked. Now a localized DemoInline notice
     rendered OUTSIDE the editable body. Verified: cite line no longer contains the marker,
     notice present, closest('[contenteditable]') === null. It also PRINTS — the print stylesheet
     only hides .no-print, which this does not carry.
  3. Duplicate Report targets + label-keyed radios (04a4ccb). New AgentTarget type with a stable
     id; reports deduped by name; the picker keys and selects on id, label looked up at submit.
     Verified: 4 distinct rows, one click selects exactly ONE, zero React key errors on the
     console, and a created agent still stores "2025 annual.pdf".
  4. buildingSteps forced dir="ltr" + font-mono-num onto a Hebrew SENTENCE (1c74c5c). Now
     dir="auto", mono dropped. Verified in Hebrew: computed direction rtl, reads correctly, with
     financials.xlsx upright in place as a strong-LTR run.
  5. onClick={onSend} fed React's MouseEvent into send(explicit?: string) (1c74c5c). Fixed at
     both ChatComposer sites. **THIS WAS LIVE ON MAIN** — mouse-send was dead for real users in
     Ask Atlas and on the chat page; keyboard Enter takes another path, which is why it went
     unnoticed. Two further sites of the same shape (PillComposer, WorkspaceIntake) were LATENT
     not broken — their callers take no argument — and were hardened in the same commit.
     Verified by clicking: message renders, composer clears, zero window errors, in BOTH the
     tall and pill variants.

EVIDENCE CORRECTED (a5f2496) — the reviewer was right and I am not softening it: §8 asserted a
workspace side-chat reusing the Ask Atlas component and a Pinge highlight-to-ask reuse. NEITHER
IS IN THE BRANCH; nothing under src/components/workspace/ imports TranscriptChatPanel, the Ask
Atlas panel or the snip bridge. Those lines were written from intent, not from the code — the
same written-from-memory defect that cost the login-gate branch four rounds. RETRACTED IN PLACE
and named as a correction rather than quietly deleted. Battery table fixed (said 149/149, true
152/152) and now states which figures were NOT re-measured. probe/surfaces-parity.json keeps the
original H1 measurement marked SUPERSEDED (a dated measurement is a record, not to be rewritten)
and adds a re-measurement of the shipped H1 — Newsreader/500/34px at an asserted authenticated
URL — while saying plainly that the DESIGN side of that row was confirmed by EYE, not measured,
because present mode renders the design cross-origin. New §4c records the whole review round.

ONE PROCESS NOTE, self-reported: my first fix commit swept the finding-4 RTL change in under a
finding-5 message. Both live in WorkspaceIntake.tsx so they cannot be split by file; I amended
the message to name both rather than let one ride in silently. Not pushed before the amend.

CARRIED, unchanged: the 15 NITs stay filed. The founder's scope call closed the no-backend
findings (dead Save/Delete handlers, inert composers, empty __chat pane, file-preview selection)
— those are Lane M's after the merge, and I have not touched them.

[2026-08-01 19:40] VERDICT frontend/feat/surfaces-import @ 4e9908b — CHANGES (re-gate). Four of the
five fixes are REAL and were verified against the files, not the commit messages: the false "Saved"
labels are gone from BOTH locales symmetrically with no orphan {when} placeholder · assignment
targets now carry kind-prefixed ids that are unique WITHIN AND ACROSS kinds, keyed and selected on
id · the Hebrew build line is dir="auto" with font-mono-num dropped · and mouse-send is fixed at all
four composer sites with the whole trap class swept (the only three send(explicit?: string) callers
in the repo were checked). The retraction commit is honest: claims retracted IN PLACE and named as
corrections, battery corrected 149→152 with an explicit "not re-measured" note, the parity probe
keeps the superseded record marked rather than deleted. Merge of main is clean, scope lock intact
(no supabase/, no *.sql, no api routes, no middleware/gate, no new dependency), trivially compatible
with docs/DATA-MODEL.md since the branch creates no tables. Reviewer independently re-ran the
battery on a detached worktree: 152/152 pass, tsc clean. FIX 2 IS WHERE IT FAILS — see the BLOCKER.

[2026-08-01 19:40] FINDING feat/surfaces-import · BLOCKER · src/components/workspace/WorkingDocument.tsx:190 —
THE MARKER FIX REGRESSED THE EXPORT PATH ON THE MOST DANGEROUS ELEMENT ON THE BRANCH. Moving the demo
marker OUTSIDE contentEditable correctly fixed two things (a Hebrew reader now sees it; the user can
no longer delete it) but placed it at the TOP of the same `overflow-auto` pane (:181) that holds the
quote. window.print() (:165) on this h-screen + overflow-hidden layout prints ONE page clipped to the
current scroll offset, so scrolling down to the quote and exporting emits the invented Hebrew quote
attributed to a NAMED REAL TASE EXECUTIVE with its filing-shaped cite line and NO MARKER AT ALL. The
old marker was English and deletable, but it lived inside <cite> and therefore always travelled with
the quote — on the print path specifically this is a REGRESSION. Not reasoned: the reviewer built a
structural repro of the exact layout, scrolled to the quote, ran Chromium page.pdf() and extracted
with pdfjs — marker ABSENT, quote PRESENT, cite PRESENT, 1 page, notice rect at top:-819px. The code
comment at :189 and evidence §4c both ASSERT THE OPPOSITE as verified, which makes this the
states-something-false class twice over: the artifact lies to the reader, and the record lies about
the artifact. Root cause is the round-1 export WARNING (WorkingDocument.tsx:160, window.print() on a
clipped layout with no @media print rules) which was never addressed and is NOT on the founder's
closed list.

[2026-08-01 19:40] FINDING feat/surfaces-import · WARNING · docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md:89 —
The §3 demo-marking audit still states the citation block "renders with the attribution line
explicitly ending `— DEMO, invented quote`" (row :82 credits "the citation block's attribution"),
which commit 1226933 DELETED. The same file contradicts itself in §4c four sections later. The
durable record merging to main therefore disagrees with both itself and the code, on the branch's
most dangerous element.

[2026-08-01 19:40] FINDING feat/surfaces-import · WARNING · docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md:64 —
No PNGs were re-captured for the three screens the fix round visibly changed, so
workspace-document-{en,he}.png still picture "✓ Saved just now" and the inline English marker, and
workspace-intake-he.png still shows the mono/reversed build line — with captions describing them as
shipped. The visual claims for fixes 1, 2 and 4 rest entirely on unrecorded eyes-on checks.

[2026-08-01 19:40] FINDING feat/surfaces-import · NIT · src/components/agents/AgentsPage.tsx:134 —
The agent status word is wrapped in dir="ltr" + font-mono-num while resolving to Hebrew
dict.agents.working/idle ('עובד'/'ממתין'). Iron rule 5 scopes those to numerals and tickers.
Cosmetic today because each is a single RTL run; wrong the moment the string gains a second word.

[2026-08-01 19:40] FINDING feat/surfaces-import · NIT · src/components/projects/ProjectView.tsx:358 —
Two more React lists still key on a human label (key={cx.name}, and WorkspaceDetailColumn.tsx:208
key={s.label}) — the exact class fix 3 just removed from CreateAgent. Latent only because addContext
numbers new sources and nothing deletes them.

[2026-08-01 19:40] FINDING feat/surfaces-import · NIT · src/app/app/agents/page.tsx:34 — The target-id
uniqueness invariant that cost a whole review round is enforced only by prefix strings in a route
file and is covered by NO TEST; src/lib/agents/data.test.ts would stay green if a future scope kind
reintroduced colliding ids.

[2026-08-01 19:40] FINDING feat/surfaces-import · NIT · src/components/chat/ChatComposer.tsx:111 —
The tall-composer repair is main-scope work (mouse-send is broken in Ask Atlas on main today) riding
in a UI-import branch, against the supervisor's own "the root cause deserves its own small branch".
Loudly declared rather than smuggled, but it changes a shipped surface with no test and no evidence
artifact.

[2026-08-01 19:40] NOTE supervisor — MINIMAL PATH TO APPROVED, per the reviewer and endorsed: either
DISABLE Export-as-PDF (exactly as Export-as-Word already is) or restore a LOCALIZED marker inside the
quote block, then strike the "survives into Export as PDF" claim from the code comment (:189), the
commit trail, the evidence and the ready-queue handoff — plus the two evidence corrections above.
Everything else on this branch is merge-ready. Supervisor's recommendation is to do BOTH halves:
disable the button (the round-1 finding proves the print path is broken on this layout regardless of
markers, and a real Hebrew PDF needs server-side Playwright per rules/app.md — not a UI-chapter job),
AND put a localized marker back inside the quote block so it travels with the quote through any path
the app does not control, including a plain browser Ctrl+P, which disabling a button does not prevent.

[2026-08-01 22:31] VERDICT supervisor/fix-surfaces-export-marker @69ba1e4 — APPROVED (3 WARNING, 4 NIT)
[2026-08-01 22:31]   Cold gate confirmed the BLOCKER closed: no window.print() anywhere under src/components/workspace/.
[2026-08-01 22:31]   Reviewer mutated the source 5 ways to prove the new tests are not vacuous (4/6, 3/6, 5/6, 2/6 red).
[2026-08-01 22:31] FINDING fix/surfaces-export-marker · WARNING · src/lib/demo/seedDocument.ts:31 · <cite dir="auto"> resolves RTL from the leading Hebrew name, so in the en locale the appended English marker renders right-aligned with its sentence-final period orphaned to the visual start of the line — needs <bdi> isolation, the remedy this repo already used for the "sheets 4" defect; iron rule 5's "test bidi visually" was not satisfied for this line. FIXED in 975dec7.
[2026-08-01 22:31] FINDING fix/surfaces-export-marker · WARNING · docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md:281 · The claim that the in-<cite> marker covers "a plain browser Ctrl+P" is overstated: in a ~28px band (scrollTop 350-378 of 1605px) Chromium's print clip lands between the quote and its cite line and emits the fabricated Hebrew quote with no marker and no notice — reproduced with page.pdf() + pdfjs against the real seedHtml(he) and the repo's own @media print block. FIXED in 975dec7 (recorded as a correction; the residual is real and stated).
[2026-08-01 22:31] FINDING fix/surfaces-export-marker · WARNING · docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md:15 · Battery table still read 152/152 after the commit added 6 tests — the ship record contradicted the tip it described. Same class as the commit immediately before it. FIXED in 975dec7 (now 160/160 from pasted output).
[2026-08-01 22:31] FINDING fix/surfaces-export-marker · NIT · src/lib/demo/seedDocument.test.ts:41 · assert.ok(block.includes('<cite')) only proved a <cite> exists somewhere in the blockquote, not that the marker is in it — moving the marker to a sibling <p> passed 6/6 (demonstrated). FIXED in 975dec7.
[2026-08-01 22:31] FINDING fix/surfaces-export-marker · NIT · src/components/workspace/WorkingDocument.tsx:148 · Comment claimed the layout has "no @media print rules"; globals.css:488 does have one, it just does not unclip this frame. FIXED in 975dec7.
[2026-08-01 22:31] FINDING fix/surfaces-export-marker · NIT · src/components/workspace/WorkingDocument.tsx:28 · "the in-quote marker is never English-only" does not hold after a user edits (persisting the EN seed) then switches locale. FIXED in 975dec7 (documented as a known limit, not code-fixed — the block goes away with real retrieval).
[2026-08-01 22:31] FINDING fix/surfaces-export-marker · NIT · src/components/workspace/WorkingDocument.tsx:143 · Disabling the PDF row removed the export menu's only closing affordance. FIXED in 975dec7 (click-away + Escape, WorkspacePicker idiom).
[2026-08-01 22:31]   DEFECT CLASS, 3rd occurrence on this branch: evidence written from intent rather than from the code/output. See also a5f2496 and the login-gate branch's 4 rounds.
