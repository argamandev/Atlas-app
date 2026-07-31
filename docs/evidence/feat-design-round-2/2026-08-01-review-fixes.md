# Design Round 2 — reviewer fix round + the two carried residuals (2026-08-01)

Branch `feat/design-round-2` · Lane F · port 3001. Closes the atlas-reviewer verdict of
2026-07-31 (**CHANGES** — 1 BLOCKER / 7 WARNING / 6 NIT, ready-queue 2026-07-31) and the two
residuals the lane itself had carried.

Founder calls applied as given (cross-cutting 2026-07-31), not re-litigated: rail contrast must
pass WCAG AA · the Agents-page restyle STAYS · the "coming soon" mic button STAYS.

## What each committed image actually shows

Written deliberately literally — the BLOCKER this round existed because an image was cited for
something it did not show.

| File | What is in the frame |
|---|---|
| `app-ask-panel-en.jpg` | Finished Tigbur Q1-2026 call, **Ask Atlas panel OPEN**, EN. Panel header + ✕, serif hero "Ask anything about this call", sub-line, composer with **scissors (disabled) · mic (disabled) · black round send**, per-context caption. Rail left. Unauthenticated session → Report pane not mounted, so the scissors shows its **disabled** state. |
| `app-ask-panel-he.jpg` | Same view, HE. Full RTL mirror: rail on the **right**, panel on the **left**, composer controls flipped, Hebrew serif hero. |
| `app-composer-snip-gemini-en.jpg` | **Authenticated** session (founder's Chrome). Real 31-page PDF in the Report pane, snip chip in the sent message, and Gemini's answer read off the image pixels. This is the shot where the scissors is **enabled and used**. |
| `app-live-buffering-en.jpg` | `/app/live/live` against a **running replay engine**: countdown ring (circular, dark ink on the light Harvey frame), "EST. LIVE IN", LIVE dot, Hebrew title, "Enter live now". Overlay sits flush under the header. |
| `app-live-playing-en.jpg` | Same call after joining: live karaoke transcript, "-0:42 behind the sourced Investor Call" chip, LIVE · karaoke label, floating tab row, black docked player with the red LIVE progress. |
| `app-workspace-en.jpg` | Workspace page — H1 now Newsreader like every other page headline. |
| `app-company-en.jpg` | Tigbur company page, "FROM THE CALL" module — neutral gray wash, no beige. |

## BLOCKER — false evidence citation

`2026-07-25-harvey-verification.md:31` claimed the Ask Atlas panel was visible in
`app-call-multi-en.jpg`. It was not: that shot has the panel closed. The claim is **corrected in
place** (the original line stays, with a dated CORRECTION block beneath it) and the panel now has
real evidence in both locales, captured through the panel's own open button.

Measured at capture time (`probe/ask-panel-capture.json`), identical in both locales:

- panel width **347px** — matches the design probe exactly
- `dir` = `ltr` (EN) / `rtl` (HE)
- composer buttons present: Snip to chat · Voice ask — coming soon · send
- console errors: **0**

## The 7 WARNINGs

| # | Finding | Fix |
|---|---|---|
| 1 | Agents page restyled under a scope lock | **KEPT** — founder decision 2026-07-31 relaxed the lock for colour-only changes to stub pages. Declared here rather than left silent. |
| 2 | Workspace H1 stranded on `font-head` | → `font-display` (Newsreader), weight matched to the other headlines. Verified computed: `Newsreader, Georgia, serif` / 500 / 34px. |
| 3 | Live overlay `top-[63px]` vs header `h-[58px]` | → `top-[58px]`, with a comment tying the two numbers together. **Measured on a running engine: header bottom 58, overlay top 58, gap 0** (`probe/live-engine-pass.json` → `overlayGeometry_CORRECTED`). |
| 4 | Warm gradient `rgba(242,238,230,.5)` survived the sweep | → `rgba(244,244,244,.5)`, the value the design's **own** translation table maps `#F2EEE6` to (`Atlas MVP.dc.html` line 154). Missed originally because it is an `rgba()` literal, not a hex. Verified: zero warm-literal gradients left on the page. |
| 5 | 8 inverted `call-*` Tailwind aliases under a comment making two false claims | **Aliases deleted.** Confirmed zero usages of every `bg-/text-/border-/ring-/…-call-*` utility form across `src/`; the ~131 real call-* sites are plain `globals.css` classes off the `:root --call-*` vars. Replacement comment states that. |
| 6 | `snipBridge` doc + test comment + evidence describe a hide-when-unavailable contract the code no longer implements | Words aligned to the shipped always-render + disabled behaviour in all three places, each explaining **why** it still satisfies the visible-degradation law. |
| 7 | `railText` #6B6862 = 3.6:1 on the rail, under AA | → **`#85817A`**, per founder decision. Verified by real luminance computation, not by eye. |

### railText — the one deliberate deviation from the import

`probe/rail-contrast.json`, WCAG 2.1 relative-luminance math against the `#0A0A0A` rail:

| hex | ratio | AA 4.5:1 | |
|---|---|---|---|
| `#A6A29A` | 7.784:1 | pass | pre-round-2 value on main |
| `#6B6862` | 3.565:1 | **fail** | the design import as probed — the WARNING |
| `#7C7C7C` | 4.743:1 | pass | bare minimum named by the founder |
| **`#85817A`** | **5.108:1** | **pass** | **shipped** — keeps the design's warm hue |

Live confirmation: rail items compute to `rgb(133, 129, 122)` = `#85817A`; the active item stays
white. **This is a deliberate deviation from the design — a future parity probe must not "fix"
it back to #6B6862.** Recorded at the token, in the probe file, and here.

## The 6 NITs

- `enabled:hover:call-ink` generated nothing (`call-ink` is a globals.css class, not a Tailwind
  utility) → `enabled:hover:text-ink`; both resolve to `#0A0A0A`, so the intended colour is
  unchanged and the hover now actually fires.
- `PaneCard` inline hex/radius → new `tokens.harvey.floatLine` + `border-float-line` /
  `rounded-win` / `bg-canvas`. No ad-hoc values left in that component.
- `FacetPanes` effect deps `[doc, onSnip]` re-ran every parent render (unmemoized `onSnip`) →
  depends on the derived `snippable` boolean, so the store only sees real transitions.
- Orphaned `ThemeIcon` export removed.
- Indentation of the `doc ?` ternary block repaired.
- Mic button **KEPT** as a deliberate placeholder (founder decision), and the composer's 3-vs-4
  button deviation from the probe is now stated rather than absent.

## The two carried residuals — both closed

**1. Gemini round-trip from a composer-originated snip.** Done end to end in the founder's
authenticated Chrome, driving the **composer** scissors (the new round-2 entry point, not the
Report-pane one): armed → drag-crop over the page-1 Hebrew heading → chip with `p. 1` badge →
typed into the composer (`document.activeElement` confirmed to be the textarea **before**
typing — last session's failure was typing into `<body>`) → clicked send. Gemini answered:

> The attached image is the "דוח הדירקטוריון על ענייני התאגיד" (Board of Directors' Report on
> Corporate Affairs) and it covers the period of three months ending on March 31, 2026. (Page 1)

Read off the image pixels, with the call citation chip attached. Console clean.
*Not re-checked:* the `x-chat-fallback` response header (whether Gemini or the GPT-4.1 fallback
served it) — the answer is image-derived either way, but the header check from the feat/pinge
evidence was not repeated.

**2. Live-engine surfaces.** Replay engine claimed and run on :8788 (claim + release both
appended to cross-cutting). Buffering gate → countdown ring → join → live karaoke → docked LIVE
player, all seen against a running engine, **zero console errors**. Port released.

## Battery

- `npm test` — **108/108**
- `npx tsc --noEmit` — clean
- `npm run build` — see the commit's ship run (dev server stopped first; build under a live dev
  server clobbers `.next`)

## Honest residue

- The two **pre-existing** dead `hover:call-ink` sites in `FacetPanes` (SlidesPane nav buttons)
  are untouched. The reviewer scoped its NIT to the new composer site, and this branch is under a
  scope lock; flagging rather than silently widening.
- `app-ask-panel-*.jpg` are unauthenticated, so they show the scissors **disabled**. The enabled
  path lives in `app-composer-snip-gemini-en.jpg`. Neither image is cited for the other's state.
- Stub-fed company extras and the hardcoded Home "Q2 2026" quarter tag remain — pre-existing
  FINDINGs from 2026-07-14, not this branch's scope.
