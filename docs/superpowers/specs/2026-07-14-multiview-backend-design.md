# Multiview Backend — Design (M1: Report pane, end to end)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md
> (M1 = Report pane, shipped 2026-07-17 @ 2c2b464. The Slides fast-follow on the same engine remains future work.)

**Date:** 2026-07-14 · **Lane:** M (multiview-backend, branch `feat/multiview-backend`) ·
**Status:** founder-approved (brainstorm 2026-07-14, all 5 sections)

## Goal

A user opens a finished call, switches to Multi view, and the Report pane shows the company's
real quarterly report PDF — scrollable, real pages. They mark text inside the PDF and Ask
Atlas about it; the answer is grounded on the marked passage, the page it sits on, and the
call transcript. Exactly the UX the transcript already has (selection → chat reference →
`/api/chat`), extended to documents.

**M1 scope (founder decision):** Report pane only. Slides pane reuses the same engine as a
fast follow — no slides work in M1 beyond keeping the stub intact.

## Day-one spike verdict (context)

Hebrew extraction from the fixture (`local-assets/demo-report.pdf`, Tigbur Q1-2026, 31pp,
Aspose.PDF producer) is **QUIRKS — workable, no fallback needed**. pdf.js `getTextContent()`
yields Hebrew in correct logical order at word level. Quirks to handle in the extraction
module: (1) occasional within-line segment swaps — fixed by y-grouping + descending-x RTL
sort; (2) digit fragmentation ("30" → "3 0", "% 50") and hyphenated reference numbers need
punctuation-neutral LTR-run handling; (3) table pages interleave cells per line — accepted
for M1 (marked passage itself is always sent verbatim; only page context is noisy on tables).

## Founder decisions (filed to cross-cutting 2026-07-14)

1. M1 = Report pane only.
2. Ingest = CLI script (its core becomes the function MAYA auto-fetch calls at Core 2).
3. Chat grounding = marked passage + its page(s) + transcript context.
4. Documents attach to **company + quarter**, not to a call. The call view resolves documents
   by its own company+quarter.
5. Architecture = "extract once, store everything" (Approach 1).

## Data model & storage

Additive-only migration `supabase/migrations/20260714_012_company_documents.sql`, appended to
`agent-memory/cross-cutting.md` before applying. The shared DB has a legacy empty foreign
`documents` table (cross-cutting 2026-07-03) — we do not touch it; hence the names below.

- **`company_documents`** — id uuid PK · company_id FK → companies · quarter text ·
  doc_type text (`'report'` now; `'slides'` later) · title text · source text (`'manual'`
  now; `'maya'` later) · storage_path text · page_count int · lang text default `'he'` ·
  created_at/updated_at. Unique on (company_id, quarter, doc_type).
- **`document_pages`** — id uuid PK · document_id FK → company_documents (cascade) ·
  page_no int · text text. Unique on (document_id, page_no).
- **RLS on both:** authenticated users read; writes via service role only.
- **Storage:** private bucket `company-documents`; path
  `{company_id}/{quarter}/{doc_type}.pdf`. Never public — files are served through an
  auth-gated app route.

**Mission-5 design hook:** all document reads go through `src/lib/documents/index.ts`:
`getDocumentsFor(companyId, quarter)`, `getDocumentMeta(id)`, `getPageText(id, pages)`.
The future `company_knowledge` layer slots in behind this same interface (and the chat
context builder below) — interface now, implementation at Mission 5.

## Extraction module

`src/lib/documents/extract.ts` — pure function: PDF bytes → `{ pageCount, pages: string[] }`.
Uses `pdfjs-dist/legacy/build/pdf.mjs` (5.4.296, transitive dep of pdf-parse). Algorithm
(spike-verified): group items into lines by rounded `transform[5]` (y); lines sorted by
descending y; within a line, items sorted by descending x (RTL) with consecutive LTR items
(digits/Latin, punctuation-neutral so `2026-01-029201` stays intact) kept as ascending-x
runs; small-gap digit fragments joined.

Unit tests from the spike's real quirk cases: the swapped "לשנה" line, split digits,
hyphenated reference numbers, a normal prose line, an empty page.

## Ingest script

`scripts/ingest-document.ts` (tsx), thin CLI over `src/lib/documents/ingest.ts`:
`--file <pdf> --company <id|name> --quarter "Q1 2026" --type report [--title ...]`.
Uploads to Storage → extracts all pages → upserts `company_documents` + replaces
`document_pages` in that order (DB rows land only after upload + extraction succeed).
Idempotent: re-run on the same (company, quarter, type) replaces cleanly — algorithm
improvements = one re-ingest command. M1 seeds the Tigbur demo report for the demo call's
company+quarter.

## API routes (auth-gated, like all API routes)

- `GET /api/documents?companyId&quarter` → document metadata list (no page text).
- `GET /api/documents/[id]/file` → streams the PDF from the private bucket.

## Viewer (Report pane)

- `ReportPane` gains data: if a `report` document exists for the call's company+quarter →
  render `PdfViewer`; else → today's stub card (typed stub interface stays; nothing else in
  the app changes).
- `PdfViewer` (client component, dynamic import of pdfjs-dist + worker wired into the Next
  build): vertical scroll of real pages; each page = canvas + pdf.js **TextLayer**
  (transparent, selectable, positioned by pdf.js — its standard bidi machinery); lazy render
  via IntersectionObserver (31pp must not choke the pane); fit-to-pane-width, re-fit
  (debounced) on gutter drag; pages stay white in both themes (documents look like paper);
  page wrappers tagged `data-page="N"`; container inside the existing `data-ask` scope so
  selection gets the Ask-Atlas yellow.

## Selection → Ask Atlas

- Same `onMouseUp` pattern as the transcript: capture selection text + page number(s) from
  the `data-page` ancestors of the selection range.
- Seeds the existing `TranscriptChatPanel` reference block (panel open → highlight drops in).
  Reference labeled as report + page number, distinguishing report quotes from call quotes.
- Chat request gains optional `documentRef: { documentId, pages: number[] }`. Server pulls
  those pages' stored text and builds the prompt with two labeled blocks — REPORT PAGES +
  TRANSCRIPT — and a system-prompt line telling Atlas to connect report and call. Lands as an
  extension of `getChatContext` (`src/lib/chat/context.ts`), the Mission-5 doorway.
- Degraded path: page text missing → answer proceeds on passage + transcript alone.

## Error handling

- No document → stub card (unchanged behavior).
- PDF load/render failure → quiet error card in the pane with retry; call view unaffected.
- Ingest failures → loud CLI errors; no half-written state.

## Testing & verification

- Unit: extraction quirk cases · chat-context builder (document block present/absent, page
  bounds, degraded path) · selection→page mapping.
- Battery before any commit: `npm test` · `npx tsc --noEmit` · `npm run build`.
- `/verify-app` via Chrome MCP on :3003 — actually select text in the rendered PDF in the
  REAL call view's Multi mode, trigger Ask Atlas, confirm the streamed answer references the
  marked passage; both themes; RTL intact. Evidence → `docs/evidence/feat-multiview-backend/`
  in the main checkout. Ship via `/ship` → ready queue; lane never pushes main.

## Build order (each step independently testable)

1. Migration + tables (cross-cutting append → apply).
2. Extraction module + unit tests.
3. Ingest lib + CLI; seed the demo report.
4. API routes (list + file stream).
5. PdfViewer rendering in ReportPane (stub fallback intact).
6. Selection capture + chat panel seeding.
7. Chat grounding (`documentRef` → context blocks).
8. `/verify-app` end-to-end + evidence → `/ship`.

## Known constraints / open items

- Supabase MCP in this worktree session is **Unauthorized** (missing access token) — needed
  at step 1 to apply the migration (or founder applies token; flagged to supervisor if it
  blocks).
- Table-heavy pages give noisy page context (accepted M1 limitation; revisit if it bites).
- Slides pane, MAYA auto-fetch, admin upload UI, company-page document shelf: explicitly out
  of M1 scope.
