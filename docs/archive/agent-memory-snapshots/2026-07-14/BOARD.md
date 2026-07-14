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

## Lane M — multiview-backend (branch feat/multiview-backend · port 3003)
- status: NOT STARTED — waiting for local-assets/demo-report.pdf
- last verified: —
- next: —
- blockers: —

## Supervisor (main checkout · port 3000)
- status: [2026-07-14] MERGED feat/frontend-import + feat/design-parity → main (69a98be),
  PUSHED. Two gates ran: atlas-reviewer APPROVED (0 blockers, 3 WARNINGs + 6 NITs — all
  filed as FINDINGs in ready-queue) + supervisor battery (77/77, tsc, build — on branch AND
  on main post-merge) + founder parity gate passed same day. feat/frontend-import deleted
  (local+remote); feat/design-parity kept (checked out in the Atlas-frontend worktree — seat
  continues). PROGRESS entry appended. Founder decisions filed 2026-07-14: Lane I re-mission
  DEFERRED (founder studying LLM approaches) · environment-audit fix plan APPROVED — NOW IN
  PROGRESS on chore/environment-audit-fixes (docs/audits/2026-07-07-md-environment-audit.md,
  26 findings, 4 leverage items: mechanize rituals / durable evidence + snapshots / enforce
  append-only logs / drift one-liners). Staged launch: Lane M still last.
  Supervisor session may be restarted fresh anytime — everything lives in files.
- merged to main recently: feat/frontend-import+feat/design-parity · feat/ivrit-pipeline ·
  feat/knowledge-compounding · fix/harness-audit
