# Design Round 2 — "Harvey mode" app-wide restyle (import)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md
> + PROGRESS.md. Merged to main 2026-08-01 (`e977823`). One deliberate deviation from this
> spec shipped: `railText` `#85817A`, not the imported `#6B6862` (WCAG AA founder decision).

**Status:** APPROVED by founder 2026-07-25 (brainstorm in Lane F session, decisions filed to
cross-cutting.md same day). Branch `feat/design-round-2` off main (post multiview-M1 + Pinge +
warnings sweep).

## What this is

A visual re-skin of every existing surface of the app to the new Claude Design round's
"Harvey" aesthetic — black left nav rail, white page background, light-gray floating panels —
plus the new Ask Atlas panel treatment and the multiview float treatment. No new features, no
new pages, no schema/API changes.

**Source of truth:** the RENDERED design at `design-import/Atlas MVP.dc.html` (refreshed
2026-07-23 from claude.ai design project `a041c61d-6ab7-4c5c-bbb6-2033636e877c`; 310,406
bytes; served locally for probing — never trust its bundle CSS, per rules/app.md).
`design-import/Live Captions.dc.html` covers the live-captions surface.

## Founder decisions (locked)

1. **Aesthetic-only.** Workspace + Agents exist in the design and as stubs on main
   (`app/workspace`, `app/agents`) but get NO work this round.
2. **Harvey replaces all themes.** The Warm / Black-rail / Black+white cycle and its toggle
   are deleted. One theme. (Design file internally still cycles themes — probe in Harvey
   mode only.)
3. **Light everywhere, including call views.** Reverses the 2026-07-07 dark-call decision
   (#0A0A0A). Remaining dark elements: nav rail, docked player bar (and their contents).
4. **Pinge scissors: both entry points.** New scissors button in the Ask Atlas composer
   (arms snip mode on the open document pane) AND the existing Report-pane scissors stays.
   "Button-first when chat closed" behavior stays.
5. **One big reveal.** Founder reviews once, after the full restyle + battery + evidence.

## Scope — surfaces restyled

Shell/nav rail · Home · Calendar · Chat · Company (`company/[id]`) · call view live+finished
(`live/[id]`) incl. floating Multi panes + floating pane-selector pill row + pre-live
countdown · Settings · Ask Atlas panel (wider, new corner geometry, empty state, composer
with scissors/tuner/mic/black-send) · docked player (stays black).

**Untouched:** Workspace/Agents stubs, `/print/[id]`, legacy auth gateway (LEGACY.md), all
API routes, all data flows, all Pinge/chat functionality (chips, 4-max, oversize toast,
snip visibility rules).

## Token layer (foundation)

Rewrite `src/lib/design/tokens.ts` (and Tailwind config where tokens surface) from probes of
the rendered design in Harvey mode: page background, card background + shadow (subtle, no
border ring), rail black, player black, corner radii (sharper outer / rounded inner), ink
scale, and the computed Windows font stacks for body + headlines (re-probe; do not assume
round 1's values). Theme-switching code paths are removed, not hidden.

## RTL / i18n

Design mockup is LTR-English; the app renders Hebrew RTL + English. Carry round-1 discipline:
`dir="rtl"` on Hebrew, numbers/tickers `font-mono-num` + `dir="ltr"`, visual bidi check on
every restyled Hebrew surface.

## Verification (self-check, before the reveal)

- Design served locally (scratchpad static server, port 4321 — not a lane port); probe
  computed styles / canvas measureText on design AND app (:3001), per the six parity laws
  in the verify-app Frontend-import recipe.
- Full battery: `npm test` (104), `npx tsc --noEmit`, `npm run build`, console-clean,
  bidi eyeball on Hebrew pages.
- Evidence file: `docs/evidence/feat-design-round-2/` with side-by-side screenshots
  (design vs app) per surface.
- Then the founder one-look (big reveal), then /ship → ready queue.

## Risks

(a) Probing the design in a non-Harvey theme state — mitigate: pin/verify theme before every
probe session. (b) Windows font-stack resolution differs between headline and body stacks
(round-1 lesson) — re-probe both. (c) Theme-system removal touches many components —
mitigate: battery + eyes-on sweep of every route. (d) Design file contains surfaces we don't
ship (Workspace/Agents) — don't let their styles leak into shared components unexamined.
