# Design Round 2 — founder big reveal + pre-ship verification (2026-07-31)

Branch `feat/design-round-2` · lane F · port 3001 · verified in the founder's logged-in Chrome
session via Chrome MCP.

## Founder verdict — PASSED

The one-big-reveal gate (decision 2026-07-25, item 5) is cleared. Founder reviewed the full
Harvey restyle live on :3001: *"okay things look great"* → *"everything is good. can we merge
it to main?"*. Filed as a DECISION line in `agent-memory/cross-cutting.md` (2026-07-31).

## What I verified this session (my own eyes)

| Surface | Result |
|---|---|
| `/app/home` | Harvey light shell, black rail, Newsreader serif headline, TASE search field. Clean. |
| `/app/live/PyuMxe88e8g_live` (real Tigbur Q1 call) | Light call view; only rail + docked player stay dark. Floating tab row, Single/Multi pills, RTL transcript correct. |
| Report pane (real 31-page Tigbur PDF) | Renders paper-white, page 1/31, Hebrew heading RTL-correct. |
| **Ask Atlas composer scissors (NEW round-2 entry point)** | Armed from the composer → drag-rect on the real PDF → **thumbnail chip appeared in the composer with the `p. 1` page badge and a remove ×**. Both scissors entry points present (`Snip to chat` ×2: Report-pane toolbar + composer) per decision 2026-07-25 item 4. |
| Composer affordances | Scissors always visible + mic ("Voice ask — coming soon") + per-context caption "Atlas is connected to this call's context" — the three founder round-2 notes, live. |
| Console | Zero errors/warnings on home and the call view (React DevTools info only). |

Battery after merging `origin/main` into the branch: **108/108 tests · `tsc --noEmit` clean ·
`npm run build` green.**

## Two findings that are NOT product bugs (recorded so they aren't re-investigated)

1. **Blinking text caret in transcript text = Chrome Caret Browsing (F7)**, not our markup.
   Probed the live DOM: `main` contains **0** `contenteditable` nodes, **0** inputs/textareas,
   `-webkit-user-modify: read-only`, `document.designMode: off`. Nothing in the call view can
   hold a caret. Founder-facing fix is the F7 toggle in his browser; no code change made.

2. **"PDF blown up / heading clipped when the Ask Atlas panel opens" was a hidden-tab
   artifact, not a regression.** In a backgrounded automation tab the pdf.js re-render stalls:
   the canvas kept its pre-narrowing width (1342px CSS inside a 985px pane) across a probe
   loop sampling every 2s for 10s, and one transient read showed `--scale-factor: 3.17`
   (~2× correct). Foregrounding the tab (screenshot) let the pending re-render land — the
   page then measured 985px wide, `--scale-factor 1.65`, heading complete, 32px of slack
   inside the pane. This is the documented trap in `/verify-app` ("hidden/never-visible
   windows lie") re-encountered from a new angle: it hits **layout re-fit**, not just text
   layers. Static evidence agrees: `captureSnip` renders fully offscreen (own canvases, never
   touches live DOM or `--scale-factor`), and this branch does not modify `PdfViewer.tsx` or
   `snip.ts` at all (`git diff origin/main...HEAD --stat` on those paths = empty).

## Residual — NOT verified, carried to the queue

- **Gemini round-trip with a composer-originated snip was not re-sent this session.** The chip
  renders and the crop is real; the send path itself is unchanged code already verified in
  feat/pinge (evidence 2026-07-17). My send attempt typed into `<body>` instead of the
  composer (a driving mistake of mine, not an app defect) and was abandoned.
- **Live-engine surfaces** (`LiveBroadcastView`, countdown ring) got the same mechanical
  Harvey color changes but were never seen against a running engine — typecheck + build only.
  Needs a replay-engine pass on :8788 (single-owner port, must be claimed) before the live
  feature is exercised for real.
