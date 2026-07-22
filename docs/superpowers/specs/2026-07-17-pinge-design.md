# Pinge — snip-to-chat (design spec, 2026-07-17)

Founder-brainstormed 2026-07-17 (item 10 of the round-3 note, promoted to its own feature).
"Pinge" is our internal codename — the UI shows only a scissors icon with an i18n tooltip.

## Why

Financial tables in quarterly/annual reports are the heart of the product's documents, and
text-selecting them is miserable (multi-column cells interleave; digits fragment — known
spike finding). Pinge lets the user capture a table **as pixels** — click the scissors,
drag a rectangle like a screenshot tool — and ask Atlas about it. The model receives the
actual image (Gemini 3.5 Flash and the GPT-4.1 fallback are both multimodal), so the
numbers it reasons about are exactly the numbers on the page.

Future (explicitly out of scope now): exporting snipped tables to Excel; Slides-pane snips
(the tool is designed as a *document-pane* tool so Slides can adopt it when slides become
real); persistent chat history with images.

## UX

### Snipping
- A **scissors icon button** joins the Report pane header cluster (beside page nav + zoom).
  i18n tooltip (en "Snip to chat" / he "גזירה לצ'אט" — final copy in dict).
- Click → snip mode: a translucent veil dims the PDF, cursor becomes crosshair.
  Esc, clicking the scissors again, or a click without a drag exits cleanly.
- Click-drag draws the classic clear-window rectangle in the veil. Release:
  - **Chat closed** → floating "Ask Atlas" button beside the rectangle (same visual family
    as the transcript marking toolbar). Click → chat opens with the snip attached.
  - **Chat open** → the snip lands in the composer automatically (founder decision).
  - Either way snip mode ends (one snip per arming; re-click for another).
- A drag smaller than ~8px in either dimension is treated as an accidental click → cancel.
- The rectangle is clipped to the page under the drag start (a snip belongs to one page).

### Composer chips
- Each snip = a thumbnail chip above the chat input: small preview of the captured pixels,
  page label ("עמ' 12" / "p. 12"), and ✕ to remove.
- Up to **4 snips** stack (founder decision — the compare-two-tables move). A 5th snip
  shows a toast ("עד 4 גזירים בשאלה") and is dropped.
- Send works with or without typed text. The sent message renders the thumbnails above the
  user's text in the history, so "what Atlas saw" stays visible.
- Snips live in client memory only (chat history is not persisted today). Follow-up turns
  re-send history as text; the model's answer carries the numbers forward.

### Marking-UX unification (part of this feature, founder's original note)
One rule across transcript text, PDF text, and snips, in BOTH finished and live views:
- **Chat closed:** mark/snip → floating "Ask Atlas" button → click opens chat seeded.
- **Chat open:** mark/snip → reference lands in the composer automatically.
Today's PDF-text behavior (auto-opens chat immediately) changes to match. The live view —
which currently renders the PDF but wires no selection at all — gains both text marking
and Pinge (full parity, founder decision).

## Capture mechanics (approach 1 — offscreen high-res re-render)

- The drag rectangle is recorded in screen px relative to the page element, then divided
  by the page's rendered scale → **PDF page coordinates** (zoom-proof identity:
  `{page, pdfRect}`).
- On release, pdf.js re-renders **just that page** to an offscreen canvas at a fixed high
  scale (target ≈2.0, adjusted so the *cropped* region's long side ≤ 1600px), the rect is
  cropped, and encoded `image/png` data URL. Crisp digits regardless of on-screen zoom.
- Chip payload: `{dataUrl, page, documentId}`. The existing PdfViewer `doc` handle is
  reused — no second download, no server round trip.

## Data flow / API

- `ChatRequest` (lib/api/chat.ts) gains
  `attachments?: { dataUrl: string; page: number; documentId: string }[]` (≤4).
- `/api/chat` (server):
  - Validates attachments: max 4, `data:image/png;base64,` prefix, ≤ ~2MB base64 each.
  - **Auth gate identical to documentRef**: no authenticated user → attachments stripped
    (same policy + same launch-notes flag as document grounding).
  - Looks up the document (title/quarter/company) and builds one Hebrew caption per snip:
    "תצלום מעמוד 12 של <doc title>" — so answers cite pages like marked passages do.
  - **Gemini**: each snip becomes `inline_data` (image/png base64) + caption text part,
    placed before the user text. **GPT-4.1 fallback**: `image_url` data-URL content parts.
  - The snipped pages also ride the existing `documentRef` page-text grounding —
    image = authority on numbers, page prose = surrounding context.
- Provider-specific formatting stays entirely inside the route (Claude-swap-friendly —
  verified against the Claude API reference: base64 PNG content blocks, all current
  models; a future engine swap touches one adapter function).

## Error handling

- Offscreen render failure → toast, snip mode exits, no chip.
- Oversized capture → downscaled client-side before attach, never rejected.
- Unauthenticated → attachments stripped server-side (documented gap, same as docRef).
- Gemini outage → fallback receives the same images; snips survive failover.

## Architecture / future-instrumentation note

All interaction paths stay **centralized and named** (transcript selection handler, PDF
selection handler, snip handler, chat seed function). These are the future instrumentation
points for the context-intelligence layer (record listens/marks/copies/snips per call) and
the Workspace feature — one `recordEvent()` line each when that chapter starts. Nothing is
built for it now; the shape is just kept clean on purpose.

## Testing

- Unit: screen→page rect normalization across zoom levels · attachment validation
  (count/size/prefix) · caption builder · chip stacking cap. New test files are added to
  package.json's explicit "test" list (repo gotcha).
- Eyes-on (/verify-app, :3003, real Tigbur Q1-2026 call): the snip overlay uses ordinary
  pointer events, so Chrome MCP CAN drive a real drag end-to-end (unlike native text
  selection) — snip → chip → send → streamed grounded answer, both themes, console clean.
  Founder look reserved for feel/polish.
