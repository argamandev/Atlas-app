# ATLAS FLEET BOARD — the shared brain
<!-- Protocol: read at session start + before big moves (this file AND the two logs below).
     Update ONLY your own lane section. Timestamp every update.
     Cross-lane alerts    → APPEND to agent-memory/cross-cutting.md (never edit this file for that)
     Review requests      → APPEND to agent-memory/ready-queue.md
     Appends go via bash >> or fs.appendFileSync — appends to separate files cannot collide. -->

## MISSION — north star & current focus (supervisor-maintained)
Atlas = the institutional platform for Israeli public-market investor calls (docs/VISION.md).
**Current phase: build the advanced product on the cleaned foundation.**
- Lane F → the product's face: Claude Design import ✅ DELIVERED 2026-07-14 (merged `69a98be`).
  Next focus: real feeds for the stub modules (announcements/reported/indices) + reviewer
  follow-ups (fake Q2-2026 quarter on Home, stub-data demo markers) — founder to prioritize.
- Lane I → PARKED (founder decision 2026-07-14): future re-mission to "higher-quality
  transcripts than today" deferred while the founder studies LLM approaches. Seat + worktree stay.
- Lane M → the product's depth: reports+slides beside the transcript, markable + Ask-Atlas-able (core differentiator)
Every lane: if a step doesn't serve its line above, flag it before building.

## Lane F — frontend-import (branch feat/design-parity · port 3001)
- status: [2026-07-14] PARITY PASS + FOUNDER ROUNDS 2–6 QUEUED — original parity pass (font
  root cause: app was Inter/Calibri vs design SYSTEM stack; anatomy rebuilt from design markup
  w/ typed stubs) followed by five founder-feedback rounds on the same branch. Round highlights:
  rail 230px + Workspace/Agents rebuild (r2) · charcoal player revert + scheme toggle back +
  drag gutters + in-page Ask dock (r3, founder DECISIONs logged) · headlines→system stack final
  + countdown ink invert + beam .ln-* anatomy (r4) · per-frame ink + wall-clock countdown +
  live facet chips via shared FacetPanes (r5) · FONT TRUTH: TWO stacks, headlines = SF Pro
  Display stack → ARIAL on Windows (measureText-verified) + full live Multi view + 36px
  PaneHeader alignment (r6) · DS Tabs scale-up, founder ask (r7). FOUNDER GATE PASSED
  2026-07-14 ("okay its good") — SHIPPED to ready queue @ aecdb9e (15 commits on top of
  feat/frontend-import, pushed; review together/in order). Home-greeting spacing complaint
  investigated pixel-by-pixel: app already matches mockup (35px/35px), no change, founder
  accepted. Stale :8788 claim from the 07-07 founder demo released 07-14.
- last verified: [2026-07-14] ship battery: tsc clean · 77/77 tests · production build green ·
  founder live eyes-on approval on :3001 (Chrome MCP disconnected this session; founder viewing
  + served-HTML checks stood in).
- next: SUPERVISOR review/merge of feat/frontend-import + feat/design-parity (ready-queue entry
  2026-07-14). After merge: real feeds for the stub modules (announcements/reported/indices),
  ghost autocomplete, Projects, webinars feed, Workspace/Agents backends.
- blockers: none (waiting on supervisor merge)
- [supervisor note 2026-07-23] section stale: the merge it waits on happened 2026-07-14
  (69a98be). Seat idle since. Founder's new app-wide design round (Ask Atlas panel, colors/
  typography, call-view UX) is the likely next chapter — refresh this section + the
  LAUNCH-KIT Lane F prompt via the /ship re-mission runbook BEFORE relaunching the seat.

## Lane I — ivrit-pipeline (branch feat/ivrit-pipeline · port 3002)
- status: [2026-07-04] M1 SHIPPED + REAL-ZOOM TEST PASSED WITH FOUNDER (2 rounds) —
  feat/ivrit-pipeline @ e2a8851 (18 commits): full live chain audio-only bot → ivrit chunks →
  karaoke → source end → auto finish → Gemini polish → finished call, founder-verified live.
  Round 1 exposed + fixed a latent BOTH-pipelines viewer bug (session mixing in stale tabs,
  2a98a83) and pulled the finish flow into scope per founder decision (e2a8851). 64 tests.
  Follow-up filed: tsconfig.scripts.json typecheck gap (scripts/** never tsc-checked, repo-wide).
- last verified: [2026-07-03] Task 8 quality comparator (scripts/compare-live-quality.ts) on the
  Task 7 full-archive run: ours 146 tok / Recall captions 106 tok / whole-file IVRIT ref 112 tok
  — agreement vs Recall 56.6% (41.1% of ours), vs whole-file-no-chunking 60.7% (46.6% of ours).
  Subjective read: divergences are mostly loanword-spelling variants (פרונטנד/פרונטנט/פונטנט) and
  differing repeat-counts on the "וואו"/thank-you filler loops in this repetitive smoke-test clip
  (chunk-boundary hallucination, not real content loss) plus one Recall-only Cyrillic-garbage
  artifact IVRIT didn't produce — no evidence chunking drops real content on this source. Numbers
  are noisy (only ~146 words on a 387s sparse clip) per design; full output in
  .superpowers/sdd/task-8-report.md (Atlas-ivrit worktree).
- next: await supervisor review/merge of feat/ivrit-pipeline → then M2 candidates (founder to
  prioritize): real-Zoom run via live-test · Gemini correction layer · diarization ·
  ws-reconnect + PCM memory (shared limitation with the Recall engine, bites on 2h calls)
- blockers: none (waiting on supervisor merge only)
- [supervisor note 2026-07-23] section stale: that merge happened 2026-07-04 (9c6f0e7+e06ca7a);
  lane PARKED by founder decision 2026-07-14 — see MISSION line. Section refresh happens at
  re-mission per the runbook.

## Lane M — multiview-backend (branch feat/multiview-backend · port 3003)
- status: [2026-07-14] SESSION 1 LIVE — .env.local seeded by founder, npm install done
  (pdfjs-dist 5.4.296 via pdf-parse ^2.4.5). DAY-ONE SPIKE DONE, VERDICT: **QUIRKS — no
  fallback needed.** demo-report.pdf (Tigbur Q1-2026, 31pp, Aspose.PDF 22.10 producer):
  pdf.js getTextContent gives Hebrew in CORRECT logical order at word level (no reversed
  glyphs, no garbled bidi). Quirks: (1) within-line stream order occasionally swaps a
  segment — FIXED in spike by y-grouping + descending-x RTL sort with LTR-run handling
  (verified: the swapped "לשנה" line reassembles correctly); (2) digits fragment ("30"→
  "3 0", "% 50" for 50%) + hyphenated refs need punctuation-neutral run logic — minor,
  fixable; (3) table pages jumble (multi-column cells interleave by line) — inherent to
  PDF text extraction, acceptable: chat context centers on prose, rendered pdf.js view
  positions text absolutely regardless. Spike scripts in session scratchpad; algorithm
  will land in the real extraction module with tests.
- last verified: [2026-07-16] M1 SHIPPED TO READY QUEUE — feat/multiview-backend @ 47ac911
  (17 commits over origin/main, range 473fe7b..47ac911, pushed; merged origin/main in).
  MILESTONE 1 VERIFIED EYES-ON via Chrome MCP on :3003: migration 20260714_012 APPLIED to
  the shared DB + Tigbur demo report SEEDED (31/31 pages) → real PDF renders in the Report
  pane (dark+light, paper-white pages, RTL/bidi correct incl. financial tables) → Hebrew
  drag-selection inside the PDF seeds Ask Atlas with the passage → streamed answer opens
  "על פי הקטע המסומן בדוח הדירקטוריון" and lists the marked segments → console clean.
  Battery post-merge: 86/86 · tsc · build. THREE live-run-only bugs found+fixed during
  verification (companies.ticker→tase_security_id · webpack-mangled pdfjs→native import
  from public/pdf.min.mjs · pdf.js buffer-transfer detaching the upload array→0-byte PDF,
  + hour-long cache pinning it→no-store). Evidence:
  docs/evidence/feat-multiview-backend/2026-07-16-m1-e2e-verification.md.
- next: [2026-07-17] PINGE SHIPPED TO QUEUE — feat/pinge @ ff4c8f9 (11 commits stacked on
  feat/multiview-backend@75d198d, pushed; review multiview first). Same-day full cycle:
  founder brainstorm → spec → 9-task TDD plan → build → verify. Snip-to-chat: scissors on
  the Report pane → drag-rect → zoom-proof 2x offscreen PNG crop → ≤4 thumbnail chips in
  Ask Atlas → Gemini reads the table pixels (real e2e: streamed answer cited page 6 and
  read the exact digits) + marking-UX unified (button-first when chat closed, auto-ref when
  open — text+snips, finished+live). 99/99 tests (13 new) · tsc · build · console clean.
  One verify-found bug fixed (setPointerCapture guard). Evidence:
  docs/evidence/feat-pinge/2026-07-17-pinge-e2e-verification.md. Founder one-look: real-hand
  drag feel + dark-theme polish + audible playback of the Q1 call (carried over). Earlier
  rounds context: r2/r3/r4 all closed and queued (ADDENDA 2-5 @ 75d198d). Next after merge:
  founder's layer 2 (call-view frontend polish) + layer 3 (smarter Ask Atlas), then Slides
  pane; future context-intelligence layer noted in the Pinge spec (instrumentation points).
- [2026-07-23] PINGE MERGED (2d6d409, founder one-look PASSED "works amazingly") →
  WARNINGS-FIX SHIPPED TO QUEUE — fix/review-warnings @ af0f08d (4 commits over
  origin/main@3e7f0d5, pushed): all 6 earmarked reviewer WARNINGs fixed (empty-history
  Gemini poison → sanitizeHistory client+server, TDD; live-view snip toast; oversize-snip
  client refusal + snipTooBig toast; pdfjs-dist pinned 5.4.296 direct; stub-report demo
  pill both locales; process-WARNING lesson filed). Battery 104/104 (5 new) · tsc · build ·
  eyes-on :3003 (real-PDF path intact, poison-history probe vs real Gemini = no fallback,
  badge dark+light). Evidence: docs/evidence/fix-review-warnings/2026-07-23-warnings-verification.md.
  NOTE: founder is importing a NEW app-wide design round via Lane F today (Ask Atlas panel,
  colors/typography, call-view UX) — merge this small branch BEFORE the import lands
  (same surfaces: chat panel, call views, FacetPanes).
- blockers: supervisor review/merge of fix/review-warnings; then next chapter = founder's
  layer 2 (call-view polish) + layer 3 (smarter Ask Atlas), then Slides pane
- [supervisor note 2026-07-23] feat/pinge MERGED → main (2d6d409, docs 51f3fff, pushed);
  reviewer APPROVED 0 blockers / 4 WARNING / 4 NIT (filed in ready-queue — headline: snip-only
  send poisons follow-up history with an empty Gemini text part; client never pre-checks the
  2MB attachment cap). Fix-forward WARNINGs + the multiview pair (pdfjs-dist direct dep,
  stub-report demo marker) = Lane M next-chapter intake. Branch feat/pinge stays checked out
  in the worktree until the seat's next chapter.
- [supervisor note 2026-07-17] MERGED → main (2c2b464, docs ca36278, pushed): reviewer APPROVED
  0 blockers / 2 WARNING / 4 NIT (filed in ready-queue — headline: pdfjs-dist undeclared as
  direct dep; stub-report fallback on fetch error lacks demo marker). Lessons graduated
  (marker in state file). Branch stays checked out in the worktree for the seat's next
  chapter (Pinge brainstorm, fresh session). Remaining founder item: audible-playback
  one-look of /app/live/PyuMxe88e8g_live.

## Supervisor (main checkout · port 3000)
- status: [2026-07-23] MERGED feat/pinge → main (2d6d409) + docs commit (51f3fff), PUSHED.
  Two gates ran: atlas-reviewer APPROVED (0 blockers / 4 WARNINGs / 4 NITs — all filed as
  FINDINGs in ready-queue; reviewer re-ran battery itself 99/99 + tsc, hand-checked crop
  math + auth gate + additive wire shape) + supervisor battery independent (99/99 · tsc ·
  build — in the worktree @ ff4c8f9 AND on main post-merge). Merge-time truth done: PROGRESS
  entry, ARCHITECTURE catch-up (chat/attachments.ts, documents/snip.ts, PdfViewer snip
  overlay, 99-test list), pinge spec+plan stamped SHIPPED, e2e evidence committed. Reviewer
  cross-cut gap (ChatInput attachments not pre-logged) remedied with a retroactive TYPES
  line. Lint counter: 2 MERGEs since last LINT (07-14) — /fleet-lint due at the NEXT merge.
  Lane M next-chapter intake: 4 pinge WARNINGs + 2 multiview WARNINGs (pdfjs-dist direct
  dep · stub-report demo marker). TIMELY: founder finishing a NEW app-wide design round
  (Ask Atlas panel, colors/typography, call-view UX) — pinge was merged first deliberately
  so the redesign lands on a clean base; expect a design-import chapter next. Open founder
  items: Supabase token rotation for the main session (from 07-02). Supervisor session may
  be restarted fresh anytime — everything lives in files.
- merged to main recently: feat/pinge · feat/multiview-backend · chore/environment-audit-fixes ·
  feat/frontend-import+feat/design-parity · feat/ivrit-pipeline · feat/knowledge-compounding
