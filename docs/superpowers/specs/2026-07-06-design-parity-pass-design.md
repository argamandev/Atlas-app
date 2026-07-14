# Design Parity Pass — spec (2026-07-06)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

**Lane:** F (frontend-import) · **Branch:** `feat/design-parity` (off `feat/frontend-import`)
**Founder decisions:** Option A (pixel-parity audit loop) · missing density modules built now with stub data.

## Problem

Milestone 1 imported the Claude Design frontend by **restyling existing components to approximate
the design**, verified by eyes-on resemblance rather than side-by-side comparison. The founder's
3-page comparison (`C:\Users\Sagi\Desktop\Atlas Design Project\Frontend Comparison`) shows the
result reads clearly worse than the design: wrong base font stack (character shapes differ on
every page), missing micro-structure (calendar filter chips, hint lines, event-pill anatomy,
facet chips with ×, pill player, CALL SECTIONS default-open, Ask-Atlas serif hero), and missing
density modules written off as "data gaps" (company identity mono line + index chips, LIVE·TASE
status, Latest reported quarter module, Latest announcements).

Root causes (filed as lessons):
1. "Import exactly" was executed as "rebuild to resemble" — hundreds of small approximations compounded.
2. Verification compared pages against memory of the design, never A/B at the same viewport.
3. Design demo density was treated as optional data, not as part of the design.

## Goal

Every page/state of `Atlas MVP.dc.html` and our app are **indistinguishable side-by-side** at the
same viewport — typography, spacing, component anatomy, hover/animation states — in EN and HE,
with design-only modules present via typed stub data. The ship gate is a founder-facing
comparison sheet (design left / ours right, every page), not a claim.

## Ground truth sources (in order)

1. **Re-synced `Atlas MVP.dc.html`** via DesignSync at pass start (never work from a stale export).
2. **The design's own stylesheet** — `_ds/atlas-design-system-…/styles.css` + `_ds_bundle.css`
   pulled via DesignSync: exact font stacks, tokens, component CSS. Replaces guessing/probing.
3. **The design project's ~100 screenshots** (`screenshots/…`) — the authoritative enumeration of
   states to match (cal tooltips/toggle/multi, facet single/multi, quotes states, co-webinars,
   chat states, ws states…). Workspace/Agents screenshots inform stubs only — still frontend-only.
4. **The rendered design at :8399** (Chrome MCP) — computed-style probe + scripted hover capture
   where the stylesheet leaves doubt.

## Method — the audit loop (Option A)

**Phase 0 — foundations first.** Pull the design stylesheet; diff its font stacks (body, Hebrew,
serif, mono), base sizes, letter-spacing, weights against ours; fix globally in
`globals.css`/`tailwind.config.ts`/`layout.tsx` fonts link. One fix corrects every page at once.
Nothing else starts until body text is pixel-identical in a headline/paragraph A/B crop.

**Phase 1 — enumerate.** Build the state matrix from the design's pages × its screenshot library:
for each of Home, Calendar, Company (Overview/Quotes/Documents≙Reports/Webinars), Investor call
(single + multi facets, dark + light, live + finished), Chat (empty + active), Ask Atlas panel,
Workspace, Agents — list default + hover + toggled states. Matrix lives in the audit doc.

**Phase 2 — per-page loop** (order: Calendar → Company → Call → Home → Chat → stubs pages):
1. Screenshot design page at :8399 and our page at :3001, identical viewport (1920×950), EN.
2. Write every visible difference into the audit checklist (typography, spacing, anatomy, states).
3. Fix. Approximation that fails twice → **transplant the design's markup/CSS for that component
   verbatim** and rewire data/handlers.
4. Re-shoot until the pair is indistinguishable; then verify HE mirror + hover states (scripted).
5. Behaviors regression for that page (karaoke sync, quotes, chat streaming, live invariants —
   existing tests + eyes-on).

**Phase 3 — density modules with stub data.** Not a separate pass: each module is built inside
its page's Phase-2 loop (a page cannot pass its A/B without its modules). Typed interfaces,
`lib/<area>/data.ts` pattern like workspace/agents; content mirrors the design's demo content:
- Company overview: mono identity line (sector · ticker · IR name), INDICES chips (TA-125/TA-90),
  LIVE·TASE status, **Latest reported quarter** module (reported-results card, FROM THE CALL
  Hebrew quote, jump-to-transcript link wired to real transcript when one exists, outlook chip,
  Transcript/Slides/Report buttons), **Latest announcements** list (tag chips IMMEDIATE/
  TRANSACTION/FINANCIALS, dates, View all →).
- Calendar: filter chips row (Reports/Investor calls/Webinars ×), hint line, event-pill anatomy
  (type icon · name · mono time · hover +/×/✓), today ring, LIVE pill.
- Call view: CALL SECTIONS panel default-open with timestamped speaker rows + active red dot;
  facet chips with × in header; compact pill player; slides/report panes render design-style
  dark content cards when content exists (stub slide/report content until real feeds).
- Ask Atlas: serif "Ask anything about this call" hero + design composer anatomy.
Stubs are clearly marked in code; real-data wiring is follow-up work, not this pass.

**Phase 4 — the comparison sheet.** Artifact with design-left/ours-right pairs for every matrix
row (EN + HE). This sheet IS the ship evidence; the founder judges parity, not me.

## Out of scope

Real data feeds (announcements, reported results, indices), drag-resize facet dividers, chat
ghost-text autocomplete, Projects view, Workspace/Agents real backends. All remain on the board's
follow-up list.

## Verification

- The comparison sheet (Phase 4) — primary gate, founder-reviewed.
- Full battery: `npm test` · `npx tsc --noEmit` · `npm run build` · `/verify-app`.
- Live invariants untouched: sessionId reset, offline fallback, buffer drain (existing tests).

## Risks

- Two styling sources (transplanted design CSS + Tailwind system) drifting: mitigate by folding
  transplanted CSS into tokens/utilities where stable, verbatim-quarantined where not.
- Design file churn mid-pass: re-sync at start, freeze during the pass, note the sync hash/date.
- RTL regressions from transplanted LTR markup: HE mirror check is part of every page's loop,
  not a final step.

## Lessons filed (fleet-level, candidates for skill graduation)

1. Design parity verification = same-viewport side-by-side pairs, never resemblance-from-memory.
   (Candidate: `/verify-app` addendum when a design source exists.)
2. A design's demo density is part of the design — stub it, never render sparser.
3. Ship gate for design work is the comparison sheet itself, delivered to the founder.
