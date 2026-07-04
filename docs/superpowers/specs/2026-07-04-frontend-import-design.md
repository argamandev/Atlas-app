# Frontend import — Claude Design → Atlas app (Lane F, Milestone 1)

**Date:** 2026-07-04 · **Branch:** `feat/frontend-import` · **Status:** approved by founder (pending spec review)

## What we're building

Import the Claude Design frontend — its design, animations, and aesthetics — faithfully into
the Next.js app, for the pages that already exist (Home, Calendar, Chat, Company overview +
tabs, Investor-call view live + finished, Ask Atlas), keeping their real backend wiring.
Workspace and Agents become navigable frontend-only stub pages behind clean data interfaces.

## Source of truth

- `design-import/Atlas MVP.dc.html` + `atlas-anim.js` + `_ds/` bundle (landed in this worktree;
  verified identical to the claude.ai/design project `a041c61d-…`).
- The rendered design is served locally (`python -m http.server 8399` in `design-import/`) and
  is the visual reference for every comparison.
- **Live-beam reference:** `uploads/live-beam-animation-ig-ring.html` in the design project —
  the founder explicitly wants this radar-ring beam on live avatars (the MVP template only has
  the simpler pulse dot). Copied locally to `design-import/reference/live-beam.html`.

## Founder decisions (filed in cross-cutting.md 2026-07-04)

1. **Look locked:** black rail + default heading font; the in-rail theme/font experiment
   toggles are NOT imported. Language toggle stays.
2. **Real data:** existing pages keep their live wiring (Supabase, live engine, chat API).
   Stub data only for Workspace/Agents, behind one data-interface module each.
3. **Call view:** ships Dark + Light with the toggle, defaults Dark.
4. **Build order:** Shell → Home → Calendar → Company → Call view → Chat/Ask-Atlas.
   (Workspace/Agents stub pages land with the Shell step so nav never dead-ends.)

## The design language (contract)

- Surfaces: cream main `#F5F3EE`, stone desktop `#E7E2DA`, black nav rail, white cards.
- Ink `#1C1B19`; hierarchy by weight/gray only. Three speaking colors: live red (LIVE states
  only), ask-yellow `#FCE44D` (Ask-Atlas selection/highlight only), charcoal (player + user
  chat bubble).
- Type: UI sans; serif display voice (wordmark, report titles); **JetBrains Mono for all
  data** — timestamps, dates, quarter labels, counters, the entire Agents page. Numbers
  tabular + LTR always, in both languages.
- Radius 8–14px; soft diffuse shadows (`shadow-float`, `shadow-player`); hairline dividers
  used sparingly; whitespace separates.
- Animations (copied, not re-created — keyframe values verbatim from the design):
  - `atpulse` (LIVE dot pulse), `atline`, `atblink` (karaoke caret), `atsettle` (transcript
    lines rise in) — from the `.dc.html` head.
  - **`radar-pulse` beam** (0.75→1.9 scale, 0.9→0 opacity, 5.4s, ×3 rings staggered 1.8s) +
    `dot-blink` (2.6s) — from the live-beam reference; applied to live avatars in LIVE NOW,
    calendar live chips, and the call header when live.
  - Canvas engine `atlas-anim.js` ported as-is (module + thin React wrapper `<AnimCanvas>`):
    `buffer` (behind the live player edge), `globe`/`stream`/`desk` (Workspace, later).
  - Ask Atlas panel: slides in from the right side of the screen; audio keeps playing;
    text selection turns ask-yellow and becomes an excerpt chip with speaker attribution.
  - Quote-card actions fade in on hover (`.atq:hover .atq-actions`, 0.14s ease).
  - All animation honors `prefers-reduced-motion`.

## Architecture

1. **Token layer first** — extend `tailwind.config.ts` + globals with the design's tokens and
   fonts (Newsreader, JetBrains Mono via next/font; keep IBM Plex Sans Hebrew coverage for
   Hebrew). Appended to cross-cutting.md before the commit lands (shared-DS law).
2. **Shell** — rebuild `NavRail` to the black rail: wordmark, Quick access ⌘K, Home/Calendar/
   Chat/Workspace/Agents, Profile + language toggle bottom, collapsible (wordmark → A mark),
   RTL mirror. New `/app/workspace` and `/app/agents` routes render stub pages from day one.
3. **Stub data interfaces** — `src/lib/workspace/data.ts`, `src/lib/agents/data.ts`: typed
   functions returning the design's demo content; swapping in real backends later touches only
   these modules.
4. **Pages, in order, upgrade-in-place** — each page keeps its data plumbing and is restyled
   to the design; every page is one shippable step (own commits, own verification, /ship to
   ready-queue).
5. **States beyond the mock** — the design shows happy paths. Loading/empty/error states keep
   the app's current behavior, restyled to the new language (mono, quiet gray, no spinners the
   design wouldn't tolerate).
6. **i18n** — every new UI string enters both dictionaries; the design's EN layout is pixel
   truth; the HE mirror is produced by our LocaleProvider/dir logic and verified visually
   (the mock's own language toggle is nonfunctional — known gap, not a bug to import).

## Self-verification protocol (how I check my own work)

Per page, before claiming done (this is /verify-app, specialized):

1. **Side-by-side eyes:** design at `:8399` and app at `:3001` in Chrome at the same viewport;
   screenshot both; compare structure, spacing, typography, colors. Fix, re-shoot, repeat.
2. **State matrix:** EN + HE (RTL flip) · home live + no-live · call Dark + Light ·
   Single + Multi · hover states (rows, quote actions) · selection state (ask-yellow).
3. **Motion check:** record short GIFs (gif_creator) of design vs app for each animation —
   beam rings, LIVE pulse, transcript settle, karaoke caret, Ask-Atlas slide-in — and compare
   rhythm; keyframe values are copied verbatim so drift means a porting bug.
4. **Console zero:** read_console_messages after exercising each page — no errors, no 404s.
5. **Real-backend proof:** Home/Calendar/Company/Call render real Supabase data (Tigbur as
   the standard specimen); chat hits the real `/api/chat`. For live surfaces: run the live
   engine + `scripts/live-replay-engine.mjs` and watch with my own eyes — LIVE NOW appears
   with the beam, call view runs karaoke, buffer animation tracks the live edge, source-end →
   FINISHED transition works. (Engine :8788 is single-owner — claim in cross-cutting first.)
6. **Battery per /ship:** `npx tsc --noEmit` · `npm test` · `npm run build` green before any
   piece goes to the ready queue. Existing tests must stay green throughout.

## Out of scope (Milestone 1)

Full Workspace/Agents functionality (stubs only) · real Slides/Report content in Multi view
(frontend renders the panes; Lane M owns the artifacts) · deploy · auth hardening (flagged
pre-launch pass).

## Risks

- The design's component names overlap our existing ones — upgrades must not silently change
  behavior; each page's data plumbing is untouched unless the design requires new props.
- Newsreader/JetBrains Mono add font weight — subset via next/font and verify Hebrew fallback
  doesn't regress (brand face covers Hebrew; mono is Latin/digits only).
- Live verification depends on the replay engine, not a real Zoom call — a real-call test
  remains a supervisor/founder ritual (live-test skill) after merge.
