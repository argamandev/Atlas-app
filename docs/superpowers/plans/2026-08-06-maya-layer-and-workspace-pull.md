# MAYA Layer + Workspace Document Pull — Implementation Plan
> STATUS: SHIPPED — historical record, do not execute; current truth lives in
> ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user names a company and period in workspace chat; Atlas fetches those filings from MAYA, confirms in words, downloads and extracts the PDFs, and puts them on the shelf.

**Architecture:** A MAYA platform layer under `src/lib/maya/` that knows nothing about workspaces (four future consumers), plus the workspace as its first consumer. The intake's existing-but-dead "narrow" stage is promoted into an always-on interpret step whose output doubles as the MAYA query; remote filings join the candidate list and flow through the unchanged selection conversation.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, `node:test` + `tsx`, pdfjs-dist.

**Spec:** `docs/superpowers/specs/2026-08-06-maya-layer-and-workspace-pull-design.md`

## Global Constraints

- Base URL `https://datawise.tase.co.il`; auth header `apikey` from `MAYA_API_KEY`; **never** in a client bundle.
- `Accept-Language: he-IL` on **every** call — `en-US` returns `title: null`.
- **Date range must not exceed 1 year** — a 380-day window returns HTTP 400.
- Rate limit 10 requests / 2 seconds. Windowed calls are issued **sequentially**.
- Document whitelist is exactly `{101, 104, 105, 106, 270}`; a candidate must also carry a `.pdf`.
- `npm test` makes **no network calls** — fixtures only.
- Migrations are additive only, appended to `agent-memory/cross-cutting.md` **before** applying, and **reviewed before applied** (`.claude/rules/db.md`).
- Mixed Hebrew/Latin lines use `<bdi>` per `.claude/rules/app.md`.
- Lane port is **3003**. Never run `npm run build` while the dev server is up.

---

### Task 1: MAYA types, config and client

**Files:**
- Create: `src/lib/maya/types.ts`, `src/lib/maya/config.ts`, `src/lib/maya/client.ts`, `src/lib/maya/client.test.ts`

**Interfaces — Produces:**
```ts
export type MayaFailure =
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited' }
  | { kind: 'bad_request'; fields: Record<string, string[]> }
  | { kind: 'unavailable'; detail?: string }
export type MayaResult<T> = { ok: true; data: T } | { ok: false; failure: MayaFailure }

export type MayaEvent = { eventId: number; eventName: string }
export type MayaIssuerRef = { issuerId: number; issuerName: string; assosiated?: boolean }
export type MayaFiling = {
  publicationDate: string
  mayaReportId: number
  title: string | null
  url: string | null
  issuer: MayaIssuerRef[]
  events: MayaEvent[]
  attachedFiles: { url: string }[]
}
export async function mayaGet<T>(
  path: string,
  params: Record<string, string | number>,
  opts?: { fetchImpl?: typeof fetch }
): Promise<MayaResult<T>>
```

- [ ] **Step 1: Write failing tests** — `client.test.ts`, injecting a stub `fetchImpl`:
  - 200 with `{data:[...]}` → `{ok:true, data}` and the request carried `apikey` + `Accept-Language: he-IL`
  - 401 → `{kind:'unauthorized'}`
  - 429 → `{kind:'rate_limited'}`
  - 400 with `{errors:{ToDate:["The date range cannot exceed 1 year."]}}` → `{kind:'bad_request', fields}` preserving the message
  - 503 and a thrown network error → `{kind:'unavailable'}`
  - `mayaGet` never throws
- [ ] **Step 2:** `npx tsx --test src/lib/maya/client.test.ts` → FAIL
- [ ] **Step 3:** Implement `config.ts` (BASE_URL, API_KEY_HEADER `'apikey'`, LANGUAGE `'he-IL'`, TIMEOUT_MS 12000, MAX_RANGE_DAYS 365, MAX_PDF_BYTES 40_000_000) and `client.ts`.
- [ ] **Step 4:** tests PASS
- [ ] **Step 5:** Commit `feat(maya): the client, and the single chokepoint every call goes through`

### Task 2: Date windows

**Files:** Create `src/lib/maya/dates.ts`, `src/lib/maya/dates.test.ts`

**Interfaces — Produces:** `export function yearWindows(fromYear: number, toYear: number): { from: string; to: string }[]`

- [ ] **Step 1: Write failing tests**
```ts
// a single year asks for TWO windows — the late-filing rule
assert.deepEqual(yearWindows(2024, 2024), [
  { from: '2024-01-01', to: '2024-12-31' },
  { from: '2025-01-01', to: '2025-12-31' },
])
// never exceeds the API's 1-year cap
for (const w of yearWindows(2020, 2026)) {
  const days = (Date.parse(w.to) - Date.parse(w.from)) / 86_400_000
  assert.ok(days <= 365, `${w.from}..${w.to} is ${days} days`)
}
// reversed input is a slip, not a request for nothing
assert.deepEqual(yearWindows(2026, 2024), yearWindows(2024, 2026))
```
- [ ] **Step 2:** run → FAIL
- [ ] **Step 3:** Implement. One window per calendar year from `min` through `max + 1`.
- [ ] **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(maya): year windows, because the range cap is 1 year and annual reports land late`

### Task 3: Event vocabulary

**Files:** Create `src/lib/maya/events.ts`, `src/lib/maya/events.test.ts`

**Interfaces — Produces:**
```ts
export const DOCUMENT_EVENT_IDS: ReadonlySet<number>   // 101,104,105,106,270
export const SCHEDULE_EVENT_IDS: ReadonlySet<number>   // 233,113 — consumers ③④
export function docTypeFor(eventIds: number[]): 'report' | 'slides' | null
export function periodFor(eventIds: number[], title: string | null, publishedISO: string): string
```

- [ ] **Step 1: Write failing tests**
```ts
assert.equal(docTypeFor([104, 270]), 'slides')   // presentation wins
assert.equal(docTypeFor([101]), 'report')
assert.equal(docTypeFor([233]), null)            // conference call is SCHEDULE, not a document
assert.equal(docTypeFor([114]), null)
assert.equal(periodFor([101], 'דוח תקופתי ושנתי לשנת 2024', '2025-03-30T00:00:00'), 'FY 2024')
assert.equal(periodFor([104], 'מצגת משקיעים - לרבעון הראשון של שנת 2026', '2026-05-27T00:00:00'), 'Q1 2026')
assert.equal(periodFor([106], null, '2025-11-30T00:00:00'), 'Q3 2025')  // falls back to publication year
```
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(maya): the event vocabulary, with conference calls classified as schedule not document`

### Task 4: Issuer name resolution

**Files:** Create `src/lib/maya/issuers.ts`, `src/lib/maya/issuers.test.ts`

**Interfaces — Produces:**
```ts
export type IssuerRow = { issuerId: number; nameHe: string | null; nameEn: string | null }
export function normaliseCompanyName(s: string): string
export function resolveIssuer(query: string, rows: IssuerRow[]): IssuerRow | null
```

- [ ] **Step 1: Write failing tests** — rows include `{1460,'תיגבור קבוצה','TIGBUR GROUP'}`, `{2030,'גילת','GILAT'}`, `{1328,'אמות',null}`
```ts
assert.equal(resolveIssuer('תיגבור', rows)?.issuerId, 1460)
assert.equal(resolveIssuer('קבוצת תיגבור בע"מ', rows)?.issuerId, 1460)
assert.equal(resolveIssuer('Tigbur Group', rows)?.issuerId, 1460)
assert.equal(resolveIssuer('  גילת  ', rows)?.issuerId, 2030)
assert.equal(resolveIssuer('חברה שלא קיימת', rows), null)
// AMBIGUITY IS NEVER A GUESS
assert.equal(resolveIssuer('א', rows), null)
```
- [ ] **Step 2:** FAIL → **Step 3:** implement (strip `בע"מ`/`Ltd`/quotes/geresh, collapse space, casefold; exact → unique prefix → unique substring; >1 match ⇒ null) → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(maya): issuer name resolution, ambiguity returns null rather than a guess`

### Task 5: Filing → source mapping

**Files:** Create `src/lib/maya/filings.ts`, `src/lib/maya/filings.test.ts`

**Interfaces — Consumes:** `MayaFiling`, `docTypeFor`, `periodFor`. **Produces:**
```ts
export type RemoteSource = {
  sourceId: string; mayaReportId: number; issuerId: number; issuerName: string
  title: string; publishedISO: string; docType: 'report' | 'slides'; period: string; pdfUrl: string
}
export function toRemoteSources(filings: MayaFiling[]): RemoteSource[]
```

- [ ] **Step 1: Write failing tests**
  - a 270+104 filing with a `.pdf` → one source, `sourceId === 'maya:1744031'`, `docType === 'slides'`
  - a filing whose only attachment is `.htm` → **dropped** (cannot be opened, so must not be offered)
  - a 233-only filing → dropped
  - a filing with two PDFs → one source, the **first** url
  - `title: null` → falls back to `${period} · ${issuerName}` rather than an empty label
  - output sorted newest first
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(maya): map filings to sources, dropping anything that cannot be opened`

### Task 6: File download with magic-byte validation

**Files:** Create `src/lib/maya/files.ts`, `src/lib/maya/files.test.ts`

**Interfaces — Produces:** `export async function downloadFiling(url: string, opts?: { fetchImpl?: typeof fetch }): Promise<MayaResult<Uint8Array>>`

- [ ] **Step 1: Write failing tests** (stub fetch)
```ts
// THE REAL BUG THIS EXISTS FOR: 200 + text/html + 212 bytes on a .pdf URL
// first call returns the interstitial, second returns a real PDF -> retried once, succeeds
// both calls interstitial -> { ok:false, failure:{kind:'unavailable'} }, NEVER ok
// oversize body -> rejected
// a body starting with %PDF- -> ok
```
- [ ] **Step 2:** FAIL → **Step 3:** implement (no `apikey` — mayafiles is public) → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(maya): a 200 is not proof you got the file, so check the magic bytes`

### Task 7: Disclosures, and the layering test

**Files:** Create `src/lib/maya/disclosures.ts`, `src/lib/maya/disclosures.test.ts`, `src/lib/maya/layering.test.ts`

**Interfaces — Produces:**
```ts
export async function listDisclosures(
  a: { issuerId: number; fromYear: number; toYear: number },
  opts?: { fetchImpl?: typeof fetch }
): Promise<MayaResult<MayaFiling[]>>
```

- [ ] **Step 1: Write failing tests**
  - two windows → two sequential calls; results merged and de-duplicated by `mayaReportId`
  - one window failing → the whole call fails (a partial catalog must never look complete)
  - `layering.test.ts`: read every file under `src/lib/maya/`, assert none contains `from '@/lib/workspace` or `from '../workspace`
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(maya): windowed disclosure listing, and a test that the layer stays a layer`

### Task 8: Migration 019 — reviewed before applied

**Files:** Create `supabase/migrations/20260806_019_maya.sql`

- [ ] **Step 1:** Write the migration:
  - `create table if not exists public.maya_issuers (issuer_id integer primary key, name_he text, name_en text, updated_at timestamptz not null default now())`
  - `alter table public.maya_issuers enable row level security`
  - `create policy maya_issuers_read on public.maya_issuers for select to authenticated using (true)` — shared corpus, the shape already shipped in `20260611_006`, **not** the banned `FOR ALL … WITH CHECK (true)` to `public`
  - `create index if not exists maya_issuers_name_he_idx on public.maya_issuers (name_he)`
  - `alter table public.company_documents add column if not exists maya_report_id bigint`
  - `create unique index if not exists company_documents_maya_report_uniq on public.company_documents (maya_report_id) where maya_report_id is not null`
- [ ] **Step 2:** Append the migration announcement to `agent-memory/cross-cutting.md` (append-only: `fs.appendFileSync`).
- [ ] **Step 3:** Commit the FILE.
- [ ] **Step 4:** Run `atlas-reviewer` on the migration file. `.claude/rules/db.md`: DDL against the shared DB is reviewed **before** it is applied, because narrowing a policy later needs hook-blocked SQL.
- [ ] **Step 5:** Apply via `mcp__supabase__apply_migration` only after the review is clean.
- [ ] **Step 6:** Verify: `select … from pg_indexes where tablename in ('maya_issuers','company_documents')` — list **every** index, never filtered by the name being added (the 018 lesson).

### Task 9: Issuer directory refresh script

**Files:** Create `scripts/maya-refresh-issuers.ts`

- [ ] **Step 1:** Implement: `by-report-year` for the last two years → distinct `issuerId`s → one `by-issuer` call each over a 30-day window, throttled to ≤10 req/2s → upsert `maya_issuers` → backfill `companies.tase_issuer_id` on a normalised name match. Print the coverage caveat: only companies that scheduled a report are found.
- [ ] **Step 2:** Run it. Expect ~233 issuers in ~50s.
- [ ] **Step 3:** Verify with SQL: `select count(*) from maya_issuers`, and that Tigbur resolves to 1460 and `companies.tase_issuer_id` is set for it.
- [ ] **Step 4:** Commit `feat(maya): the issuer directory, built from the schedule feed`

### Task 10: Ingest a MAYA filing

**Files:**
- Modify: `src/lib/documents/ingest.ts` (add optional `mayaReportId` and `storagePath`)
- Create: `src/lib/maya/ingestFiling.ts`, `src/lib/db/companies.ts`

**Interfaces — Produces:**
```ts
// ingest.ts — IngestArgs gains: mayaReportId?: number; storagePath?: string
export async function ensureCompanyForIssuer(admin: SupabaseClient, issuerId: number, issuerName: string): Promise<string>
export async function ingestFiling(a: { source: RemoteSource; companyId: string; supabaseUrl: string; serviceRoleKey: string })
  : Promise<{ documentId: string; pageCount: number }>
```

- [ ] **Step 1:** In `ingest.ts`, when `mayaReportId` is present set it on the row and use `onConflict: 'maya_report_id'`; default `storagePath` stays as today, MAYA passes `${companyId}/maya/${mayaReportId}.pdf`.
- [ ] **Step 2:** `ensureCompanyForIssuer`: match `tase_issuer_id`, then normalised name, else insert `{name, name_en, tase_issuer_id}`. Idempotent.
- [ ] **Step 3:** `ingestFiling`: `downloadFiling` → `ingestDocument`. Propagate a `MayaFailure` as a thrown `Error` with a readable message (the endpoint turns it into a per-file failure).
- [ ] **Step 4:** `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(maya): ingest a filing, keyed by its report id rather than by quarter`

### Task 11: The attach endpoint

**Files:** Create `src/app/api/workspaces/[id]/items/from-maya/route.ts`

- [ ] **Step 1:** POST handler: `resolveUser` → `unauthorized()` if absent (the `apiAuthBoundary` battery will fail the build otherwise); validate the `RemoteSource` body with zod; confirm the workspace is the caller's via RLS; `ensureCompanyForIssuer` → `ingestFiling` → `addItem`; return `{ item }` with 201/200 like the existing items route.
- [ ] **Step 2:** `npm test` — `src/lib/apiAuthBoundary.test.ts` must still pass with no allowlist entry added.
- [ ] **Step 3:** Commit `feat(workspace): attach a MAYA filing, fetching and extracting it first`

### Task 12: Intake integration

**Files:**
- Modify: `src/lib/workspace/data.ts` (`AttachableSource` gains `remote?: RemoteSource`)
- Modify: `src/lib/workspace/intake/selectSources.ts` (mark remote candidates)
- Modify: `src/app/api/workspaces/[id]/intake/route.ts`
- Modify: `src/lib/workspace/intake/selectSources.test.ts`

- [ ] **Step 1: Write failing tests** in `selectSources.test.ts`: a remote candidate renders with a marker naming MAYA and saying it is not yet in Atlas; a purely local list adds no such marker.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. Route order: resolve workspace → shelf → local corpus → **always** interpret the request → `resolveIssuer` → `listDisclosures` → `toRemoteSources` → drop filings whose `maya_report_id` already exists in `company_documents` → `candidates = remote ++ local` → existing SELECT. Set `sourceError: 'maya_unreachable'` or `unknownCompany` deterministically; never let the model narrate coverage failure.
- [ ] **Step 4:** PASS + `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(workspace): the intake can reach MAYA, and says so plainly when it cannot`

### Task 13: The client, and the prompt that currently refuses

**Files:**
- Modify: `src/components/workspace/WorkspaceIntake.tsx` (route remote sources to `/items/from-maya`)
- Modify: `src/lib/workspace/client.ts` (`addMayaItemReq`)
- Modify: `src/lib/workspace/chat/prompt.ts` + `prompt.test.ts`
- Modify: `src/lib/i18n/dictionaries/en.ts`, `he.ts` (fetching state, `maya_unreachable`, `unknownCompany` lines)

- [ ] **Step 1: Write failing prompt tests** — the capability block no longer claims MAYA is unreachable; it states Atlas can fetch filings from MAYA through the document step; the forbidden-verbs rule and the no-web-browsing rule both survive unchanged.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Rewrite the capability block; add the dictionary lines; in `WorkspaceIntake`, send remote sources to the new endpoint and keep per-file `failures[]`; show a fetching state, because a 41-page extract is seconds not milliseconds.
- [ ] **Step 4:** PASS. Full `npm test` + `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(workspace): Atlas can pull from MAYA, and its prompt no longer says it cannot`

### Task 14: Live verification

- [ ] **Step 1:** Dev server on **3003**; hard-refresh; sign-in is already in the founder's Chrome.
- [ ] **Step 2:** In a workspace, ask in Hebrew for **Tigbur's 2024 annual report** — the founder's own failing case. Confirm the two-window logic returns *"דוח תקופתי ושנתי לשנת 2024"* and **not** the 2023 one.
- [ ] **Step 3:** Agree; watch it fetch; confirm the file opens and its Hebrew text renders in order.
- [ ] **Step 4:** Ask a grounded question about the fetched report; the answer must cite it.
- [ ] **Step 5:** Check both locales for bidi — MAYA titles mix Hebrew with Latin (`Q1`, dates), so `<bdi>` per `.claude/rules/app.md`.
- [ ] **Step 6:** Console clean. Write evidence to `docs/evidence/feat-workspace-tables/`.
- [ ] **Step 7:** Commit the evidence, then run `atlas-reviewer` over the whole diff.

---

## Self-review

**Spec coverage:** client ✓T1 · dates/late-filing ✓T2 · whitelist+PDF requirement ✓T3,T5 · issuer resolution ✓T4 · magic bytes ✓T6 · sequential windows + layering test ✓T7 · schema incl. `maya_report_id` identity fix ✓T8 · directory script + coverage caveat ✓T9 · ingest keyed by report id + company auto-creation ✓T10 · attach endpoint ✓T11 · intake merge + honest failure flags ✓T12 · prompt rewrite + i18n + client ✓T13 · live verification incl. bidi ✓T14. Deferred queue is a spec note requiring no task; it holds because every call goes through `mayaGet` (T1).

**Placeholders:** none — every step names files, signatures or assertions.

**Type consistency:** `RemoteSource` is defined once (T5) and consumed unchanged by T10/T11/T12. `MayaResult`/`MayaFailure` defined in T1, used by T6/T7/T10. `IssuerRow` (T4) matches the `maya_issuers` columns (T8).
