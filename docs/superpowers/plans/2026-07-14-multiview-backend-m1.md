# Multiview Backend M1 (Report pane end-to-end) Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real quarterly-report PDF renders inside the call view's Report facet pane with selectable text; marking a passage and asking Atlas answers grounded on the passage + its page + the transcript.

**Architecture:** Extract-once-store-everything (founder-approved spec
`docs/superpowers/specs/2026-07-14-multiview-backend-design.md`): ingest CLI uploads the PDF
to a private Supabase Storage bucket and persists per-page text to two new additive tables;
auth-gated API routes list/stream documents; a client-side pdf.js viewer with TextLayer
renders inside ReportPane (stub card stays as fallback); selection seeds the existing
TranscriptChatPanel and `/api/chat` grounds on stored page text + transcript.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase (Postgres + Storage) ·
pdfjs-dist 5.4.296 (transitive dep of pdf-parse — do NOT add it to package.json) · tsx ·
node:test.

## Global Constraints

- **DB is SHARED with production Timlul.** Additive-only SQL. The migration must be appended
  to `C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md` BEFORE applying. A legacy
  empty foreign table named `documents` exists — never touch it; our tables are
  `company_documents` / `document_pages`.
- **Session gates known at plan time:** cross-cutting.md appends are permission-DENIED in
  this session (3 attempts) and Supabase MCP is Unauthorized. Task 6 (apply+seed) therefore
  STOPS and asks the founder if still blocked — do not work around; everything else builds
  and tests without the live DB.
- New test files MUST be added to the explicit file list in `package.json`'s `"test"` script
  (runner: `node --import tsx --test <files...>`).
- `npx tsc --noEmit` and `npm test` green before every commit; `npm run build` before ship.
- Dev server: port 3003 only (`npm run dev -- -p 3003`). Hard-refresh after dev restarts
  (stale-bundle gotcha); MODULE_NOT_FOUND 500 → kill dev, `rm -rf .next`, restart.
- RTL discipline: Hebrew `dir="rtl"`; numbers `font-mono-num` + `dir="ltr"` where applicable.
- Never push main. Ship via `/ship` → ready queue.
- Demo seed reality: the demo call resolves company by ticker `1105022` (תיגבור) with quarter
  string `Q2 2026`; the Tigbur PDF is actually Q1-2026 but MUST be seeded as `Q2 2026` to
  appear on the demo call (demo data; title says Q1).

---

### Task 1: Migration SQL file

**Files:**
- Create: `supabase/migrations/20260714_012_company_documents.sql`

**Interfaces:**
- Produces: tables `public.company_documents` (unique `(company_id, quarter, doc_type)`),
  `public.document_pages` (unique `(document_id, page_no)`); Task 3 writes them, Tasks 4/5 read.

- [ ] **Step 1: Write the migration file** (style mirrors `20260614_010_quote_folders.sql`)

```sql
-- Multi-view backend M1 (Lane M): real documents behind the Report/Slides facet panes.
-- company_documents = one row per company+quarter+type document (PDF in the private
-- 'company-documents' Storage bucket); document_pages = per-page extracted text (the chat
-- grounding + future Mission-5 company_knowledge feedstock). Additive only; the legacy
-- foreign 'documents' table (empty, old repo) is deliberately untouched.

create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quarter text not null,
  doc_type text not null default 'report',
  title text not null,
  source text not null default 'manual',
  storage_path text not null,
  page_count int not null,
  lang text not null default 'he',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, quarter, doc_type)
);
create index if not exists company_documents_company_quarter_idx
  on public.company_documents(company_id, quarter);

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.company_documents(id) on delete cascade,
  page_no int not null,
  text text not null,
  unique (document_id, page_no)
);
create index if not exists document_pages_document_idx on public.document_pages(document_id);

alter table public.company_documents enable row level security;
alter table public.document_pages enable row level security;

-- Signed-in users read; writes only via service role (which bypasses RLS).
drop policy if exists company_documents_read on public.company_documents;
create policy company_documents_read on public.company_documents
  for select to authenticated using (true);
drop policy if exists document_pages_read on public.document_pages;
create policy document_pages_read on public.document_pages
  for select to authenticated using (true);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260714_012_company_documents.sql
git commit -m "feat(db): company_documents + document_pages migration (additive, RLS read-only)"
```

(Applying happens in Task 6, after the cross-cutting append gate.)

---

### Task 2: Extraction module + unit tests

**Files:**
- Create: `src/lib/documents/extract.ts`
- Test: `src/lib/documents/extract.test.ts`
- Modify: `package.json` (append test file to the `"test"` script list)

**Interfaces:**
- Produces:
  `reassemblePage(items: TextItem[]): string` where `TextItem = { str: string; x: number; y: number }`
  (pure, unit-tested) and
  `extractPdfPages(data: Uint8Array): Promise<{ pageCount: number; pages: string[] }>`
  (pdfjs wrapper; Task 3 consumes it in the ingest lib — NEVER import extract.ts from
  Next server code, only from scripts, so pdfjs stays out of the server bundle).

- [ ] **Step 1: Write the failing tests** — real quirk cases from the 2026-07-14 spike:

```ts
// src/lib/documents/extract.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reassemblePage } from './extract'

// Spike case 1 (demo-report.pdf p1, y=152): stream order emitted "שהסתיימה ביום" before
// "לשנה" although לשנה (x=476) reads FIRST in RTL. Descending-x must fix it.
test('within-line RTL swap is fixed by descending-x order', () => {
  const items = [
    { str: 'שהסתיימה ביום', x: 382, y: 152 },
    { str: 'לשנה', x: 476, y: 152 },
    { str: '31', x: 361, y: 152 },
    { str: 'בדצמבר', x: 313, y: 152 },
    { str: '2025', x: 278, y: 152 },
  ]
  assert.equal(reassemblePage(items), 'לשנה שהסתיימה ביום 31 בדצמבר 2025')
})

// Spike case 2 (p1, y=122): digits render LTR — "3"(x=492) then "0"(x=499) must stay "3 0"
// (ascending x), not flip to "0 3" under the RTL sort.
test('LTR digit runs keep ascending-x order inside an RTL line', () => {
  const items = [
    { str: '3', x: 492, y: 122 },
    { str: '0', x: 499, y: 122 },
    { str: 'במרץ', x: 461, y: 122 },
    { str: '2026', x: 431, y: 122 },
  ]
  assert.equal(reassemblePage(items), '3 0 במרץ 2026')
})

// Spike case 3: "-" between digit groups must NOT break the LTR run — the reference number
// 2026-01-029201 reads left-to-right as a whole (naive run-breaking reversed it).
test('hyphenated reference numbers stay in LTR order', () => {
  const items = [
    { str: '(מס\' אסמכתא:', x: 353, y: 122 },
    { str: '2026', x: 265, y: 122 },
    { str: '-', x: 291, y: 122 },
    { str: '01', x: 295, y: 122 },
    { str: '-', x: 308, y: 122 },
    { str: '029201', x: 312, y: 122 },
    { str: ')', x: 261, y: 122 },
  ]
  assert.equal(reassemblePage(items), '(מס\' אסמכתא: 2026 - 01 - 029201 )')
})

test('lines order top-to-bottom (PDF y grows upward)', () => {
  const items = [
    { str: 'שורה תחתונה', x: 400, y: 100 },
    { str: 'שורה עליונה', x: 400, y: 700 },
  ]
  assert.equal(reassemblePage(items), 'שורה עליונה\nשורה תחתונה')
})

test('empty page yields empty string', () => {
  assert.equal(reassemblePage([]), '')
})

test('near-y items group into one line (rounding jitter)', () => {
  const items = [
    { str: 'מילה', x: 450, y: 152.4 },
    { str: 'שנייה', x: 400, y: 151.8 },
  ]
  assert.equal(reassemblePage(items), 'מילה שנייה')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test src/lib/documents/extract.test.ts`
Expected: FAIL — `Cannot find module './extract'`

- [ ] **Step 3: Implement**

```ts
// src/lib/documents/extract.ts
// Per-page Hebrew text extraction (spike-verified 2026-07-14, docs/superpowers/specs/
// 2026-07-14-multiview-backend-design.md). pdf.js getTextContent gives logically-ordered
// Hebrew strings per item; only the WITHIN-LINE item order needs geometric repair.
// IMPORTANT: import this module only from scripts (tsx) — never from Next server code —
// so pdfjs-dist stays out of the server bundle.

export interface TextItem {
  str: string
  x: number
  y: number
}

const HEB = /[֐-׿]/
// LTR run members: digit/Latin tokens AND joiner punctuation between them ("-", "/", ".")
// — a naive run break on "-" reversed reference numbers like 2026-01-029201 in the spike.
const LTRISH = /^[0-9A-Za-z]/
const JOINER = /^[-–—/.,:%()]+$/

/** Rebuild one page's reading order: group items into lines by y (±2pt jitter),
 *  lines top-to-bottom, items right-to-left with LTR runs kept left-to-right. */
export function reassemblePage(items: TextItem[]): string {
  const kept = items.filter((i) => i.str.trim().length > 0)
  if (kept.length === 0) return ''
  // group by y with jitter tolerance: sort by y desc, start a new line when the gap > 2
  const sorted = [...kept].sort((a, b) => b.y - a.y)
  const lines: TextItem[][] = []
  for (const it of sorted) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(line[0].y - it.y) <= 2) line.push(it)
    else lines.push([it])
  }
  return lines.map(lineToText).join('\n')
}

function lineToText(line: TextItem[]): string {
  const rtl = [...line].sort((a, b) => b.x - a.x) // visual RTL: rightmost first
  const out: TextItem[] = []
  let run: TextItem[] = []
  const isRunMember = (it: TextItem, currentRun: TextItem[]) =>
    !HEB.test(it.str) && (LTRISH.test(it.str.trim()) || (currentRun.length > 0 && JOINER.test(it.str.trim())))
  const flush = () => {
    if (run.length) {
      out.push(...run.reverse()) // run collected right-to-left → reverse back to LTR
      run = []
    }
  }
  for (const it of rtl) {
    if (isRunMember(it, run)) run.push(it)
    else {
      flush()
      out.push(it)
    }
  }
  flush()
  return out
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Full-PDF extraction for the ingest script. Dynamic import keeps pdfjs out of any
 *  accidental server-bundle path. */
export async function extractPdfPages(data: Uint8Array): Promise<{ pageCount: number; pages: string[] }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({ data, useSystemFonts: true }).promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items: TextItem[] = []
    for (const it of tc.items) {
      if ('str' in it) items.push({ str: it.str, x: it.transform[4], y: it.transform[5] })
    }
    pages.push(reassemblePage(items))
  }
  await doc.destroy()
  return { pageCount: pages.length, pages }
}
```

Note for the implementer: pdfjs-dist 5.x ships its own types; if `tc.items` narrows poorly,
type the loop variable as `{ str?: string; transform: number[] }`.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --import tsx --test src/lib/documents/extract.test.ts`
Expected: 6 pass. NOTE: the hyphen-run test expects `2026 - 01 - 029201` (segments in LTR
order, spaces preserved between items) — if the implementation joins differently, fix the
IMPLEMENTATION, not the expectation direction (segment ORDER is the contract; exact spacing
may be adjusted in both test+impl together if needed).

- [ ] **Step 5: Add to the package.json test list** — append
  ` src/lib/documents/extract.test.ts` inside the `"test"` script string (single line, before
  the closing quote).

- [ ] **Step 6: Full battery + commit**

Run: `npm test` (all suites incl. new one) and `npx tsc --noEmit`
Expected: all pass, tsc silent.

```bash
git add src/lib/documents/extract.ts src/lib/documents/extract.test.ts package.json
git commit -m "feat(documents): Hebrew-safe per-page PDF text extraction (spike algorithm + quirk-case tests)"
```

---

### Task 3: Documents read interface + ingest lib + CLI

**Files:**
- Create: `src/lib/documents/index.ts` (server-safe reads — the Mission-5 interface)
- Create: `src/lib/documents/ingest.ts` (script-only: upload + extract + persist)
- Create: `scripts/ingest-document.ts` (CLI wrapper, run via `npx tsx`)

**Interfaces:**
- Consumes: `extractPdfPages` (Task 2), `supabaseAdmin` (`@/lib/supabase`), tables (Task 1).
- Produces (Task 4/5 rely on these exact signatures, all in `src/lib/documents/index.ts`):

```ts
export interface CompanyDocument {
  id: string
  companyId: string
  quarter: string
  docType: string
  title: string
  storagePath: string
  pageCount: number
  lang: string
}
export async function getDocumentsFor(companyId: string, quarter: string): Promise<CompanyDocument[]>
export async function getDocumentMeta(id: string): Promise<CompanyDocument | null>
export async function getPageText(documentId: string, pages: number[]): Promise<{ pageNo: number; text: string }[]>
export const DOCUMENTS_BUCKET = 'company-documents'
```

- [ ] **Step 1: Write `src/lib/documents/index.ts`**

```ts
import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'

// Document reads for the app + chat grounding. Mission-5 design hook: the future
// company_knowledge layer slots in behind THIS interface (spec 2026-07-14) — callers never
// touch tables directly.

export const DOCUMENTS_BUCKET = 'company-documents'

export interface CompanyDocument {
  id: string
  companyId: string
  quarter: string
  docType: string
  title: string
  storagePath: string
  pageCount: number
  lang: string
}

type Row = {
  id: string
  company_id: string
  quarter: string
  doc_type: string
  title: string
  storage_path: string
  page_count: number
  lang: string
}

const fromRow = (r: Row): CompanyDocument => ({
  id: r.id,
  companyId: r.company_id,
  quarter: r.quarter,
  docType: r.doc_type,
  title: r.title,
  storagePath: r.storage_path,
  pageCount: r.page_count,
  lang: r.lang,
})

export async function getDocumentsFor(companyId: string, quarter: string): Promise<CompanyDocument[]> {
  const { data } = await supabaseAdmin
    .from('company_documents')
    .select('id, company_id, quarter, doc_type, title, storage_path, page_count, lang')
    .eq('company_id', companyId)
    .eq('quarter', quarter)
    .order('doc_type')
  return (data ?? []).map((r) => fromRow(r as Row))
}

export async function getDocumentMeta(id: string): Promise<CompanyDocument | null> {
  const { data } = await supabaseAdmin
    .from('company_documents')
    .select('id, company_id, quarter, doc_type, title, storage_path, page_count, lang')
    .eq('id', id)
    .maybeSingle()
  return data ? fromRow(data as Row) : null
}

export async function getPageText(
  documentId: string,
  pages: number[]
): Promise<{ pageNo: number; text: string }[]> {
  if (pages.length === 0) return []
  const { data } = await supabaseAdmin
    .from('document_pages')
    .select('page_no, text')
    .eq('document_id', documentId)
    .in('page_no', pages)
    .order('page_no')
  return (data ?? []).map((r) => ({ pageNo: r.page_no as number, text: r.text as string }))
}
```

- [ ] **Step 2: Write `src/lib/documents/ingest.ts`**

```ts
// Ingest = upload PDF to the private bucket + extract per-page text + persist rows.
// Script-only (imports extract.ts → pdfjs); the CLI wraps this, and Core-2 MAYA auto-fetch
// will call ingestDocument() directly later. Idempotent on (company, quarter, docType).
import { createClient } from '@supabase/supabase-js'
import { extractPdfPages } from './extract'

export const DOCUMENTS_BUCKET = 'company-documents'

export interface IngestArgs {
  supabaseUrl: string
  serviceRoleKey: string
  fileBytes: Uint8Array
  companyId: string
  quarter: string
  docType: 'report' | 'slides'
  title: string
  source?: string
}

export async function ingestDocument(a: IngestArgs): Promise<{ documentId: string; pageCount: number }> {
  const db = createClient(a.supabaseUrl, a.serviceRoleKey)

  // 1. extraction first — if the PDF is bad we fail before touching storage/DB
  const { pageCount, pages } = await extractPdfPages(a.fileBytes)
  if (pageCount === 0) throw new Error('PDF has no pages')

  // 2. ensure the private bucket exists (idempotent)
  const { data: buckets } = await db.storage.listBuckets()
  if (!buckets?.some((b) => b.name === DOCUMENTS_BUCKET)) {
    const { error } = await db.storage.createBucket(DOCUMENTS_BUCKET, { public: false })
    if (error) throw new Error(`createBucket failed: ${error.message}`)
  }

  // 3. upload (upsert = re-ingest replaces the file)
  const storagePath = `${a.companyId}/${a.quarter.replace(/\s+/g, '-')}/${a.docType}.pdf`
  const up = await db.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, a.fileBytes, { contentType: 'application/pdf', upsert: true })
  if (up.error) throw new Error(`upload failed: ${up.error.message}`)

  // 4. upsert the document row
  const doc = await db
    .from('company_documents')
    .upsert(
      {
        company_id: a.companyId,
        quarter: a.quarter,
        doc_type: a.docType,
        title: a.title,
        source: a.source ?? 'manual',
        storage_path: storagePath,
        page_count: pageCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,quarter,doc_type' }
    )
    .select('id')
    .single()
  if (doc.error || !doc.data) throw new Error(`document upsert failed: ${doc.error?.message}`)
  const documentId = doc.data.id as string

  // 5. replace pages (delete-then-insert keeps re-ingest clean; ours-only table)
  const del = await db.from('document_pages').delete().eq('document_id', documentId)
  if (del.error) throw new Error(`pages delete failed: ${del.error.message}`)
  const rows = pages.map((text, i) => ({ document_id: documentId, page_no: i + 1, text }))
  for (let i = 0; i < rows.length; i += 50) {
    const ins = await db.from('document_pages').insert(rows.slice(i, i + 50))
    if (ins.error) throw new Error(`pages insert failed: ${ins.error.message}`)
  }
  return { documentId, pageCount }
}
```

- [ ] **Step 3: Write `scripts/ingest-document.ts`**

```ts
// CLI: npx tsx scripts/ingest-document.ts --file <pdf> --company <uuid|ticker> \
//        --quarter "Q2 2026" [--type report] [--title "..."]
// Env from .env.local (same tiny loader pattern as scripts/transcribe-batch.mjs).
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ingestDocument } from '../src/lib/documents/ingest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const file = arg('file')
const company = arg('company')
const quarter = arg('quarter')
const docType = (arg('type') ?? 'report') as 'report' | 'slides'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function main() {
  if (!file || !company || !quarter) {
    console.error('Usage: npx tsx scripts/ingest-document.ts --file <pdf> --company <uuid|ticker> --quarter "Q2 2026" [--type report|slides] [--title ...]')
    process.exit(1)
  }
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`)
    process.exit(1)
  }
  const db = createClient(url, key)
  // resolve company: uuid passes through, anything else is looked up as a ticker
  let companyId = company
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(company)) {
    const { data } = await db.from('companies').select('id, name').eq('ticker', company).maybeSingle()
    if (!data) {
      console.error(`No company with ticker ${company}`)
      process.exit(1)
    }
    companyId = data.id as string
    console.log(`company: ${data.name} (${companyId})`)
  }
  const title = arg('title') ?? `${docType === 'report' ? 'דוח רבעוני' : 'מצגת'} ${quarter}`
  const res = await ingestDocument({
    supabaseUrl: url,
    serviceRoleKey: key,
    fileBytes: new Uint8Array(readFileSync(file)),
    companyId,
    quarter,
    docType,
    title,
  })
  console.log(`INGESTED document ${res.documentId} — ${res.pageCount} pages`)
}

main().catch((err) => {
  console.error('INGEST FAILED:', err.message)
  process.exit(1)
})
```

- [ ] **Step 4: Verify types + battery**

Run: `npx tsc --noEmit` — expected silent. (`scripts/**` is outside tsconfig per the known
repo gap; the CLI still type-checks implicitly via tsx at run time. `src/lib/documents/*` IS
checked.) Run `npm test` — all pass (no behavior change to existing suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/index.ts src/lib/documents/ingest.ts scripts/ingest-document.ts
git commit -m "feat(documents): read interface (Mission-5 hook) + idempotent ingest lib and CLI"
```

---

### Task 4: API routes — list documents + stream PDF

**Files:**
- Create: `src/app/api/documents/route.ts`
- Create: `src/app/api/documents/[id]/file/route.ts`

**Interfaces:**
- Consumes: `getDocumentsFor`, `getDocumentMeta`, `DOCUMENTS_BUCKET` (Task 3),
  `getRequestUserId` (`@/lib/auth`), `supabaseAdmin`.
- Produces: `GET /api/documents?companyId&quarter` →
  `{ documents: { id, docType, title, quarter, pageCount, lang }[] }`;
  `GET /api/documents/[id]/file` → `application/pdf` bytes. Both 401 unauthenticated.

- [ ] **Step 1: Write the list route**

```ts
// src/app/api/documents/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { getDocumentsFor } from '@/lib/documents'

// GET /api/documents?companyId=<uuid>&quarter=<Q2 2026> — a call view asks which real
// documents exist for its company+quarter (Report pane: doc_type 'report').
export async function GET(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('companyId')
  const quarter = req.nextUrl.searchParams.get('quarter')
  if (!companyId || !quarter) {
    return NextResponse.json({ error: 'companyId and quarter required' }, { status: 400 })
  }
  const docs = await getDocumentsFor(companyId, quarter)
  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      title: d.title,
      quarter: d.quarter,
      pageCount: d.pageCount,
      lang: d.lang,
    })),
  })
}
```

- [ ] **Step 2: Write the file-stream route**

```ts
// src/app/api/documents/[id]/file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { getDocumentMeta, DOCUMENTS_BUCKET } from '@/lib/documents'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/documents/[id]/file — auth-gated PDF bytes from the PRIVATE bucket (files are
// never publicly addressable; this route is the only door).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const meta = await getDocumentMeta(params.id)
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { data, error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).download(meta.storagePath)
  if (error || !data) {
    console.error('[GET /api/documents/:id/file] download failed', error?.message)
    return NextResponse.json({ error: 'file unavailable' }, { status: 502 })
  }
  return new Response(data.stream(), {
    headers: {
      'content-type': 'application/pdf',
      'cache-control': 'private, max-age=3600',
    },
  })
}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` (silent) and `npm test` (green).
Manual check comes in Task 6 once data exists (`curl -s -o NUL -w "%{http_code}" http://localhost:3003/api/documents?companyId=x&quarter=y` → 401 without auth).

```bash
git add src/app/api/documents
git commit -m "feat(api): auth-gated document list + private-bucket PDF stream routes"
```

---

### Task 5: Chat grounding — documentRef → labeled context blocks

**Files:**
- Create: `src/lib/chat/documentBlock.ts` (PURE composer — no `server-only`, so node:test can import it)
- Modify: `src/lib/chat/context.ts` (async wrapper `getDocumentContext`, re-export of the pure composer)
- Create: `src/lib/chat/documentContext.test.ts`
- Modify: `src/app/api/chat/route.ts` (accept `documentRef`, compose blocks)
- Modify: `src/lib/api/chat.ts` (ChatInput gains `documentRef`)
- Modify: `package.json` (test list)

**Interfaces:**
- Consumes: `getPageText`, `getDocumentMeta` (Task 3).
- Produces:
  - `export interface DocumentRef { documentId: string; pages: number[] }` (in `src/lib/api/chat.ts`, client-safe)
  - `export function buildDocumentBlock(meta: { title: string; quarter: string } | null, pages: { pageNo: number; text: string }[]): string` (pure, in context.ts)
  - `export async function getDocumentContext(ref: DocumentRef): Promise<string>` (in context.ts)
  - `/api/chat` body gains optional `documentRef`; system prompt gains a REPORT CONTEXT block
    and a cross-connect instruction.

- [ ] **Step 1: Write failing tests for the pure composer**

```ts
// src/lib/chat/documentContext.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentBlock } from './documentBlock'

test('labels the block with title, quarter and page numbers', () => {
  const block = buildDocumentBlock({ title: 'דוח רבעוני', quarter: 'Q2 2026' }, [
    { pageNo: 3, text: 'טקסט של עמוד שלוש' },
  ])
  assert.ok(block.includes('=== REPORT CONTEXT'))
  assert.ok(block.includes('דוח רבעוני'))
  assert.ok(block.includes('Q2 2026'))
  assert.ok(block.includes('[page 3]'))
  assert.ok(block.includes('טקסט של עמוד שלוש'))
})

test('degraded path: no pages → empty string (chat proceeds on passage + transcript)', () => {
  assert.equal(buildDocumentBlock({ title: 'x', quarter: 'y' }, []), '')
  assert.equal(buildDocumentBlock(null, [{ pageNo: 1, text: 't' }]), '')
})

test('multiple pages come out in order and are size-capped', () => {
  const big = 'א'.repeat(30_000)
  const block = buildDocumentBlock({ title: 't', quarter: 'q' }, [
    { pageNo: 1, text: big },
    { pageNo: 2, text: big },
  ])
  assert.ok(block.indexOf('[page 1]') < block.indexOf('[page 2]'))
  assert.ok(block.length <= 25_000 + 200) // MAX_DOC_CONTEXT_CHARS + label slack
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test src/lib/chat/documentContext.test.ts`
Expected: FAIL — `buildDocumentBlock` is not exported.

- [ ] **Step 3a: Write the pure composer** — `src/lib/chat/documentBlock.ts` (NO `server-only`
  import — context.ts has one and it throws under plain node:test):

```ts
// Pure REPORT-CONTEXT block composer (multiview M1). Kept free of server-only imports so
// node:test can exercise it; context.ts re-exports it for server callers.
const MAX_DOC_CONTEXT_CHARS = 25_000

export function buildDocumentBlock(
  meta: { title: string; quarter: string } | null,
  pages: { pageNo: number; text: string }[]
): string {
  if (!meta || pages.length === 0) return ''
  const body = pages.map((p) => `[page ${p.pageNo}]\n${p.text}`).join('\n\n')
  return `=== REPORT CONTEXT (${meta.title} — ${meta.quarter}) ===\n${body}`.slice(
    0,
    MAX_DOC_CONTEXT_CHARS
  )
}
```

- [ ] **Step 3b: Extend `src/lib/chat/context.ts`** — append:

```ts
// ── Document grounding (multiview M1) ──────────────────────────────────────────
// A marked PDF passage arrives with { documentId, pages }; we ground the answer on the
// stored page text + the transcript. Mission-5 hook: company_knowledge will extend THIS
// composition point (spec 2026-07-14).
import { getDocumentMeta, getPageText } from '@/lib/documents'
import { buildDocumentBlock } from './documentBlock'

export { buildDocumentBlock }

export async function getDocumentContext(ref: { documentId: string; pages: number[] }): Promise<string> {
  const pages = [...new Set(ref.pages)].filter((n) => Number.isInteger(n) && n >= 1).slice(0, 4)
  if (pages.length === 0) return ''
  const [meta, texts] = await Promise.all([getDocumentMeta(ref.documentId), getPageText(ref.documentId, pages)])
  return buildDocumentBlock(meta ? { title: meta.title, quarter: meta.quarter } : null, texts)
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --import tsx --test src/lib/chat/documentContext.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Wire `/api/chat`** — in `src/app/api/chat/route.ts`:

after `const liveContext ...` add:

```ts
  // Multiview M1: a marked PDF passage arrives with its document + page numbers; the stored
  // page text becomes a labeled REPORT CONTEXT block beside the transcript.
  const documentRef: { documentId: string; pages: number[] } | undefined =
    body?.documentRef && typeof body.documentRef.documentId === 'string' && Array.isArray(body.documentRef.pages)
      ? { documentId: body.documentRef.documentId, pages: body.documentRef.pages }
      : undefined
```

after the `const ctx = ...` assignment add:

```ts
  const docBlock = documentRef ? await getDocumentContext(documentRef).catch(() => '') : ''
```

extend the import: `import { getChatContext, getDocumentContext } from '@/lib/chat/context'`

and extend the `system` string — replace the final context line:

```ts
    (docBlock
      ? '\nWhen a REPORT CONTEXT block is present, connect the report to the call: relate the marked passage to what management said on the call when relevant.\n\n' +
        docBlock +
        '\n'
      : '') +
    (ctx.text ? `\n\n=== TRANSCRIPT CONTEXT ===\n${ctx.text}` : '\n\n(No transcript context is available.)')
```

- [ ] **Step 6: Extend the client type** — in `src/lib/api/chat.ts`:

```ts
export interface DocumentRef {
  documentId: string
  pages: number[]
}
```

and add to `ChatInput`:

```ts
  documentRef?: DocumentRef // multiview: marked-PDF passage grounding (document + page numbers)
```

- [ ] **Step 7: Add the test file to package.json test list, run battery, commit**

Run: `npm test` and `npx tsc --noEmit` — green/silent.

```bash
git add src/lib/chat/context.ts src/lib/chat/documentContext.test.ts src/app/api/chat/route.ts src/lib/api/chat.ts package.json
git commit -m "feat(chat): documentRef grounding — REPORT CONTEXT block beside transcript context"
```

---

### Task 6: Apply migration + seed the demo report  ⚠️ FOUNDER GATES

**Files:** none (operational task)

**Interfaces:**
- Consumes: Task 1 SQL, Task 3 CLI.
- Produces: live tables + bucket + the Tigbur document rows the UI tasks render.

- [ ] **Step 1: Cross-cutting MIGRATION append (DB law — MUST precede apply).**
  Attempt: `Bash: echo '[<now>] MIGRATION Lane M — applying 20260714_012_company_documents.sql (additive: company_documents + document_pages + RLS read policies; private bucket company-documents created by ingest)' >> C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md`.
  **If permission-denied (known session gate): STOP this task, tell the founder exactly what
  line needs to land in cross-cutting.md and why, and move on to Task 7 (UI tasks don't need
  the DB).** Do not bypass the deny.

- [ ] **Step 2: Apply the migration** via `mcp__supabase__apply_migration` (name
  `20260714_012_company_documents`, query = the Task 1 file contents).
  **If MCP still returns Unauthorized: STOP, tell the founder the access token is missing
  (SUPABASE_ACCESS_TOKEN for the MCP server), continue with Task 7.**

- [ ] **Step 3: Seed the demo report** (quarter matches the DEMO CALL, not the PDF — see
  Global Constraints):

```bash
npx tsx scripts/ingest-document.ts --file "C:/Users/Sagi/Desktop/Atlas/local-assets/demo-report.pdf" --company 1105022 --quarter "Q2 2026" --type report --title "דוח דירקטוריון Q1 2026"
```

Expected: `company: תיגבור (<uuid>)` then `INGESTED document <uuid> — 31 pages`.

- [ ] **Step 4: Verify rows** via `mcp__supabase__execute_sql`:
  `select page_no, left(text, 40) from document_pages dp join company_documents cd on cd.id = dp.document_id where cd.doc_type = 'report' order by page_no limit 3;`
  Expected: 3 rows, Hebrew starts of pages 1–3 in correct reading order.

- [ ] **Step 5: Log completion** — append to cross-cutting (same gate as Step 1):
  `[<now>] MIGRATION Lane M — 20260714_012 applied + demo report seeded (31 pages, Tigbur/Q2 2026 demo linkage)`.

---

### Task 7: PdfViewer + ReportPane wiring

**Files:**
- Create: `src/components/live/PdfViewer.tsx`
- Modify: `src/components/live/FacetPanes.tsx` (ReportPane gains data + fallback)
- Modify: `src/components/live/LiveTranscriptView.tsx` + `src/components/live/LiveBroadcastView.tsx` (pass companyId/quarter to ReportPane)
- Modify: `src/app/globals.css` (text-layer CSS)

**Interfaces:**
- Consumes: `GET /api/documents`, `GET /api/documents/[id]/file` (Task 4).
- Produces: `<ReportPane companyId={call.companyId} quarter={call.quarter} onAskSelection={fn} style={...} />`
  — new optional props `companyId?: string | null`, `quarter?: string | null`,
  `onAskSelection?: (text: string, page: number | null) => void` (Task 8 uses the callback).
  `PdfViewer` props: `{ docId: string; pageCount: number; onAskSelection?: (text: string, page: number | null) => void }`.

- [ ] **Step 1: Text-layer CSS** — append to `src/app/globals.css` (minimal pdf.js TextLayer
  anatomy; selection color comes from the existing `[data-ask]` rule):

```css
/* pdf.js text layer (multiview M1): transparent selectable text over each page canvas */
.pdfpage { position: relative; direction: ltr; }
.pdftext { position: absolute; inset: 0; overflow: hidden; line-height: 1; text-size-adjust: none; forced-color-adjust: none; transform-origin: 0 0; caret-color: CanvasText; }
.pdftext :is(span, br) { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; }
```

- [ ] **Step 2: Write `src/components/live/PdfViewer.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'

// Real-PDF viewer for the Report facet pane (multiview M1). pdf.js canvas per page +
// TextLayer (transparent selectable text — pdf.js's own bidi positioning). Pages render
// lazily; width fits the pane and re-fits on gutter drag (debounced via ResizeObserver).
// Pages stay white in both call themes — a document reads like paper.
type PdfLib = typeof import('pdfjs-dist')

export function PdfViewer({
  docId,
  pageCount,
  onAskSelection,
}: {
  docId: string
  pageCount: number
  onAskSelection?: (text: string, page: number | null, documentId: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<any>(null)
  const [failed, setFailed] = useState(false)
  const [width, setWidth] = useState(0)
  const [retryNonce, setRetryNonce] = useState(0)

  // load pdf.js + the document (auth-gated stream)
  useEffect(() => {
    let dead = false
    let loaded: any = null
    ;(async () => {
      try {
        const pdfjs: PdfLib = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString()
        const task = pdfjs.getDocument({ url: `/api/documents/${docId}/file` })
        loaded = await task.promise
        if (!dead) setDoc(loaded)
      } catch (err) {
        console.error('[PdfViewer] load failed', (err as Error).message)
        if (!dead) setFailed(true)
      }
    })()
    return () => {
      dead = true
      loaded?.destroy?.()
    }
  }, [docId, retryNonce])

  // pane width (gutter drags resize us) — debounced so dragging stays smooth
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    let t: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t)
      t = setTimeout(() => setWidth(el.clientWidth), 150)
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => {
      ro.disconnect()
      if (t) clearTimeout(t)
    }
  }, [])

  function onMouseUp() {
    if (!onAskSelection) return
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!text || !sel || sel.rangeCount === 0) return
    // page number: nearest .pdfpage ancestor of the selection start
    let node: Node | null = sel.getRangeAt(0).startContainer
    let page: number | null = null
    while (node) {
      if (node instanceof HTMLElement && node.dataset.page) {
        page = Number(node.dataset.page)
        break
      }
      node = node.parentNode
    }
    onAskSelection(text, page, docId)
  }

  if (failed) {
    return (
      <div className="call-hair call-card-bg call-muted rounded-lg border p-6 text-center text-[13px]">
        <p className="mb-3">לא הצלחנו לטעון את המסמך.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false)
            setDoc(null)
            setRetryNonce((n) => n + 1)
          }}
          className="call-ink call-hair rounded-md border px-3 py-1"
        >
          נסו שוב
        </button>
      </div>
    )
  }

  return (
    <div ref={hostRef} data-ask="1" onMouseUp={onMouseUp} className="flex flex-col gap-3">
      {doc && width > 0
        ? Array.from({ length: pageCount }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} pageNo={i + 1} width={width} />
          ))
        : null}
    </div>
  )
}

// One lazily-rendered page: a white card that keeps its aspect-ratio placeholder until the
// IntersectionObserver says it's near the viewport, then draws canvas + text layer.
function PdfPage({ doc, pageNo, width }: { doc: any; pageNo: number; width: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(pageNo <= 2) // first pages render immediately
  const [ratio, setRatio] = useState(1.414) // A4 until the real viewport is known

  useEffect(() => {
    const el = wrapRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let dead = false
    ;(async () => {
      try {
        const pdfjs: PdfLib = await import('pdfjs-dist')
        const page = await doc.getPage(pageNo)
        const base = page.getViewport({ scale: 1 })
        const scale = width / base.width
        const viewport = page.getViewport({ scale })
        setRatio(viewport.height / viewport.width)
        const el = wrapRef.current
        if (!el || dead) return
        el.innerHTML = ''
        const canvas = document.createElement('canvas')
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        el.appendChild(canvas)
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise
        const textDiv = document.createElement('div')
        textDiv.className = 'pdftext'
        textDiv.style.setProperty('--scale-factor', String(scale))
        el.appendChild(textDiv)
        const tl = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        })
        await tl.render()
      } catch (err) {
        console.error(`[PdfViewer] page ${pageNo} render failed`, (err as Error).message)
      }
    })()
    return () => {
      dead = true
    }
  }, [visible, doc, pageNo, width])

  return (
    <div
      ref={wrapRef}
      data-page={pageNo}
      className="pdfpage w-full rounded-md bg-white shadow-sm"
      style={{ aspectRatio: `1 / ${ratio}` }}
    />
  )
}
```

Implementer notes: (a) pdfjs-dist 5.x — if `new pdfjs.TextLayer(...)` is missing, the 5.x
alternative is `pdfjs.renderTextLayer({ textContentSource, container, viewport })`; check
`node_modules/pdfjs-dist/types/src/display/text_layer.d.ts` and use whichever exists.
(b) If `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` fails in the Next
build, fallback: `Copy-Item node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`
and set `workerSrc = '/pdf.worker.min.mjs'` (commit the copy; note it for /ship).
(c) The type alias `PdfDoc` above is scaffolding — delete it if unused after typing settles.

- [ ] **Step 3: ReportPane gains data (stub stays the fallback)** — rewrite `ReportPane` in
  `src/components/live/FacetPanes.tsx`:

```tsx
export function ReportPane({
  companyId,
  quarter,
  onAskSelection,
  style,
}: {
  companyId?: string | null
  quarter?: string | null
  onAskSelection?: (text: string, page: number | null, documentId: string) => void
  style?: React.CSSProperties
}) {
  const { dict } = useI18n()
  const report = reportStub()
  const [doc, setDoc] = useState<{ id: string; title: string; pageCount: number } | null>(null)
  useEffect(() => {
    if (!companyId || !quarter) return
    let dead = false
    fetch(`/api/documents?companyId=${encodeURIComponent(companyId)}&quarter=${encodeURIComponent(quarter)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = j?.documents?.find((x: { docType: string }) => x.docType === 'report')
        if (!dead && d) setDoc({ id: d.id, title: d.title, pageCount: d.pageCount })
      })
      .catch(() => {})
    return () => {
      dead = true
    }
  }, [companyId, quarter])

  return (
    <div data-facet="report" style={style} className="flex min-w-[300px] flex-1 flex-col overflow-hidden">
      <PaneHeader
        label={dict.live.report}
        right={<span className="call-muted text-[11px]">{doc ? doc.title : dict.live.reportFreely}</span>}
      />
      <div className="atscroll flex-1 overflow-auto p-[22px]">
        {doc ? (
          <PdfViewer docId={doc.id} pageCount={doc.pageCount} onAskSelection={onAskSelection} />
        ) : (
          <div dir="rtl" data-ask="1" className="call-hair call-card-bg call-ink rounded-lg border px-9 py-8">
            <div className="mb-1.5 font-display text-[21px]">{report.title}</div>
            <div className="call-muted mb-[18px] text-[12.5px]">{report.dateLine}</div>
            {report.paragraphs.map((p) => (
              <p key={p.slice(0, 16)} className="mb-3 text-[14px] leading-[1.95]">
                {p}
              </p>
            ))}
            <p className="call-muted text-[14px] leading-[1.95]">{report.hint}</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

Add imports at the top of FacetPanes.tsx: `useEffect` (extend the existing react import) and
`import { PdfViewer } from './PdfViewer'`.

- [ ] **Step 4: Pass call identity from both views.** In `LiveTranscriptView.tsx` (~line 646)
  and `LiveBroadcastView.tsx` (its ReportPane render):

```tsx
<ReportPane
  companyId={call.companyId}
  quarter={call.quarter}
  style={view === 'multi' ? { flex: `${colFlex.report} 1 0px` } : undefined}
/>
```

(`onAskSelection` lands in Task 8; LiveBroadcastView keeps display-only in M1 — check its
call/company fields: it has the same LiveCall shape via its own props; if its call object
lacks companyId/quarter, pass what exists and let the stub fallback handle the rest.)

- [ ] **Step 5: Battery + visual smoke**

Run: `npx tsc --noEmit` · `npm test` · `npm run build` — all green.
(The pane still shows the STUB until Task 6 seeds data — correct fallback behavior. If Task 6
ran first, the real PDF appears; either way nothing crashes.)

- [ ] **Step 6: Commit**

```bash
git add src/components/live/PdfViewer.tsx src/components/live/FacetPanes.tsx src/components/live/LiveTranscriptView.tsx src/components/live/LiveBroadcastView.tsx src/app/globals.css
git commit -m "feat(report-pane): pdf.js viewer with selectable text layer, stub card as no-document fallback"
```

---

### Task 8: Selection → Ask Atlas wiring

**Files:**
- Modify: `src/components/live/LiveTranscriptView.tsx` (chat state gains docRef; ReportPane gets onAskSelection)
- Modify: `src/components/live/TranscriptChatPanel.tsx` (report-labeled reference + documentRef pass-through)

**Interfaces:**
- Consumes: `onAskSelection(text, page)` (Task 7), `DocumentRef` + `ChatInput.documentRef` (Task 5).
- Produces: end-to-end M1 flow — mark in PDF → reference block labeled report/page → `/api/chat` with `documentRef`.

- [ ] **Step 1: Chat state carries the document reference.** In `LiveTranscriptView.tsx`,
  extend the chat state (~line 99):

```tsx
const [chat, setChat] = useState<{
  open: boolean
  seed: string
  nonce: number
  docRef: { documentId: string; page: number | null } | null
}>({ open: false, seed: '', nonce: 0, docRef: null })
```

Set `docRef: null` wherever the existing code seeds transcript selections (the `setChat`
calls in `onTextSelect` and the star/ask actions — find every existing `setChat((c) => ...)`
and add `docRef: null` so a transcript highlight clears a stale report ref).

Add the report callback (near `onTextSelect`). The documentId arrives as the callback's
third argument (Task 7's `onAskSelection` signature — PdfViewer knows its own `docId`):

```tsx
// A passage marked inside the report PDF → open the side chat seeded with it (same UX as
// transcript highlights), tagged with document + page so /api/chat grounds on the page text.
function onReportAsk(text: string, page: number | null, documentId: string) {
  setChat((c) => ({ open: true, seed: text, nonce: c.nonce + 1, docRef: { documentId, page } }))
}
```

and pass it: `<ReportPane companyId={call.companyId} quarter={call.quarter} onAskSelection={onReportAsk} style={...} />`.

- [ ] **Step 2: Panel sends documentRef + labels the reference.** In
  `TranscriptChatPanel.tsx`:

Props gain:

```tsx
  /** multiview: the pending reference came from the report PDF (document + page) */
  docRef?: { documentId: string; page: number | null } | null
```

Track it beside `ref` (a fresh transcript highlight clears it):

```tsx
const [refDoc, setRefDoc] = useState<typeof docRef>(docRef ?? null)
useEffect(() => {
  if (quote) {
    setRef(quote)
    setRefDoc(docRef ?? null)
  }
  inputRef.current?.focus({ preventScroll: true })
}, [seedNonce, quote]) // docRef rides the same nonce
```

In `send()`, replace the `apiMessage` line and extend the streamChat input:

```tsx
const usedDoc = refDoc
const apiMessage = usedRef
  ? usedDoc
    ? `Regarding this passage from the company's quarterly report${usedDoc.page ? ` (page ${usedDoc.page})` : ''}: "${usedRef}"\n\n${text}`
    : `Regarding this quote from the investor call: "${usedRef}"\n\n${text}`
  : text
```

```tsx
const { source } = await streamChat(
  {
    message: apiMessage,
    companyId: companyId ?? undefined,
    transcriptId,
    liveContext,
    history,
    documentRef: usedDoc ? { documentId: usedDoc.documentId, pages: usedDoc.page ? [usedDoc.page] : [] } : undefined,
  },
  ...
)
```

and clear it with the reference: where `setRef('')` runs in `send()`, add `setRefDoc(null)`.

In `LiveTranscriptView.tsx`, pass the prop where the panel renders (~line 775):
`docRef={chat.docRef}`.

- [ ] **Step 3: Battery**

Run: `npx tsc --noEmit` · `npm test` · `npm run build` — green.
(Deliberate deviation from the spec: the selection→page DOM walk is not unit-tested — the
repo's node:test runner has no DOM. It is covered by the Task 9 /verify-app end-to-end pass.)

- [ ] **Step 4: Commit**

```bash
git add src/components/live/LiveTranscriptView.tsx src/components/live/TranscriptChatPanel.tsx src/components/live/PdfViewer.tsx src/components/live/FacetPanes.tsx
git commit -m "feat(ask-atlas): marked PDF passage seeds the side chat with document+page grounding"
```

---

### Task 9: End-to-end verification + evidence + ship

**Files:** evidence → `C:/Users/Sagi/Desktop/Atlas/docs/evidence/feat-multiview-backend/` (main checkout)

- [ ] **Step 1:** Task 6 complete? If it was blocked, resolve with the founder FIRST — the
  end-to-end needs seeded data.
- [ ] **Step 2:** `npm run dev -- -p 3003`, hard-refresh, open the demo call, switch to Multi.
- [ ] **Step 3:** Run `/verify-app` (multiview recipe) via Chrome MCP: real PDF pages visible
  in the Report pane · scroll to a prose page · select Hebrew text inside the PDF (yellow) ·
  chat opens seeded with "passage from the quarterly report (page N)" · streamed answer
  actually references the marked passage · repeat in Light theme · RTL intact · console clean.
- [ ] **Step 4:** Screenshots + verdict → `docs/evidence/feat-multiview-backend/` in the MAIN
  checkout (durable-evidence law).
- [ ] **Step 5:** Update the board (Lane M section) + `state-multiview.md`.
- [ ] **Step 6:** `/ship` (lane variant: battery → ready-queue append → PROGRESS note per the
  skill; never push main).
