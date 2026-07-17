# Multiview — founder round 2 (marking polish · breathing room · zoom)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

**Date:** 2026-07-16 · **Lane:** M (`feat/multiview-backend`) · **Status:** founder-approved
("you can explore the code, write a plan, execute this plan and verify yourself")

Founder asks (screenshot: `Atlas Design Project/PDF Transcript view bigger/...png`):

## Task 1 — PDF marking must look native (CSS only)

Root cause found: `[data-ask] ::selection { background:#FCE44D; color:#1C1B19 }`
(globals.css:76) — inside the PDF this paints the *invisible overlay glyphs* in dark ink,
so a second, slightly-off copy of every word appears over the printed page = "buggy".

Fix in `globals.css`, declared after the data-ask rules:

```css
/* PDF pages: selection must read like a highlighter over the PRINTED text — the overlay
   glyphs stay invisible even while selected (else a second copy of each word appears),
   and the wash is translucent so the canvas text shows through. */
[data-ask] .pdftext ::selection { background: rgba(252, 228, 77, 0.45); color: transparent; }
[data-ask] .pdftext ::-moz-selection { background: rgba(252, 228, 77, 0.45); color: transparent; }
```

Verify: select in the PDF — a translucent yellow wash over unchanged printed words, both themes.

## Task 2 — remove the sub-toolbar strip; relocate its controls (breathing room)

Per the founder's screenshot: the strip between the chips row and the panes
(LiveTranscriptView.tsx ~535-599: copy · sparkle · pencil · search input) is deleted;
panes rise to sit directly under the chips row.

The controls move INTO the chips row's right cluster (before the play/clock button):
- Copy, Sparkle (open chat), Pencil (when `canEdit`, with `editMode` hint) — same
  `IconButton`s, size 26-28 to fit the row.
- Search becomes an ICON that toggles an inline input (`searchOpen` state): icon click →
  input (w-40) + the existing count/‹/› appear inline; toggling off clears `query`.
- All existing handlers/state (copyAll, setChat, setEditMode, query/matchPos) reused.

NOT in scope: collapsing the app NavRail (founder's confirmation read as ambiguous —
offered as a follow-up question instead).

## Task 3 — zoom control in the Report pane (Chrome-style)

- Zoom state lives in `ReportPane` (FacetPanes.tsx); steps `[75, 90, 100, 110, 125, 150,
  175, 200]`, default 100.
- `PaneHeader right` gains, when a doc exists: `[−] [100%] [+]` (font-mono-num, dir ltr,
  % label click = reset to 100) next to the doc title.
- `PdfViewer` accepts `zoom?: number` (default 100): page width = `hostWidth * zoom/100`;
  page wrappers get explicit px width (host `w-fit min-w-full`), the pane's existing
  `overflow-auto` provides horizontal scroll when zoomed past the pane.

## Verify (eyes-on, tab FOREGROUND — pdf.js stalls in hidden tabs)

Battery (tsc · 86/86 · build) + Chrome MCP on :3003 `/app/live/2gXp90F8s6w` Multi:
strip gone, panes taller, icons live in the chips row, search expands/collapses, PDF
marking = translucent wash over unchanged text (both themes), zoom −/+/reset with
h-scroll at >100%, selection→Ask Atlas e2e still grounded. Then commit, push,
ready-queue addendum, board/state.
