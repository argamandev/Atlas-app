# Parity audit — working doc (Task 1+)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

Ground truth: `design-import/Atlas MVP.dc.html`, re-synced 2026-07-06 (2935 lines, 260,921
bytes, byte-identical to the morning sync — frozen for this pass). Rendered at
`http://localhost:8399/Atlas%20MVP.dc.html`. App at `http://localhost:3001`.
Founder comparison screenshots: `C:\Users\Sagi\Desktop\Atlas Design Project\Frontend Comparison`.

## Probed foundations (rendered design, Home page — computed styles)

**THE base font stack (body text, all languages):**
`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif`
→ resolves to **Segoe UI (Variable)** on the founder's Windows 11. Hebrew renders in Segoe UI
too (its Hebrew glyphs), NOT a dedicated Hebrew webfont.

**Our app today:** `Inter, "IBM Plex Sans Hebrew", system-ui, sans-serif` → Latin = Inter,
Hebrew = IBM Plex Sans Hebrew. **This family mismatch — not sizes — is the "character shapes"
gap on every page.** Probe evidence: greeting metrics identical both sides
(42px/63px/−1.26px/700) but different family.

**REJECTED HYPOTHESIS:** `_ds_bundle.css` stack (IBM Plex Sans Hebrew/Inter/Heebo) + 15px type
scale belongs to the separate design-system subproject (old iteration, orange accent), NOT the
MVP file. Do not use bundle values without rendered-page confirmation
(`design-import/reference/ds-bundle-foundations.css` kept as annotated reference).

**Design type census (Home, family|size|line-height|letter-spacing|weight):**
- SYS 42px/63px/−1.26px/700 — greeting (system font, NOT serif on Home)
- SYS 17px/400 — row company names · SYS 16px/24px/400 — subtitle
- SYS 15px/600 — card titles/avatar letters · SYS 14px/600·450·400 — nav (450 = Segoe UI
  Variable in-between weight; active 600)
- SYS 13.5px/400 (Quick access) · SYS 13px/19.5px/400 (date line) · SYS 12.5px/400 meta ·
  SYS 12.5px/500 (View all)
- Caps labels are SYS (not mono): 11px/+0.44px/600 chips · 11px/+1.54px/600 "LIVE NOW" ·
  11px/+1.21px/600 TASE · 10.5px/+0.525px/600 relative-day chips · 9.5px/+1.14px/600 "Note"
- MONO (JetBrains Mono): 13px/500 dates · 11.5px/400 times · 10.5px/600 count badges
- line-height mostly `normal`; explicit only on paragraphs (24px@16px, 19.5px@13px)

**Known app deltas from the same probe (fixes owned by tasks):**
1. Body family Inter → design SYS stack. **[T2 — the one global fix]**
2. Section labels: app uses MONO 10.5/11px tracked; design uses SYS caps at same tracking.
   [T6 sweep + each page's loop]
3. Nav items: app 13px/20px; design 14px, weights 600/450/400. [T6]
4. Quick access: app 12.5px/−0.25px; design 13.5px/no tracking. [T6]

## State matrix (rows shot at 1510×937 viewport, dpr 1 — record actual per pair)

| # | Page / state | Design source | EN | HE | Hover | Status |
|---|---|---|---|---|---|---|
| 1 | Home default (live rail + upcoming) | live page + `01-clean*.png` | — | — | — | pending |
| 2 | Calendar full market | `cal-all.png`, founder shot | — | — | — | pending |
| 3 | Calendar filter chips add/remove | `cal-reports.png`, `01-cal-toggle` | — | — | — | pending |
| 4 | Calendar event hover context | `01-cal-tooltip*`, `01-cal-tt3` | — | — | — | pending |
| 5 | Calendar My calendar | `cal-mine.png` | — | — | — | pending |
| 6 | Company overview (identity+reported+announcements) | `co-overview.png`, `overview-*` , founder shot | — | — | — | pending |
| 7 | Company quotes (+folders, headline) | `co-quotes.png`, `01-quotes*` | — | — | — | pending |
| 8 | Company webinars | `01-co-webinars.png` | — | — | — | pending |
| 9 | Company ask-atlas entry | `co-ask.png` | — | — | — | pending |
| 10 | Call view single facet (dark) | `01-facet-single.png`, founder shot | — | — | — | pending |
| 11 | Call view multi facet (dark) | `01-facet-multi.png`, `resize-multi` | — | — | — | pending |
| 12 | Call view light theme | facet pages, Light toggle | — | — | — | pending |
| 13 | Call sections panel + karaoke live | founder shot, live replay run | — | — | — | pending |
| 14 | Ask Atlas panel (hero + thread) | `co-ask.png`, `ctrl-chat.png` | — | — | — | pending |
| 15 | Chat empty (serif hero + chips) | `chat-empty.png`, `chat-icon.png` | — | — | — | pending |
| 16 | Chat active thread | `ctrl-chat.png` | — | — | — | pending |
| 17 | Rail expanded/collapsed | all pages | — | — | — | pending |
| 18 | Workspace stub | `ws-grid.png`, `ws-empty.png` | — | — | — | pending |
| 19 | Agents stub | `agents-check.png` | — | — | — | pending |

## Seeded checklists (from founder comparison + probe; each page task finalizes its own)

**Calendar [T3]:** filter chips row (Reports/Investor calls/Webinars, ×-removable,
+-re-addable) · hint line "Filter by type · + adds a type, × removes it · hover any event for
its context" · pill anatomy: kind icon + name + mono 24h time + hover affordance (+/✓) · today
= filled black circle on day number · LIVE pill red · toggle copy "Full market / My calendar" ·
grid hairlines + row heights per design · no logo images in pills (kind icon instead).

**Company overview [T4]:** mono identity line `Shipping · TGBR · IR: Zvika Rabin` · INDICES
label + TA-125/TA-90 chips · LIVE · TASE ● status top-right · Ask Atlas button anatomy ·
title at design size (not 30px+ bold Inter) · MOST RECENT CALL card: `Q2 2026 · Investor call`
+ mono date + play row + mono duration · NEXT SCHEDULED: upcoming chip `Upcoming · in ~7
weeks` + Remind me · LATEST REPORTED QUARTER module (header, outlook chip, FROM THE CALL mono
label, RTL quote, SPEAKER · CEO, `> Jump to 0:41 in transcript`, Transcript/Slides/Report ghost
buttons, Ask Atlas about these results) · LATEST ANNOUNCEMENTS (date col, tag chips
IMMEDIATE/TRANSACTION/FINANCIALS, RTL titles, chevron, View all) · tab set naming per design
(Overview · Quotes · Documents · Webinars) · hover lifts.

**Call view [T5]:** CALL SECTIONS panel default-OPEN (title+date header, timestamped speaker
rows, red dot + highlight on active, follows playback) · facet chips w/ icons + × (Slides/
Report removable, Transcript pinned) · Dark|Light pill · compact pill player (avatar · title ·
LIVE · progress · mono time · pause · volume) not full-width bar · pane headers TRANSCRIPT /
SLIDES / REPORT + LIVE·karaoke tag · transcript segment: speaker chip + avatar trailing (RTL),
mono ts, caret bar on active edge, short paragraph measure · slides/report = dark content cards
(stub content when nothing linked) · Ask Atlas: serif hero "Ask anything about this call" +
subline + design composer (@ / send affordances) + aa-panel slide-in.

**Home/Chat/rail [T6]:** section labels SYS-caps not mono · nav 14px w600/450/400 · Quick
access 13.5px · beam card typography · upcoming rows 17px names/12.5px meta/mono dates ·
relative-day chips 10.5px+0.525px · chat serif hero stays Newsreader (per chat design update)
· bubbles/composer metrics vs design · Workspace/Agents A/B after font swap.

## Per-page findings log

**T2 (foundations):** app-wide family swap Inter/Calibri → the design's system stack; greeting
crop A/B letterform-identical post-swap. Type-scale override REJECTED (bundle ≠ MVP; our config
already carried the design scale from V1).

**T3 (calendar):** chips row (order Reports·Investor calls·Webinars), hint line, pill anatomy
(kind icon + accents probed #6E7B63/#67788A/#3A3833, mono time, always-visible +/✓ per design),
today black pill, LIVE = gray mono text + red pulsing dot (probed — red text was wrong),
hover context card ported with RTL-aware inset, singular type names in card. EN+HE+hover green.

**T4 (company):** identity mono line + INDICES chips + LIVE·TASE ping, reported-quarter module
(serif Hebrew quote, SPEAKER·CEO, Jump-to-0:41 → real transcript link, outlook chip, artifact
buttons), announcements (4 stub rows, tag chips), related companies (REAL peers), monogram
avatar language (design shows letter chips, not logos), SectionHeader mono→SYS caps (DS change,
cross-cut logged), tabs renamed Quotes/Documents. EN+HE green.

**T5 (call view):** facet chips w/ icons + ×/+ (Multi composes facets, Transcript pinned),
pane labels SYS caps, slides pane w/ prev/next + stub deck cards, report stub card, MediaPlayer
→ design docked pill, ask panel call-themed + serif staggered hero + design composer.
LIVE-verified on a real replay run: join gate, karaoke sweep, behind-chip, live pill,
end-of-call bar teardown. Dark+Light, Single+Multi green.

**T6 (home/rail):** rail 14px/450-weight rows + 25px chat spark, Quick access 13.5, LIVE NOW
design row (beam monogram + red caps quarter tag + kept clock), upcoming rows lead with mono
date col inside paper card + View all, greeting name capitalized, TASE mark docked in search.

## Residual gaps (honest, for the ready queue + founder report)

1. Drag-to-resize facet dividers — Multi uses fixed flex columns (out of scope, unchanged).
2. Chat ghost-text autocomplete + Projects view — stubs (out of scope, unchanged).
3. Webinars tab — designed empty state only until a webinars feed exists.
4. Reported quarter / announcements / IR / indices — SAME stub demo content for every company
   until real feeds land (typed interfaces ready).
5. Pill player keeps ±15 / volume slider / close as ghost controls (design's pill is more
   minimal; dropping working controls would regress founder-loved features).
6. LIVE NOW: no multi-call count badge (product has one live call); demo·clear-live omitted.
7. Live view (LiveBroadcastView) header keeps a plain Transcript label — live calls carry no
   slides/report facets yet, so no chips there.
8. Comparison sheet delivered as a LIVE A/B walkthrough (paired links per page) — the browser
   harness exposes no screenshot files to embed static pairs. Founder judges on the living app.
9. Compositor glitch recurred (CDP screenshot timeouts around heavy company→call navigations;
   page always clean after settle, console clean) — environmental, watch under real use.
