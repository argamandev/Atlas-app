# Documents catalog — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A company's documents section lists the years it filed in, a year opens to its periods, a period opens to its artifacts, and clicking one lands in the same viewer a live call uses — with a back that returns to where the user was.

**Architecture:** The catalog *lists* live from MAYA (nothing stored) and *stores* one PDF when a user opens it, through the existing `ingestFiling` → `ingestDocument` path. All selection logic is pure and tested; the UI never queries a table and never learns the storage shape. A second entrance to `LiveTranscriptView` serves periods Atlas holds no transcript for.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase · Tailwind · vitest · pdf.js (committed `public/pdf.min.mjs`)

**Spec:** `docs/superpowers/specs/2026-08-09-documents-catalog-design.md`

## Global Constraints

- **NO NEW TABLE AND NO NEW COLUMN.** If a step appears to need schema, stop and ask. The database is shared with production Timlul under an additive-only law.
- **No stub content, ever.** A failed fetch says it failed. Never render success UI for content the server dropped (`rules/app.md`).
- **The UI holds no knowledge of the storage shape** — no direct `company_documents` queries from a component; a document is identified by `maya_report_id` (MAYA's stable id), not our row uuid.
- **Every API handler requires a user:** `const userId = await getRequestUserId(req)` then `if (!userId) return unauthorized()` (`src/lib/auth.ts`). `apiAuthBoundary.test.ts` fails the battery otherwise.
- **Never trust a URL from the client.** A PDF URL is always re-derived server-side from the MAYA listing by `mayaReportId` — never accepted as a request parameter.
- **Dictionary parity is compiler-enforced** — every new key goes into BOTH `src/lib/i18n/dictionaries/he.ts` and `en.ts`.
- **RTL:** Latin numerals/tickers get `font-mono-num` + `dir="ltr"`; a line mixing Hebrew and Latin gets `<bdi>` per run, never `dir` on the mixed line.
- **TZ test runs go through PowerShell, never Git Bash** — a `TZ=` value containing a slash is silently dropped by MSYS path conversion, so `TZ=America/New_York npm test` runs in `Asia/Jerusalem` and prints a false green.
- Dev server: `npm run dev -- -p 3003` (Lane M's port). **Never run `npm run build` while it is up in this checkout.**

---

## File structure

**Create**
- `src/lib/company/documentCatalog.ts` — pure: filter → select → group into years/periods. No I/O.
- `src/lib/company/documentCatalog.test.ts`
- `src/lib/maya/catalogCache.ts` — TTL cache for a company-year listing.
- `src/app/api/companies/[id]/filings/route.ts` — GET a year's period tree.
- `src/app/api/documents/open/route.ts` — POST: ensure a filing is stored, return its document id.
- `src/components/company/DocumentsTab.tsx` — the drill-down UI.
- `src/app/app/company/[id]/period/[period]/page.tsx` — the second entrance to the viewer.

**Modify**
- `src/lib/maya/events.ts` — `isAnnouncement()`; announcements stop counting as documents.
- `src/lib/maya/filings.ts` — `toRemoteSources` drops announcements.
- `src/components/company/CompanyView.tsx` — Reports tab renders `DocumentsTab`.
- `src/components/live/FacetPanes.tsx` — panes take an optional MAYA source; **stubs deleted**.
- `src/components/live/LiveTranscriptView.tsx` — `initialView`, `availableFacets`, `backHref`.
- `src/app/app/company/[id]/page.tsx` — accept `tab=reports`, `year`, `period`.
- `src/lib/transcripts.ts` — Israel day, not UTC day.
- `src/lib/i18n/dictionaries/{he,en}.ts` — new keys.

**Delete**
- `src/lib/live/call-stubs.ts` and `src/lib/live/call-stubs.test.ts`.

---

### Task 1: An announcement is not a document

A filing carrying event `113` (`מועד פרסום דוחות`) announces a *future* publication. It also carries the report's own event id, so `isDocumentEvent` currently classifies it as that report. Measured: 80 of 814 offered filings, 100% announcements. **This is live in Workspace's file picker too**, which is why the fix goes at the source rather than in the new screen.

**Files:**
- Modify: `src/lib/maya/events.ts`
- Modify: `src/lib/maya/filings.ts:44-46`
- Test: `src/lib/maya/events.test.ts`, `src/lib/maya/filings.test.ts`

**Interfaces:**
- Produces: `isAnnouncement(eventIds: number[]): boolean`

- [ ] **Step 1: Write the failing tests**

In `src/lib/maya/events.test.ts`:

```ts
import { isAnnouncement, isDocumentEvent } from './events'

describe('isAnnouncement', () => {
  it('flags a release-date notice that also carries its report event', () => {
    // אאורה #1741205 "מועד פרסום דוח רבעון 1 לשנת 2026 ושיחת ועידה ביום 27.5.26"
    expect(isAnnouncement([104, 113, 233])).toBe(true)
  })
  it('does not flag the report itself', () => {
    expect(isAnnouncement([104])).toBe(false)
  })
  it('does not flag a presentation', () => {
    // measured: 0 of 295 decks carry 113
    expect(isAnnouncement([104, 270])).toBe(false)
  })
})

describe('isDocumentEvent', () => {
  it('refuses an announcement wearing a report event id', () => {
    expect(isDocumentEvent([104, 113])).toBe(false)
  })
  it('still accepts the report', () => {
    expect(isDocumentEvent([104])).toBe(true)
  })
})
```

In `src/lib/maya/filings.test.ts`:

```ts
it('drops scheduling announcements from the catalog', () => {
  const out = toRemoteSources([
    filing({ mayaReportId: 1, events: [104, 113], title: 'מועד פרסום דוח רבעון 1 לשנת 2026' }),
    filing({ mayaReportId: 2, events: [104], title: 'דוח רבעון 1 לשנת 2026' }),
  ])
  expect(out.map((s) => s.mayaReportId)).toEqual([2])
})
```

(`filing()` is the existing local helper in that file; match its current shape.)

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/lib/maya/events.test.ts src/lib/maya/filings.test.ts`
Expected: FAIL — `isAnnouncement is not a function`, and `isDocumentEvent([104,113])` returns `true`.

- [ ] **Step 3: Implement**

In `src/lib/maya/events.ts`, after `isScheduleEvent`:

```ts
/**
 * A NOTICE THAT SOMETHING WILL BE PUBLISHED IS NOT THE THING.
 *
 * `113 מועד פרסום דוחות` announces a future filing and always carries the
 * event id of the report it is announcing — which is how it was being filed AS
 * that report. Measured 2026-08-09 across 20 issuers / 2022-2026: 80 of 814
 * offered filings carry it, every one a scheduling notice
 * ("מועד פרסום דוח רבעון 1 לשנת 2026 ושיחת ועידה ביום 27.5.26"), and none is a
 * presentation. The header of this file always said these belong to the
 * calendar rather than to a shelf; this is the sentence that enforces it.
 */
export function isAnnouncement(eventIds: number[]): boolean {
  return eventIds.includes(EVENT_RELEASE_DATE)
}
```

and change `isDocumentEvent`:

```ts
export function isDocumentEvent(eventIds: number[]): boolean {
  if (isAnnouncement(eventIds)) return false
  return eventIds.some((id) => DOCUMENT_EVENT_IDS.has(id))
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/maya/events.test.ts src/lib/maya/filings.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole battery** — this changes what Workspace offers.

Run: `npm test`
Expected: all pass. If a workspace-intake test asserted an announcement in its candidate list, that assertion was encoding the defect — update it and say so in the commit.

- [ ] **Step 6: Commit**

```bash
git add src/lib/maya/events.ts src/lib/maya/filings.ts src/lib/maya/events.test.ts src/lib/maya/filings.test.ts
git commit -m "fix(maya): a notice that a report is coming is not the report"
```

---

### Task 2: The catalog — filter, select, group

Pure. Given MAYA filings and the transcripts Atlas holds, produce the year → period → artifacts tree the UI renders.

**Files:**
- Create: `src/lib/company/documentCatalog.ts`
- Test: `src/lib/company/documentCatalog.test.ts`

**Interfaces:**
- Consumes: `RemoteSource` from `src/lib/maya/filings.ts` (`{sourceId, mayaReportId, issuerId, issuerName, title, publishedISO, docType, period, pdfUrl}`)
- Produces:
  ```ts
  export type CatalogArtifact = { mayaReportId: number; title: string; publishedISO: string; lang: 'he' | 'en' }
  export type CatalogPeriod = {
    period: string            // "Q1 2026" | "FY 2025"
    year: string              // "2026"
    report: CatalogArtifact | null
    slides: CatalogArtifact | null
    transcriptId: string | null
  }
  export function guessLang(title: string): 'he' | 'en'
  export function pickArtifact(candidates: RemoteSource[]): RemoteSource | null
  export function buildPeriods(sources: RemoteSource[], transcripts: {id: string; quarter: string}[]): CatalogPeriod[]
  export function periodsForYear(periods: CatalogPeriod[], year: string): CatalogPeriod[]
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { guessLang, pickArtifact, buildPeriods, periodsForYear } from './documentCatalog'
import type { RemoteSource } from '@/lib/maya/filings'

const src = (o: Partial<RemoteSource>): RemoteSource => ({
  sourceId: `maya:${o.mayaReportId ?? 1}`,
  mayaReportId: o.mayaReportId ?? 1,
  issuerId: 1,
  issuerName: 'X',
  title: o.title ?? 'דוח',
  publishedISO: o.publishedISO ?? '2026-01-01T00:00:00',
  docType: o.docType ?? 'report',
  period: o.period ?? 'Q1 2026',
  pdfUrl: 'https://mayafiles.tase.co.il/x.pdf',
})

describe('guessLang', () => {
  it('reads Hebrew from the title', () => {
    expect(guessLang('דוח רבעון 1 לשנת 2026')).toBe('he')
  })
  it('reads English from the title', () => {
    expect(guessLang('Board of Directors Report & Consolidated Financial Statements')).toBe('en')
  })
})

describe('pickArtifact', () => {
  it('prefers Hebrew over the English edition of one report', () => {
    // אלוני חץ Q1 2026, measured: both exist, English published LATER
    const he = src({ mayaReportId: 1742389, title: 'דוח רבעון 1 לשנת 2026', publishedISO: '2026-05-20T00:00:00' })
    const en = src({ mayaReportId: 1744011, title: 'Board of Directors Report', publishedISO: '2026-05-27T00:00:00' })
    expect(pickArtifact([en, he])?.mayaReportId).toBe(1742389)
  })

  it('prefers the correction when both are Hebrew', () => {
    // סלקום Q1 2026 "דוח רבעון 1 לשנת 2026 - תיקון דוח"
    const original = src({ mayaReportId: 1, title: 'דוח רבעון 1 לשנת 2026', publishedISO: '2026-05-18T00:00:00' })
    const fixed = src({ mayaReportId: 2, title: 'דוח רבעון 1 לשנת 2026 - תיקון דוח', publishedISO: '2026-05-20T00:00:00' })
    expect(pickArtifact([original, fixed])?.mayaReportId).toBe(2)
  })

  it('returns null for nothing', () => {
    expect(pickArtifact([])).toBeNull()
  })
})

describe('buildPeriods', () => {
  it('pairs a report and a deck under one period', () => {
    const out = buildPeriods(
      [
        src({ mayaReportId: 1, docType: 'report', period: 'Q1 2026' }),
        src({ mayaReportId: 2, docType: 'slides', period: 'Q1 2026', title: 'מצגת' }),
      ],
      []
    )
    expect(out).toHaveLength(1)
    expect(out[0].report?.mayaReportId).toBe(1)
    expect(out[0].slides?.mayaReportId).toBe(2)
    expect(out[0].transcriptId).toBeNull()
  })

  it('DROPS a standalone deck whose period is a bare year', () => {
    // 115 of 295 measured decks — company presentations, the founder's "later" bucket
    const out = buildPeriods([src({ mayaReportId: 9, docType: 'slides', period: '2024', title: 'מצגת שוק ההון' })], [])
    expect(out).toEqual([])
  })

  it('attaches a transcript we hold to its period', () => {
    const out = buildPeriods([src({ mayaReportId: 1, period: 'Q2 2025' })], [{ id: 't-7', quarter: 'Q2 2025' }])
    expect(out[0].transcriptId).toBe('t-7')
  })

  it('keeps a period that has only a report', () => {
    const out = buildPeriods([src({ mayaReportId: 1, period: 'Q3 2025' })], [])
    expect(out[0].report?.mayaReportId).toBe(1)
    expect(out[0].slides).toBeNull()
  })

  it('orders a year newest period first: FY, Q3, Q2, Q1', () => {
    const out = buildPeriods(
      [
        src({ mayaReportId: 1, period: 'Q1 2025' }),
        src({ mayaReportId: 2, period: 'FY 2025' }),
        src({ mayaReportId: 3, period: 'Q3 2025' }),
        src({ mayaReportId: 4, period: 'Q2 2025' }),
      ],
      []
    )
    expect(out.map((p) => p.period)).toEqual(['FY 2025', 'Q3 2025', 'Q2 2025', 'Q1 2025'])
  })
})

describe('periodsForYear', () => {
  it('returns only that fiscal year, whatever the publication year was', () => {
    const periods = buildPeriods(
      [src({ mayaReportId: 1, period: 'FY 2024', publishedISO: '2025-03-24T00:00:00' }), src({ mayaReportId: 2, period: 'Q1 2025' })],
      []
    )
    expect(periodsForYear(periods, '2024').map((p) => p.period)).toEqual(['FY 2024'])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/company/documentCatalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { RemoteSource } from '@/lib/maya/filings'

// ─────────────────────────────────────────────────────────────────────────────
// A COMPANY'S FILINGS, AS A DRILL-DOWN.
//
// Pure. The screen shows years → periods → artifacts, and every decision about
// WHICH filing fills a slot is made here so it can be tested without a network.
//
// A quarter legitimately offers more than one candidate a quarter of the time
// (measured 2026-08-09: 137 of 551 period/type keys) — a Hebrew and an English
// edition of one report, or a correction superseding the original. Both are
// versions of the same document, so one is chosen rather than both shown; the
// rule is stated in `pickArtifact` and tested against the real cases.
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogArtifact = {
  mayaReportId: number
  title: string
  publishedISO: string
  lang: 'he' | 'en'
}

export type CatalogPeriod = {
  period: string
  year: string
  report: CatalogArtifact | null
  slides: CatalogArtifact | null
  transcriptId: string | null
}

/** Hebrew if the title contains a Hebrew letter. Titles are the only signal MAYA gives. */
export function guessLang(title: string): 'he' | 'en' {
  return /[֐-׿]/.test(title) ? 'he' : 'en'
}

/**
 * HEBREW FIRST, THEN NEWEST.
 *
 * Hebrew first because Atlas reads Hebrew and the English edition is the SAME
 * document — not a second one being hidden. Newest second because a correction
 * ("תיקון דוח") supersedes what it corrects, and MAYA publishes it later.
 * Deliberately not `isCorrection`: that flag marks the corrected filing, while
 * publication order settles every ordering case including it.
 */
export function pickArtifact(candidates: RemoteSource[]): RemoteSource | null {
  if (candidates.length === 0) return null
  const sorted = [...candidates].sort((a, b) => {
    const la = guessLang(a.title) === 'he' ? 0 : 1
    const lb = guessLang(b.title) === 'he' ? 0 : 1
    if (la !== lb) return la - lb
    return a.publishedISO < b.publishedISO ? 1 : a.publishedISO > b.publishedISO ? -1 : 0
  })
  return sorted[0] ?? null
}

const toArtifact = (s: RemoteSource): CatalogArtifact => ({
  mayaReportId: s.mayaReportId,
  title: s.title,
  publishedISO: s.publishedISO,
  lang: guessLang(s.title),
})

/** `"Q1 2026"` → `{ rank, year }`. A bare year has no rank and is not a period. */
function parsePeriod(period: string): { rank: number; year: string } | null {
  const m = period.match(/^(FY|Q1|Q2|Q3)\s+((?:19|20)\d{2})$/)
  if (!m) return null
  const rank = { Q1: 1, Q2: 2, Q3: 3, FY: 4 }[m[1] as 'FY' | 'Q1' | 'Q2' | 'Q3']
  return { rank, year: m[2] }
}

/**
 * A STANDALONE COMPANY DECK IS NOT A QUARTERLY ONE, and this is where that is
 * enforced. `periodFor` gives a filing tagged only `270 מצגת` the BARE YEAR as
 * its period — 115 of 295 measured decks. Those are "מצגת שוק ההון" filings
 * published outside a reporting cycle; the founder placed them in the same
 * later bucket as announcements and webinars. Dropping them here also means
 * every stored deck carries a real period label, which is what keeps the
 * `(company, quarter, doc_type)` row key from collapsing a year's decks into
 * one row.
 */
export function buildPeriods(
  sources: RemoteSource[],
  transcripts: { id: string; quarter: string }[]
): CatalogPeriod[] {
  const byPeriod = new Map<string, RemoteSource[]>()
  for (const s of sources) {
    if (!parsePeriod(s.period)) continue
    byPeriod.set(s.period, [...(byPeriod.get(s.period) ?? []), s])
  }

  const out: CatalogPeriod[] = []
  for (const [period, list] of Array.from(byPeriod.entries())) {
    const parsed = parsePeriod(period)!
    const report = pickArtifact(list.filter((s) => s.docType === 'report'))
    const slides = pickArtifact(list.filter((s) => s.docType === 'slides'))
    out.push({
      period,
      year: parsed.year,
      report: report ? toArtifact(report) : null,
      slides: slides ? toArtifact(slides) : null,
      transcriptId: transcripts.find((t) => t.quarter === period)?.id ?? null,
    })
  }

  return out.sort((a, b) => {
    if (a.year !== b.year) return a.year < b.year ? 1 : -1
    return parsePeriod(b.period)!.rank - parsePeriod(a.period)!.rank
  })
}

export function periodsForYear(periods: CatalogPeriod[], year: string): CatalogPeriod[] {
  return periods.filter((p) => p.year === year)
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/company/documentCatalog.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/company/documentCatalog.ts src/lib/company/documentCatalog.test.ts
git commit -m "feat(catalog): years, periods and which filing fills a slot"
```

---

### Task 3: The listing route — one year, cached

**Files:**
- Create: `src/lib/maya/catalogCache.ts`
- Create: `src/app/api/companies/[id]/filings/route.ts`
- Test: `src/lib/maya/catalogCache.test.ts`

**Interfaces:**
- Produces: `cacheGet<T>(key: string): T | null`, `cacheSet<T>(key: string, value: T): void`, `cacheClear(): void`, `CATALOG_TTL_MS`
- Produces: `GET /api/companies/[id]/filings?year=YYYY` → `{ year, periods: CatalogPeriod[] }` · 401 · 400 · 502

- [ ] **Step 1: Write the failing cache test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cacheGet, cacheSet, cacheClear, CATALOG_TTL_MS } from './catalogCache'

describe('catalogCache', () => {
  beforeEach(() => cacheClear())

  it('returns what was stored', () => {
    cacheSet('1460:2025', [{ period: 'Q1 2025' }])
    expect(cacheGet('1460:2025')).toEqual([{ period: 'Q1 2025' }])
  })

  it('misses a key never stored', () => {
    expect(cacheGet('nope')).toBeNull()
  })

  it('expires after the TTL', () => {
    vi.useFakeTimers()
    cacheSet('k', 1)
    vi.advanceTimersByTime(CATALOG_TTL_MS + 1)
    expect(cacheGet('k')).toBeNull()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/maya/catalogCache.test.ts` — FAIL, module not found.

- [ ] **Step 3: Implement the cache**

```ts
// A company-year listing, held briefly in process memory.
//
// THE RATE LIMIT IS THE BINDING CONSTRAINT, not the latency: 10 requests per 2
// seconds is ONE budget for our whole key, shared by every user and every
// consumer (`lib/maya/client.ts` is the single chokepoint). Opening a year
// costs up to two requests, so without this a second analyst opening the same
// company pays again for bytes we just fetched.
//
// Process memory, deliberately: it is a cache, not a store. A deploy or a
// second instance simply re-fetches, and nothing in the product is allowed to
// depend on a hit.

export const CATALOG_TTL_MS = 5 * 60 * 1000

type Entry = { at: number; value: unknown }
const store = new Map<string, Entry>()

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CATALOG_TTL_MS) {
    store.delete(key)
    return null
  }
  return hit.value as T
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, { at: Date.now(), value })
}

export function cacheClear(): void {
  store.clear()
}
```

- [ ] **Step 4: Run the cache tests** — `npx vitest run src/lib/maya/catalogCache.test.ts` → PASS.

- [ ] **Step 5: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { getCompany } from '@/lib/db/companies'
import { listCompanyTranscripts } from '@/lib/transcripts'
import { listDisclosures } from '@/lib/maya/disclosures'
import { toRemoteSources } from '@/lib/maya/filings'
import { describeFailure } from '@/lib/maya/types'
import { cacheGet, cacheSet } from '@/lib/maya/catalogCache'
import { buildPeriods, periodsForYear } from '@/lib/company/documentCatalog'
import type { RemoteSource } from '@/lib/maya/filings'

// GET /api/companies/[id]/filings?year=2025 — one fiscal year of a company's
// MAYA catalog, as the drill-down's periods. NOTHING IS STORED HERE: the list
// is live, and a PDF is kept only when a user opens it (/api/documents/open).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const year = Number(req.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return NextResponse.json({ error: 'year required' }, { status: 400 })
  }

  const company = await getCompany(params.id)
  if (!company?.taseIssuerId) {
    return NextResponse.json({ error: 'company has no MAYA issuer' }, { status: 404 })
  }

  const key = `${company.taseIssuerId}:${year}`
  let sources = cacheGet<RemoteSource[]>(key)
  if (!sources) {
    const res = await listDisclosures({ issuerId: Number(company.taseIssuerId), fromYear: year, toYear: year })
    if (!res.ok) {
      // A PARTIAL CATALOG PRESENTED AS COMPLETE is the failure this refuses:
      // "no 2024 annual report" must never be produced out of a network blip.
      return NextResponse.json({ error: describeFailure(res.failure) }, { status: 502 })
    }
    sources = toRemoteSources(res.data)
    cacheSet(key, sources)
  }

  const transcripts = await listCompanyTranscripts(params.id)
  const periods = buildPeriods(
    sources,
    transcripts.map((t) => ({ id: t.id, quarter: t.quarter }))
  )
  return NextResponse.json({ year: String(year), periods: periodsForYear(periods, String(year)) })
}
```

If `getCompany` does not expose `taseIssuerId`, add it to that module's row mapping (it is already selected in `companies`); do not query the table from the route.

- [ ] **Step 6: Run the battery** — the API auth guard must accept this route.

Run: `npm test`
Expected: PASS, including `apiAuthBoundary.test.ts` (the handler resolves a user).

- [ ] **Step 7: Commit**

```bash
git add src/lib/maya/catalogCache.ts src/lib/maya/catalogCache.test.ts "src/app/api/companies/[id]/filings/route.ts" src/lib/db/companies.ts
git commit -m "feat(api): a company's filing year, listed live and cached briefly"
```

---

### Task 4: Open on demand — the ingestion door

**Files:**
- Create: `src/app/api/documents/open/route.ts`
- Test: `src/lib/documents/openFiling.test.ts`
- Create: `src/lib/documents/openFiling.ts` (the pure decision the route delegates to)

**Interfaces:**
- Produces: `needsIngest(stored: {mayaReportId: number | null} | null, requested: number): boolean`
- Produces: `POST /api/documents/open` body `{ companyId: string; mayaReportId: number; year: number }` → `{ documentId, pageCount }` · 401 · 400 · 404 · 502

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { needsIngest } from './openFiling'

describe('needsIngest', () => {
  it('ingests when nothing is stored for the period', () => {
    expect(needsIngest(null, 1726974)).toBe(true)
  })
  it('serves the stored row when it IS the filing that was clicked', () => {
    expect(needsIngest({ mayaReportId: 1726974 }, 1726974)).toBe(false)
  })
  it('RE-INGESTS when the stored row is a different filing', () => {
    // (company, quarter, doc_type) is unique, so a Hebrew/English pair or a
    // correction shares one row — the last one opened wins. Without this the
    // user clicks one document and is shown another.
    expect(needsIngest({ mayaReportId: 1742389 }, 1744011)).toBe(true)
  })
  it('re-ingests a row that predates maya_report_id', () => {
    // one live row is source='manual' with a null maya_report_id
    expect(needsIngest({ mayaReportId: null }, 1744011)).toBe(true)
  })
})
```

- [ ] **Step 2: Run and watch it fail** — `npx vitest run src/lib/documents/openFiling.test.ts` → module not found.

- [ ] **Step 3: Implement the decision**

```ts
/**
 * WHETHER THE STORED ROW IS THE DOCUMENT THE USER JUST CLICKED.
 *
 * `company_documents` is unique on (company_id, quarter, doc_type) and that
 * constraint cannot be removed — the database is shared with production
 * Timlul. So one period and type keeps ONE row: the most recently pulled
 * filing. Bytes never collide (storage is keyed by maya_report_id) but rows do.
 *
 * The guard is therefore identity, not existence: serve the stored row only
 * when it points at the filing that was clicked, and otherwise fetch that
 * filing and overwrite the pointer. The cost is one re-fetch when a user
 * alternates between two editions of one period; the alternative is showing a
 * document nobody asked for, silently.
 */
export function needsIngest(stored: { mayaReportId: number | null } | null, requested: number): boolean {
  if (!stored) return true
  return stored.mayaReportId !== requested
}
```

- [ ] **Step 4: Run the test** — PASS.

- [ ] **Step 5: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { getCompany } from '@/lib/db/companies'
import { getDocumentsFor, getDocumentByMayaReportId } from '@/lib/documents'
import { listDisclosures } from '@/lib/maya/disclosures'
import { toRemoteSources } from '@/lib/maya/filings'
import { ingestFiling } from '@/lib/maya/ingestFiling'
import { describeFailure } from '@/lib/maya/types'
import { cacheGet, cacheSet } from '@/lib/maya/catalogCache'
import { needsIngest } from '@/lib/documents/openFiling'
import type { RemoteSource } from '@/lib/maya/filings'

// POST /api/documents/open — the user clicked a filing. Store it if we do not
// already hold exactly it, then hand back the document id the viewer renders.
//
// THE PDF URL IS NEVER TAKEN FROM THE REQUEST. The client sends a
// mayaReportId; the URL is re-derived from MAYA's own listing here. Accepting a
// url would make this a fetch-anything proxy running with the service role.
export async function POST(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const body = (await req.json().catch(() => null)) as
    | { companyId?: string; mayaReportId?: number; year?: number }
    | null
  const companyId = body?.companyId
  const mayaReportId = Number(body?.mayaReportId)
  const year = Number(body?.year)
  if (!companyId || !Number.isInteger(mayaReportId) || !Number.isInteger(year)) {
    return NextResponse.json({ error: 'companyId, mayaReportId and year required' }, { status: 400 })
  }

  const company = await getCompany(companyId)
  if (!company?.taseIssuerId) return NextResponse.json({ error: 'unknown company' }, { status: 404 })

  const key = `${company.taseIssuerId}:${year}`
  let sources = cacheGet<RemoteSource[]>(key)
  if (!sources) {
    const res = await listDisclosures({ issuerId: Number(company.taseIssuerId), fromYear: year, toYear: year })
    if (!res.ok) return NextResponse.json({ error: describeFailure(res.failure) }, { status: 502 })
    sources = toRemoteSources(res.data)
    cacheSet(key, sources)
  }

  const source = sources.find((s) => s.mayaReportId === mayaReportId)
  if (!source) return NextResponse.json({ error: 'filing not in this company’s catalog' }, { status: 404 })

  const held = await getDocumentByMayaReportId(mayaReportId)
  if (held && held.companyId === companyId) {
    return NextResponse.json({ documentId: held.id, pageCount: held.pageCount })
  }

  const existing = (await getDocumentsFor(companyId, source.period)).find((d) => d.docType === source.docType)
  if (existing && !needsIngest({ mayaReportId: existing.mayaReportId }, mayaReportId)) {
    return NextResponse.json({ documentId: existing.id, pageCount: existing.pageCount })
  }

  try {
    const { documentId, pageCount } = await ingestFiling({
      source,
      companyId,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    })
    return NextResponse.json({ documentId, pageCount })
  } catch (e) {
    console.error('[POST /api/documents/open] ingest failed', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

`getDocumentsFor` must also return `mayaReportId`, and a new `getDocumentByMayaReportId(id)` is added — both in `src/lib/documents/index.ts`, adding `maya_report_id` to the existing `select` and to `CompanyDocument`. `maya_report_id` carries its own unique index, so the lookup is a point read.

- [ ] **Step 6: Run the battery** — `npm test`. Expected PASS incl. the auth boundary.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/documents/open/route.ts src/lib/documents/openFiling.ts src/lib/documents/openFiling.test.ts src/lib/documents/index.ts
git commit -m "feat(api): opening a filing stores it, and never serves one you did not click"
```

---

### Task 5: The documents tab

**Files:**
- Create: `src/components/company/DocumentsTab.tsx`
- Modify: `src/components/company/CompanyView.tsx:306-380` (replace the Reports tab body), `:100-107` (delete the now-unused `byYear`/`artifactBtn` if nothing else uses them)
- Modify: `src/lib/i18n/dictionaries/he.ts`, `src/lib/i18n/dictionaries/en.ts`

**Interfaces:**
- Consumes: `GET /api/companies/[id]/filings?year=` → `{ year, periods: CatalogPeriod[] }`
- Produces: `<DocumentsTab companyId year period />` where `year`/`period` are the initially-open drill-down restored from the URL.

- [ ] **Step 1: Dictionary keys, both locales**

`he.ts` under `company`:

```ts
documents: 'מסמכים',
documentsHint: 'בחרו שנה כדי לראות את הדוחות והמצגות שפורסמו',
yearLoading: 'טוען מסמכים מהבורסה…',
yearEmpty: 'לא נמצאו דוחות לשנה זו',
yearFailed: 'לא הצלחנו לטעון את השנה הזו',
retry: 'נסו שוב',
annual: 'שנתי',
openingDoc: 'מביא את המסמך מהבורסה…',
openFailed: 'לא הצלחנו להביא את המסמך',
```

`en.ts` under `company`:

```ts
documents: 'Documents',
documentsHint: 'Pick a year to see the reports and presentations filed in it',
yearLoading: 'Loading filings from TASE…',
yearEmpty: 'No filings found for this year',
yearFailed: 'We could not load this year',
retry: 'Try again',
annual: 'Annual',
openingDoc: 'Fetching the document from TASE…',
openFailed: 'We could not fetch this document',
```

- [ ] **Step 2: Write the component**

`'use client'`. State: `openYear: string | null`, `byYear: Record<string, {status:'idle'|'loading'|'ready'|'error'; periods: CatalogPeriod[]}>`, `openPeriod: string | null`.

Structure, following the existing year-card markup in `CompanyView` so it looks native:

1. **Years** — `YEARS = range(currentYear, 2015)` rendered as the existing year cards, each a `<button>` with the year in `font-mono-num` + `dir="ltr"`. Clicking toggles `openYear` and fetches once (`status==='idle'`).
   Mount effect: open the newest year automatically.
2. **A year's body** — `loading` → `dict.company.yearLoading`; `error` → `dict.company.yearFailed` + a retry button; `ready` + zero periods → `dict.company.yearEmpty`; otherwise the period rows.
3. **Period row** — label `FY 2025` renders as `{dict.company.annual} 2025`, quarters as `Q1 2025`, both `font-mono-num` `dir="ltr"`. Clicking toggles `openPeriod`.
4. **Artifacts** (shown when the period is open) — one link per artifact that exists, nothing rendered for one that does not:
   - transcript → `/app/live/${transcriptId}`
   - report → `/app/company/${companyId}/period/${encodeURIComponent(period)}?doc=${report.mayaReportId}`
   - slides → same route with `?doc=${slides.mayaReportId}`
   Each shows its MAYA title in `<bdi>` (titles are Hebrew or English and sit beside Latin dates), and its publication date via `formatDate(publishedISO, locale)` — which pins Israel time.

- [ ] **Step 3: Wire it into CompanyView**

Replace the `tab === 'reports'` body with `<DocumentsTab companyId={company.id} year={initialYear} period={initialPeriod} />`, and change the tab's label to `dict.company.documents`. **Keep the tab key `'reports'`** — renaming churns existing links for a string no user sees.

- [ ] **Step 4: Typecheck and battery**

Run: `npx tsc --noEmit` then `npm test`
Expected: exit 0 · all pass. Dictionary parity is compiler-enforced, so a missing `en` key fails here.

- [ ] **Step 5: Commit**

```bash
git add src/components/company/DocumentsTab.tsx src/components/company/CompanyView.tsx src/lib/i18n/dictionaries/he.ts src/lib/i18n/dictionaries/en.ts
git commit -m "feat(company): documents by year, fetched when a year is opened"
```

---

### Task 6: The panes read a real filing — and the invented ones die

**Files:**
- Modify: `src/components/live/FacetPanes.tsx` (`SlidesPane` :100-153, `ReportPane` :154-265)
- Delete: `src/lib/live/call-stubs.ts`, `src/lib/live/call-stubs.test.ts`

**Interfaces:**
- Produces: `SlidesPane` and `ReportPane` both accept `companyId`, `quarter`, and a new optional `source?: { mayaReportId: number; year: number; title: string }`.

- [ ] **Step 1: Give both panes one document-resolution path**

Add to `FacetPanes.tsx`, used by both panes:

```ts
// HOW A PANE FINDS ITS DOCUMENT, and the only two ways it may end:
// a real document, or a stated failure. There is no third branch — the stub
// that used to sit here rendered invented content for a real issuer.
function useDocument(
  docType: 'report' | 'slides',
  companyId?: string | null,
  quarter?: string | null,
  source?: { mayaReportId: number; year: number } | null
) {
  const [doc, setDoc] = useState<{ id: string; title: string; pageCount: number } | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    setDoc(null)
    if (!companyId) return setState('idle')
    let dead = false
    setState('loading')

    const done = (d: { id: string; title: string; pageCount: number } | null) => {
      if (dead) return
      setDoc(d)
      setState(d ? 'ready' : 'idle')
    }

    // Opened from the catalog: fetch-and-store the exact filing that was clicked.
    if (source) {
      fetch('/api/documents/open', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, mayaReportId: source.mayaReportId, year: source.year }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => done({ id: j.documentId, title: '', pageCount: j.pageCount }))
        .catch(() => !dead && setState('error'))
      return () => {
        dead = true
      }
    }

    // Opened from a call: whatever we already hold for this company + period.
    if (!quarter) return setState('idle')
    fetch(`/api/documents?companyId=${encodeURIComponent(companyId)}&quarter=${encodeURIComponent(quarter)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => done(j?.documents?.find((x: { docType: string }) => x.docType === docType) ?? null))
      .catch(() => !dead && setState('error'))
    return () => {
      dead = true
    }
  }, [docType, companyId, quarter, source?.mayaReportId, source?.year])

  return { doc, state }
}
```

- [ ] **Step 2: Rewrite `SlidesPane`**

Delete the `slideStubs()` call, the slide-index state and the ‹ N › stub navigation. The body becomes the same three-state render `ReportPane` uses: `loading` → `dict.company.openingDoc`; `error` → `dict.company.openFailed`; `ready` → `<PdfViewer documentId={doc.id} …/>` (the same props `ReportPane` passes, since a deck is a PDF); no document → the pane's existing empty state.

- [ ] **Step 3: Rewrite `ReportPane`'s resolution** to use `useDocument('report', …)`, deleting `const report = reportStub()` and every reference to it.

- [ ] **Step 4: Delete the stubs**

```bash
git rm src/lib/live/call-stubs.ts src/lib/live/call-stubs.test.ts
```

- [ ] **Step 5: Prove they are gone**

Run: `git grep -n "slideStubs\|reportStub\|call-stubs" -- src`
Expected: **no output.** If `testRegistry.test.ts` tracks the deleted test file, update its registry in the same commit.

- [ ] **Step 6: Typecheck + battery** — `npx tsc --noEmit && npm test`. Expected: exit 0, all pass.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/live/FacetPanes.tsx src/lib/live
git commit -m "fix(live): the invented slides are deleted, not replaced"
```

---

### Task 7: The second entrance to the viewer

**Files:**
- Create: `src/app/app/company/[id]/period/[period]/page.tsx`
- Modify: `src/components/live/LiveTranscriptView.tsx:88-95` (initial view/facets), `:236-243` (back target), `:509-525` (back label)

**Interfaces:**
- Produces: `<LiveTranscriptView call initialSeek initialSegmentId initialView? availableFacets? backHref? documentSources? />`
  - `initialView?: 'single' | 'multi'` (default `'single'`)
  - `availableFacets?: Facet[]` (default `['transcript','slides','report']`)
  - `backHref?: string` (default: the existing company-overview behaviour)
  - `documentSources?: { report?: {mayaReportId:number; year:number}; slides?: {mayaReportId:number; year:number} }`

- [ ] **Step 1: Widen the viewer's props**

```ts
const [view, setView] = useState<'single' | 'multi'>(initialView ?? 'single')
const [multiFacets, setMultiFacets] = useState<Set<Facet>>(() => new Set<Facet>(availableFacets ?? ['transcript', 'slides', 'report']))
```

Render a facet chip only for a facet in `availableFacets`, and in `onTab('overview')` prefer `backHref`:

```ts
function onTab(key: string) {
  if (key === 'overview') {
    if (backHref) router.push(backHref)
    else if (call.companyId) router.push(`/app/company/${call.companyId}`)
    else router.back()
    return
  }
  setTab(key)
}
```

Pass `documentSources.report` / `.slides` into `ReportPane` / `SlidesPane` as their `source`.

- [ ] **Step 2: Write the period page**

```tsx
import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app/AppPage'
import { LiveTranscriptView } from '@/components/live/LiveTranscriptView'
import { getCompany } from '@/lib/db/companies'
import { listCompanyTranscripts } from '@/lib/transcripts'
import { loadCompletedCall } from '@/lib/live/loadCall'
import type { LiveCall } from '@/lib/live/loadCall'

export const dynamic = 'force-dynamic'

// A PERIOD, NOT A CALL. `/app/live/[id]` keys on a transcript id, and a 2024
// period holding a report and a deck has none — this is the second door into
// the same viewer, and the reason the catalog can close the loop.
export default async function PeriodPage({
  params,
  searchParams,
}: {
  params: { id: string; period: string }
  searchParams: { doc?: string; year?: string }
}) {
  const period = decodeURIComponent(params.period)
  const company = await getCompany(params.id)
  if (!company) notFound()

  const transcripts = await listCompanyTranscripts(params.id)
  const held = transcripts.find((t) => t.quarter === period)
  const year = period.match(/((?:19|20)\d{2})$/)?.[1]
  if (!year) notFound()

  // With a transcript we ARE the existing call page; without one the viewer
  // opens on the documents alone — two panes, and no third pane apologising
  // for a recording that does not exist (founder decision 2026-08-09).
  const call: LiveCall | null = held
    ? await loadCompletedCall(held.id)
    : {
        id: `period:${params.id}:${period}`,
        title: `${company.displayName} — ${period}`,
        companyName: company.displayName,
        companyNameEn: company.nameEn ?? null,
        logoUrl: company.logoUrl ?? null,
        quarter: period,
        date: '',
        isLive: false,
        audioUrl: null,
        companyId: company.id,
        transcript: { segments: [], durationSec: 0, hasWordTimings: false },
      }
  if (!call) notFound()

  const docId = Number(searchParams.doc)
  const src = Number.isInteger(docId) ? { mayaReportId: docId, year: Number(year) } : undefined

  return (
    <AppPage>
      <LiveTranscriptView
        call={call}
        initialView="multi"
        availableFacets={held ? ['transcript', 'slides', 'report'] : ['slides', 'report']}
        backHref={`/app/company/${params.id}?tab=reports&year=${year}&period=${encodeURIComponent(period)}`}
        documentSources={{ report: src, slides: src }}
      />
    </AppPage>
  )
}
```

**Note on `documentSources`:** the clicked `doc` identifies one filing; the pane whose `docType` it is not will resolve nothing from it. Refine in step 3 by looking the period's artifacts up server-side (`buildPeriods` over the cached listing) and passing the right id to each pane, so opening the report also fills the deck pane.

- [ ] **Step 3: Resolve BOTH artifacts server-side**

In the page, call the same listing path the API route uses (`cacheGet` → `listDisclosures` → `toRemoteSources` → `buildPeriods`) and find this period, then pass `{ report: {mayaReportId, year}, slides: {mayaReportId, year} }` from it. A listing failure renders the viewer with no sources, and each pane states its own failure — never a stub.

- [ ] **Step 4: Typecheck + battery** — `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Load the route in a browser** — a green build is not evidence that a page renders (`rules/app.md`: a Server Component passing a function to a Client Component 500s with every gate green).

Run `npm run dev -- -p 3003`, open `/app/company/<uuid>/period/FY%202025`, and confirm a **200 in the dev-server log** for that exact URL.

- [ ] **Step 6: Commit**

```bash
git add "src/app/app/company/[id]/period/[period]/page.tsx" src/components/live/LiveTranscriptView.tsx src/components/live/FacetPanes.tsx
git commit -m "feat(company): a period opens the reader, with or without a transcript"
```

---

### Task 8: The way back, and a date that was a day early

**Files:**
- Modify: `src/app/app/company/[id]/page.tsx:34-36`
- Modify: `src/lib/transcripts.ts:33`
- Test: `src/lib/transcripts.test.ts` (create if absent; register it if `testRegistry.test.ts` requires it)

**Interfaces:**
- Consumes: `israelDayKey` from `src/lib/i18n/format.ts`

- [ ] **Step 1: Write the failing date test**

```ts
import { describe, it, expect } from 'vitest'
import { israelDayKey } from '@/lib/i18n/format'

describe('a transcript row date', () => {
  it('uses the Israel day, not the UTC day', () => {
    // created 01:30 Israel on 2026-08-10 == 22:30 UTC on 2026-08-09
    expect(israelDayKey('2026-08-09T22:30:00Z')).toBe('2026-08-10')
    expect('2026-08-09T22:30:00Z'.split('T')[0]).toBe('2026-08-09') // the old behaviour
  })
})
```

- [ ] **Step 2: Run it** — `npx vitest run src/lib/transcripts.test.ts`. It passes only once `israelDayKey` is imported correctly; the second assertion documents what was wrong.

- [ ] **Step 3: Fix the mapping**

`src/lib/transcripts.ts:33`, replacing `(row.created_at as string).split('T')[0]`:

```ts
date: fd?.date ?? israelDayKey(row.created_at as string),
```

- [ ] **Step 4: Accept the tab and restore the drill-down**

`src/app/app/company/[id]/page.tsx`:

```ts
const initialTab =
  searchParams.tab === 'quotes' || searchParams.tab === 'calls' || searchParams.tab === 'reports'
    ? searchParams.tab
    : 'overview'
```

and pass `year={searchParams.year}` / `period={searchParams.period}` through `CompanyView` into `DocumentsTab`, which opens that year and period on mount.

- [ ] **Step 5: Battery in both timezones — from PowerShell**

```powershell
npm test
$env:TZ='UTC'; node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"; npm test
```

Expected: identical pass counts, and the printed zone must read `UTC` on the second run. **A `TZ=` prefix in Git Bash is silently dropped — if you did not see the zone printed, the run proves nothing.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/transcripts.ts src/lib/transcripts.test.ts "src/app/app/company/[id]/page.tsx" src/components/company/CompanyView.tsx
git commit -m "fix(company): back lands where you left, and a 01:00 transcript stops reading yesterday"
```

---

### Task 9: Verification — drive the states, do not reason about them

**Files:**
- Create: `docs/evidence/feat-documents-catalog/2026-08-09-verification.md`

- [ ] **Step 1: Full battery, both timezones, from PowerShell** — record the counts and the printed zone for each run.

- [ ] **Step 2: `npx tsc --noEmit`** — exit 0. Then stop the dev server and `npm run build` (never with the dev server up in this checkout).

- [ ] **Step 3: Drive nine states in a real browser, in BOTH locales**, through the founder's authenticated Chrome profile — an unauthenticated capture silently screenshots the login page. Assert the final URL, not just the pixels.

  1. Documents tab, newest year auto-opened
  2. A year that holds filings, opened
  3. A year that holds nothing → `yearEmpty`
  4. A period with report + deck + transcript
  5. A period with a report only
  6. A period with no transcript → **two panes, no transcript pane**
  7. A document being fetched → `openingDoc`
  8. A fetch that fails → `openFailed` (force it: open with a `doc` id absent from the catalog)
  9. Back → lands on the documents tab with that year and period still open

- [ ] **Step 4: Confirm the deletions are real**

Run: `git grep -n "slideStubs\|reportStub" -- src` → no output. Open a *live/finished call* view and confirm the Slides pane no longer shows the אפגלו slides.

- [ ] **Step 5: Console clean in both locales** — zero errors, and no React duplicate-key warnings from the period rows.

- [ ] **Step 6: Write the evidence file** stating for each screenshot what it does and does **not** show, then commit.

```bash
git add docs/evidence/feat-documents-catalog
git commit -m "docs(evidence): the catalog, driven state by state in both locales"
```

---

## Self-review notes

- **Spec coverage:** §1 catalog → Tasks 2,3,5 · §1 announcements → Task 1 · §2 route + two panes + back → Tasks 6,7,8 · §3 deletions → Task 6 · §4 storage guard → Task 4 · §5 verification → Task 9 · `transcripts.ts` → Task 8.
- **Not covered by design, restated here:** the year floor (2015) is a display constant in `DocumentsTab`; a company listed later shows clickable earlier years that resolve to `yearEmpty`, which is the accepted cost recorded as risk 2 in the spec.
- **Type consistency:** `CatalogPeriod`/`CatalogArtifact` (Task 2) are what the route returns (Task 3) and what the tab renders (Task 5); `{mayaReportId, year}` is the shape passed from the page (Task 7) to the panes (Task 6) to the open route (Task 4).
