# Workspace Slice 1 — The intake panel becomes real

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing "new workspace" opens the designed intake panel again, and describing what you want in plain Hebrew or English fills the shelf with real rows from the real corpus — or says plainly that it found nothing.

**Architecture:** A model turns the user's sentence into a structured `SourceRequest`. `findSources()` — the seam Maya later plugs into — ranks the corpus against it and returns both what matched and *why nothing did*, when nothing did. The panel's clarify questions are generated from that result instead of being hardcoded, a confirm list is added inside the clarify conversation (founder D5), and the approved selection is attached through the existing `POST /api/workspaces/[id]/items`.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase (user client, RLS load-bearing) · Gemini 3.5 Flash with the repo's existing GPT-4.1 fallback · `node:test` + `node:assert/strict` run through `tsx`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-workspace-experience-design.md`. Slice 1 is §6.
- **Branch:** `feat/workspace-tables`. Lane multiview, port 3003.
- **No migration in this slice.** `workspaces.layout` belongs to slice 2.
- **Every API route resolves a user or returns `unauthorized()`** — `src/lib/apiAuthBoundary.test.ts` fails the battery otherwise. The pattern is two lines: `const userId = await getRequestUserId(req)` / `if (!userId) return unauthorized()`. Workspace routes use `resolveUser(supabase)` + `unauthorized()`; match the neighbours in `src/app/api/workspaces/`.
- **Query through the USER'S client** (`createServerSupabase(cookies())`), never `supabaseAdmin`. RLS must stay load-bearing.
- **Tests are `node:test`, NOT vitest** — `import { test } from 'node:test'` + `import assert from 'node:assert/strict'`. Match `src/lib/workspace/present.test.ts`. A single file runs with `node --import tsx --test <path>`.
- **`package.json`'s `test` script is an explicit file list.** Every new `*.test.ts` must be added to it or it silently never runs — and `src/lib/testRegistry.test.ts` fails the battery if you forget.
- **Both locales.** Every new string lands in `src/lib/i18n/dictionaries/en.ts` AND `he.ts`; the `Dictionary` type makes a missing key a compile error.
- **Mixed Hebrew/Latin runs get `<bdi>` per run**, direction on the container — never `dir` on the mixed line (`.claude/rules/app.md`, 4 filed occurrences).
- **Degradation must be visible.** No fabricated results, no confident empty state over a failure.
- **Never `npm run build` while the :3003 dev server is up in this checkout.**

---

### Task 1: `SourceRequest` and the parser for the model's answer

The model returns JSON. This task is the pure, testable half — no network.

**Files:**
- Create: `src/lib/workspace/intake/types.ts`
- Create: `src/lib/workspace/intake/parseRequest.ts`
- Test: `src/lib/workspace/intake/parseRequest.test.ts`
- Modify: `package.json` (test file list)

**Interfaces:**
- Produces: `type SourceRequest`, `parseModelRequest(raw: string, fallbackText: string): SourceRequest`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workspace/intake/parseRequest.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseModelRequest } from './parseRequest'

test('reads a well-formed answer', () => {
  const r = parseModelRequest(
    '{"company":"תיגבור","fromYear":2024,"toYear":2026,"kinds":["transcript","document"]}',
    'raw text'
  )
  assert.equal(r.company, 'תיגבור')
  assert.equal(r.fromYear, 2024)
  assert.equal(r.toYear, 2026)
  assert.deepEqual(r.kinds, ['transcript', 'document'])
  assert.equal(r.interpreted, true)
})

test('survives the model fencing its JSON in markdown', () => {
  const r = parseModelRequest('```json\n{"company":"Tigbur"}\n```', 'raw')
  assert.equal(r.company, 'Tigbur')
  assert.equal(r.interpreted, true)
})

// THE HONESTY CASE: an unparseable answer must not silently become "no filters",
// which would return the whole corpus dressed as a considered result.
test('falls back to the raw sentence and says it did NOT interpret', () => {
  const r = parseModelRequest('I think you want Tigbur reports!', 'תיגבור דוחות')
  assert.equal(r.interpreted, false)
  assert.equal(r.text, 'תיגבור דוחות')
  assert.equal(r.company, null)
})

test('ignores nonsense field types rather than trusting them', () => {
  const r = parseModelRequest('{"company":42,"fromYear":"soon","kinds":"all"}', 'raw')
  assert.equal(r.company, null)
  assert.equal(r.fromYear, null)
  assert.equal(r.kinds, null)
})

test('swaps a reversed year range instead of returning an empty window', () => {
  const r = parseModelRequest('{"fromYear":2026,"toYear":2024}', 'raw')
  assert.equal(r.fromYear, 2024)
  assert.equal(r.toYear, 2026)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --import tsx --test src/lib/workspace/intake/parseRequest.test.ts`
Expected: FAIL — cannot resolve `./parseRequest`.

- [ ] **Step 3: Write the types**

```ts
// src/lib/workspace/intake/types.ts
import type { AttachableSource } from '../data'

/** What the user asked for, structured. Every field is optional intent. */
export type SourceRequest = {
  /** the user's own words, always kept — the fallback search and the UI both use them */
  text: string
  /** a company NAME as the user said it; resolution against `companies` happens in findSources */
  company: string | null
  fromYear: number | null
  toYear: number | null
  /** null means "no preference stated", NOT "none" */
  kinds: Array<'transcript' | 'document'> | null
  /**
   * FALSE when the model's answer could not be read. The UI must say so rather
   * than present a keyword search as a considered interpretation.
   */
  interpreted: boolean
}

/** Why a search returned what it returned. Drives the panel's wording. */
export type FindReason = 'ok' | 'company-has-nothing-in-period' | 'no-such-company' | 'empty-corpus'

export type FindResult = {
  request: SourceRequest
  /** resolved company name exactly as `companies.name` holds it */
  company: string | null
  matched: AttachableSource[]
  /** material for the resolved company that fell OUTSIDE the asked-for window */
  otherForCompany: AttachableSource[]
  reason: FindReason
}
```

- [ ] **Step 4: Write the parser**

```ts
// src/lib/workspace/intake/parseRequest.ts
import type { SourceRequest } from './types'

const KINDS = ['transcript', 'document'] as const
const YEAR_MIN = 1990
const YEAR_MAX = 2100

/** Models fence JSON in markdown often enough that stripping it is not a hack. */
function unfence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : raw).trim()
}

function year(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null
  return v >= YEAR_MIN && v <= YEAR_MAX ? v : null
}

/**
 * Turn the model's answer into a SourceRequest.
 *
 * `interpreted: false` is the load-bearing part. An unreadable answer must NOT
 * degrade into an empty filter set, because an empty filter set matches the whole
 * corpus — which would render as "here is what I found for you" over what was
 * really a failure to understand the question.
 */
export function parseModelRequest(raw: string, fallbackText: string): SourceRequest {
  const base: SourceRequest = {
    text: fallbackText,
    company: null,
    fromYear: null,
    toYear: null,
    kinds: null,
    interpreted: false,
  }

  let obj: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(unfence(raw))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    obj = parsed as Record<string, unknown>
  } catch {
    return base
  }

  const company = typeof obj.company === 'string' && obj.company.trim() ? obj.company.trim() : null

  let fromYear = year(obj.fromYear)
  let toYear = year(obj.toYear)
  // A reversed range is a model slip, not a request for nothing.
  if (fromYear !== null && toYear !== null && fromYear > toYear) [fromYear, toYear] = [toYear, fromYear]

  const kinds = Array.isArray(obj.kinds)
    ? (obj.kinds.filter(
        (k): k is (typeof KINDS)[number] => typeof k === 'string' && (KINDS as readonly string[]).includes(k)
      ) as Array<'transcript' | 'document'>)
    : null

  return {
    text: fallbackText,
    company,
    fromYear,
    toYear,
    kinds: kinds && kinds.length > 0 ? kinds : null,
    interpreted: true,
  }
}
```

- [ ] **Step 5: Add the test file to the battery**

In `package.json`, append `src/lib/workspace/intake/parseRequest.test.ts` to the `test` script's file list, matching the existing formatting.

- [ ] **Step 6: Run the test and the battery**

Run: `node --import tsx --test src/lib/workspace/intake/parseRequest.test.ts` → Expected: 5 passing.
Run: `npx tsc --noEmit` → Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/workspace/intake/types.ts src/lib/workspace/intake/parseRequest.ts src/lib/workspace/intake/parseRequest.test.ts package.json
git commit -m "feat(workspace): the intake's request shape, and a parser that admits when it failed"
```

---

### Task 2: `findSources` — the seam Maya plugs into

**Files:**
- Create: `src/lib/workspace/intake/findSources.ts`
- Test: `src/lib/workspace/intake/findSources.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SourceRequest`, `FindResult`, `FindReason` from Task 1; `AttachableSource` from `src/lib/workspace/data.ts` (`{ sourceId, kind, title, company, when }`).
- Produces: `findSources(request: SourceRequest, corpus: AttachableSource[]): FindResult`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workspace/intake/findSources.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSources } from './findSources'
import type { SourceRequest } from './types'
import type { AttachableSource } from '../data'

const req = (over: Partial<SourceRequest> = {}): SourceRequest => ({
  text: 'תיגבור',
  company: null,
  fromYear: null,
  toYear: null,
  kinds: null,
  interpreted: true,
  ...over,
})

const CORPUS: AttachableSource[] = [
  { sourceId: 't1', kind: 'transcript', title: 'שיחת משקיעים Q1 2026', company: 'קבוצת תיגבור בע"מ', when: '2026-03-02' },
  { sourceId: 't2', kind: 'transcript', title: 'שיחת משקיעים Q2 2026', company: 'קבוצת תיגבור בע"מ', when: '2026-06-02' },
  { sourceId: 't3', kind: 'transcript', title: 'Old call 2023', company: 'קבוצת תיגבור בע"מ', when: '2023-05-02' },
  { sourceId: 'd1', kind: 'document', title: 'דוח שנתי 2025', company: 'קבוצת תיגבור בע"מ', when: '2026-01-11' },
  { sourceId: 't9', kind: 'transcript', title: 'Tamis call', company: 'תמיס בע"מ', when: '2026-04-01' },
]

describe('findSources', () => {
  it('matches a company by a partial Hebrew name', () => {
    const r = findSources(req({ company: 'תיגבור' }), CORPUS)
    expect(r.reason).toBe('ok')
    expect(r.company).toBe('קבוצת תיגבור בע"מ')
    expect(r.matched.map((m) => m.sourceId).sort()).toEqual(['d1', 't1', 't2', 't3'])
  })

  it('filters by the asked-for year window', () => {
    const r = findSources(req({ company: 'תיגבור', fromYear: 2026, toYear: 2026 }), CORPUS)
    expect(r.matched.map((m) => m.sourceId).sort()).toEqual(['d1', 't1', 't2'])
  })

  it('filters by kind', () => {
    const r = findSources(req({ company: 'תיגבור', kinds: ['document'] }), CORPUS)
    expect(r.matched.map((m) => m.sourceId)).toEqual(['d1'])
  })

  // THE CASE THE SPEC IS BUILT AROUND: the company exists, the period does not.
  // It must be distinguishable from "no such company", because the panel says
  // something different for each and offers what DOES exist.
  it('separates "company has nothing in that period" from "no such company"', () => {
    const r = findSources(req({ company: 'תיגבור', fromYear: 2019, toYear: 2020 }), CORPUS)
    expect(r.reason).toBe('company-has-nothing-in-period')
    expect(r.matched).toEqual([])
    expect(r.otherForCompany.map((m) => m.sourceId).sort()).toEqual(['d1', 't1', 't2', 't3'])

    const none = findSources(req({ company: 'אלביט' }), CORPUS)
    expect(none.reason).toBe('no-such-company')
    expect(none.otherForCompany).toEqual([])
  })

  it('reports an empty corpus as such rather than as a missing company', () => {
    expect(findSources(req({ company: 'תיגבור' }), []).reason).toBe('empty-corpus')
  })

  // With no company named, fall back to matching the user's words against titles.
  it('falls back to the raw words when no company was resolved', () => {
    const r = findSources(req({ text: 'Tamis', company: null }), CORPUS)
    expect(r.matched.map((m) => m.sourceId)).toEqual(['t9'])
  })

  it('returns newest first', () => {
    const r = findSources(req({ company: 'תיגבור' }), CORPUS)
    expect(r.matched[0].sourceId).toBe('t2')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --import tsx --test src/lib/workspace/intake/findSources.test.ts`
Expected: FAIL — cannot resolve `./findSources`.

- [ ] **Step 3: Implement**

```ts
// src/lib/workspace/intake/findSources.ts
import type { AttachableSource } from '../data'
import type { FindResult, SourceRequest } from './types'

/**
 * THE SOURCE SEAM (spec §5.1). Everything that offers material to a workspace
 * comes through here. Today the corpus is `transcripts` + `company_documents`;
 * when the Maya catalog lands it is concatenated into the same array by the
 * caller and NOTHING in this function changes.
 *
 * Pure on purpose — the corpus is fetched by the route, so this stays testable
 * without a database and without a network.
 */
export function findSources(request: SourceRequest, corpus: AttachableSource[]): FindResult {
  const base = { request, company: null, matched: [], otherForCompany: [], reason: 'ok' as const }
  if (corpus.length === 0) return { ...base, reason: 'empty-corpus' }

  const byWhen = (a: AttachableSource, b: AttachableSource) => (b.when ?? '').localeCompare(a.when ?? '')

  // ── resolve the company, if one was named ────────────────────────────────
  let company: string | null = null
  if (request.company) {
    const needle = request.company.trim().toLowerCase()
    const names = [...new Set(corpus.map((s) => s.company).filter((v): v is string => !!v))]
    // Substring either way: the user says "תיגבור", the row says "קבוצת תיגבור בע\"מ".
    company =
      names.find((n) => n.toLowerCase() === needle) ??
      names.find((n) => n.toLowerCase().includes(needle) || needle.includes(n.toLowerCase())) ??
      null
    if (!company) return { ...base, reason: 'no-such-company' }
  }

  const forCompany = company ? corpus.filter((s) => s.company === company) : corpus

  const inWindow = (s: AttachableSource) => {
    if (request.fromYear === null && request.toYear === null) return true
    const y = s.when ? Number(s.when.slice(0, 4)) : NaN
    if (!Number.isFinite(y)) return false
    if (request.fromYear !== null && y < request.fromYear) return false
    if (request.toYear !== null && y > request.toYear) return false
    return true
  }

  const ofKind = (s: AttachableSource) => !request.kinds || request.kinds.includes(s.kind)

  let matched = forCompany.filter((s) => inWindow(s) && ofKind(s))

  // No company named and nothing matched? Try the user's own words on the titles
  // before giving up — "Tamis call" should find it without a resolved company.
  if (!company && matched.length === 0 && request.text.trim()) {
    const words = request.text.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
    matched = corpus.filter((s) => {
      const hay = `${s.title} ${s.company ?? ''}`.toLowerCase()
      return words.some((w) => hay.includes(w)) && inWindow(s) && ofKind(s)
    })
  } else if (!company && matched.length > 0 && request.text.trim()) {
    const words = request.text.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
    const narrowed = matched.filter((s) => {
      const hay = `${s.title} ${s.company ?? ''}`.toLowerCase()
      return words.some((w) => hay.includes(w))
    })
    if (narrowed.length > 0) matched = narrowed
  }

  matched = [...matched].sort(byWhen)

  if (matched.length === 0 && company) {
    return {
      request,
      company,
      matched: [],
      // What DOES exist for them — the panel offers this instead of nothing.
      otherForCompany: [...forCompany].sort(byWhen),
      reason: 'company-has-nothing-in-period',
    }
  }

  return { request, company, matched, otherForCompany: [], reason: 'ok' }
}
```

- [ ] **Step 4: Run the test**

Run: `node --import tsx --test src/lib/workspace/intake/findSources.test.ts` → Expected: 7 passing.

- [ ] **Step 5: Add to `package.json`'s test list, then commit**

```bash
git add src/lib/workspace/intake/findSources.ts src/lib/workspace/intake/findSources.test.ts package.json
git commit -m "feat(workspace): findSources — the seam Maya plugs into, and the reason a search found nothing"
```

---

### Task 3: One corpus reader, shared by the picker and the intake

The corpus query currently lives inline in `src/app/api/workspaces/sources/route.ts`. The intake route needs the same rows. Two copies would drift.

**Files:**
- Create: `src/lib/workspace/intake/corpus.ts`
- Modify: `src/app/api/workspaces/sources/route.ts` (replace its body with a call)

**Interfaces:**
- Produces: `loadCorpus(supabase: SupabaseClient): Promise<AttachableSource[]>`

- [ ] **Step 1: Move the query verbatim**

Create `src/lib/workspace/intake/corpus.ts` exporting `loadCorpus`, containing the transcripts + documents + company-name-join logic **exactly as it stands** in `sources/route.ts` lines 26-91 (same `.not('formatted_data','is',null)` filter, same 200 limits, same id-not-invented-title fallbacks). Type the parameter as the return of `createServerSupabase`. Keep the existing comments — they explain why `/api/transcripts` is not reused and why unprocessed transcripts are excluded.

- [ ] **Step 2: Rewrite the route to call it**

`sources/route.ts` keeps its auth two-liner and its `try/catch` → `NextResponse.json({ sources }, { headers: { 'Cache-Control': 'no-store' } })`, with the body replaced by `const sources = await loadCorpus(supabase)`.

- [ ] **Step 3: Prove the picker still works**

Run: `npx tsc --noEmit` → clean.
Run: `npm test` → the existing battery still passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/workspace/intake/corpus.ts src/app/api/workspaces/sources/route.ts
git commit -m "refactor(workspace): one corpus reader, so the picker and the intake cannot drift"
```

---

### Task 4: `POST /api/workspaces/[id]/intake`

**Files:**
- Create: `src/app/api/workspaces/[id]/intake/route.ts`
- Modify: `src/lib/workspace/client.ts` (add `intakeSearchReq`)

**Interfaces:**
- Consumes: `loadCorpus` (Task 3), `parseModelRequest` (Task 1), `findSources` (Task 2).
- Produces: `POST` body `{ text: string }` → `200 { result: FindResult }`; `intakeSearchReq(workspaceId: string, text: string): Promise<{ result: FindResult }>`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/workspaces/[id]/intake/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { loadCorpus } from '@/lib/workspace/intake/corpus'
import { parseModelRequest } from '@/lib/workspace/intake/parseRequest'
import { findSources } from '@/lib/workspace/intake/findSources'

export const dynamic = 'force-dynamic'

const MODEL = 'gemini-3.5-flash'

const SYSTEM = `You turn an investor-research request into a search filter.
Reply with ONLY a JSON object, no prose, with these optional keys:
  company   string  the company name as the user wrote it, Hebrew or English
  fromYear  number  earliest calendar year wanted
  toYear    number  latest calendar year wanted
  kinds     array   any of "transcript" (an investor call) and "document" (a report/filing)
Omit a key entirely when the user did not indicate it. Today is {TODAY}.
Example: "הדוחות והשיחות של תיגבור משנתיים אחרונות"
      -> {"company":"תיגבור","fromYear":{Y1},"toYear":{Y0},"kinds":["transcript","document"]}`

/**
 * Interpret a sentence, then search the corpus with it.
 *
 * The model is used ONLY to structure the request. It never invents a result:
 * everything returned comes from rows `findSources` matched. If the model is
 * unavailable or answers unreadably, `request.interpreted` is false and the
 * panel says so — a keyword search must not be presented as comprehension.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  try {
    // The workspace must be the caller's own. RLS answers this: a workspace that
    // is not theirs is simply not there.
    const { data: ws, error: wErr } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (wErr) throw new Error(wErr.message)
    if (!ws) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

    const [corpus, raw] = await Promise.all([loadCorpus(supabase), interpret(text)])
    const request = parseModelRequest(raw, text)
    return NextResponse.json(
      { result: findSources(request, corpus) },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/** Returns the model's raw text, or '' — never throws, because an
 *  uninterpreted request is a degraded search, not a failed one. */
async function interpret(text: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return ''
  const now = new Date()
  const system = SYSTEM.replace('{TODAY}', now.toISOString().slice(0, 10))
    .replace('{Y1}', String(now.getFullYear() - 1))
    .replace('{Y0}', String(now.getFullYear()))
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${system}\n\nRequest: ${text}` }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) return ''
    const json = (await res.json()) as { candidates?: Array<{ content: { parts: Array<{ text?: string }> } }> }
    return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  } catch {
    return ''
  }
}
```

- [ ] **Step 2: Add the client call**

In `src/lib/workspace/client.ts`, beside `fetchSources`:

```ts
export const intakeSearchReq = (workspaceId: string, text: string) =>
  call<{ result: FindResult }>(`/api/workspaces/${workspaceId}/intake`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
```

with `import type { FindResult } from './intake/types'` added to the type imports.

- [ ] **Step 3: Prove the auth guard sees it**

Run: `node --import tsx --test src/lib/apiAuthBoundary.test.ts` → Expected: PASS, with the new route covered (it resolves a user, so it needs no allowlist entry).
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/workspaces/[id]/intake/route.ts src/lib/workspace/client.ts
git commit -m "feat(workspace): the intake search route — the model structures the ask, the corpus answers it"
```

---

### Task 5: The panel's clarify + confirm stages, fed by real results

**Files:**
- Modify: `src/components/workspace/WorkspaceIntake.tsx` (whole component)
- Modify: `src/lib/i18n/dictionaries/en.ts`, `src/lib/i18n/dictionaries/he.ts`

**Interfaces:**
- Consumes: `intakeSearchReq` (Task 4), `FindResult` (Task 1).
- Produces: `<WorkspaceIntake workspaceId={string} workspaceName={string} />` — **note the new required `workspaceId` prop**, used by Task 7.

- [ ] **Step 1: Replace the hardcoded stage machinery**

Keep the component's visual structure exactly — the centred composer, the chip styling (`chip()`), the user bubble, the bottom `PillComposer`. Replace the state:

```ts
type Stage = 'intro' | 'searching' | 'clarify' | 'building'
const [stage, setStage] = useState<Stage>('intro')
const [request, setRequest] = useState('')
const [result, setResult] = useState<FindResult | null>(null)
const [chosen, setChosen] = useState<Set<string>>(new Set())
const [error, setError] = useState<unknown>(null)
```

`send()` becomes: set `request`, clear `draft`, `setStage('searching')`, `setError(null)`, then `intakeSearchReq(workspaceId, text)` → on success `setResult(r.result)`, preselect **every** matched `sourceId` into `chosen`, `setStage('clarify')`; on failure `setError(e)` and `setStage('intro')` so the user can retry — never a clarify screen over a failed search.

- [ ] **Step 2: Render the four honest outcomes**

Inside the `clarify` stage, after the user's bubble, branch on `result.reason`:

- `ok` → the lead line, then **the confirm list**: one row per `result.matched` item — a checkbox bound to `chosen`, the title in `<bdi>`, and a muted `<bdi>` company · `<bdi>` year. Each row is a `<label>` so the whole row toggles. Above it, a count line: "Found {n} — untick anything you don't want."
- `company-has-nothing-in-period` → state it in words (`dict.workspace.intakeNothingInPeriod`, carrying the company via `<bdi>`), then offer `result.otherForCompany` in the **same** list UI with **nothing preselected**, under `dict.workspace.intakeOfferOther`.
- `no-such-company` → `dict.workspace.intakeNoCompany`, no list, and the composer stays so they can rephrase.
- `empty-corpus` → `dict.workspace.intakeEmptyCorpus`.

When `result.request.interpreted === false`, render `dict.workspace.intakeNotInterpreted` above the list — the sentence that says these are keyword matches, not an understood request.

- [ ] **Step 3: The build button reflects the real count**

Replace the unconditional `approveBuild` button with one that is disabled when `chosen.size === 0` and whose label carries the count (`dict.workspace.buildWithCount`, `{n}` replaced). Keep `orKeepDescribing` beside it.

- [ ] **Step 4: Delete what is now fabricated**

Remove `PERIODS`, the `period`/`deck`/`report` state and their chip rows, `clarifyPeriod`, `clarifyElse`, `clarifyDeck`, `clarifyReport` — every one of them is a hardcoded question about material we have not looked for. Remove `buildingSteps` and `buildingDemoNote` (Task 6 makes the build real). Delete their keys from **both** dictionaries.

- [ ] **Step 5: Add the new keys to both dictionaries**

`en.ts` (and the Hebrew equivalents in `he.ts`, which the `Dictionary` type will demand):

```ts
intakeSearching: 'Looking through what Atlas has…',
intakeFound: 'Found {n}. Untick anything you don’t want.',
intakeNothingInPeriod: 'I have nothing for {company} in that period. Here is what I do have:',
intakeNoCompany: 'I could not find that company in Atlas yet.',
intakeEmptyCorpus: 'There is nothing in Atlas to search yet.',
intakeNotInterpreted: 'I could not read that as a search, so these are keyword matches on your words.',
intakeSearchFailed: 'The search failed: {error}',
buildWithCount: 'Add {n} and open the workspace',
```

- [ ] **Step 6: Verify types and battery**

Run: `npx tsc --noEmit` → clean (a missing Hebrew key fails here).
Run: `npm test` → green.

- [ ] **Step 7: Commit**

```bash
git add src/components/workspace/WorkspaceIntake.tsx src/lib/i18n/dictionaries/en.ts src/lib/i18n/dictionaries/he.ts
git commit -m "feat(workspace): the intake asks about what it actually found, and shows the list before it builds"
```

---

### Task 6: Building the shelf for real

**Files:**
- Modify: `src/components/workspace/WorkspaceIntake.tsx`

**Interfaces:**
- Consumes: `addItemReq(workspaceId, ItemCreate)` from `src/lib/workspace/client.ts`; `ItemCreate = { kind, name, transcript_id? | document_id? | storage_path? }`.

- [ ] **Step 1: Attach the chosen sources**

`build()` sets `stage='building'`, then for each chosen source (looked up in `matched` ∪ `otherForCompany`) calls `addItemReq` with `kind: s.kind`, `name: s.title`, and `transcript_id: s.sourceId` when `kind === 'transcript'`, else `document_id: s.sourceId`. Run them sequentially so `position` lands in the order the user sees, and collect failures rather than aborting on the first.

- [ ] **Step 2: Report a partial result honestly**

If every attach succeeded → `router.refresh()`, which re-renders the server component and lands the user in the populated `WorkspaceShell`. If some failed → stay on the building stage and render which ones failed and why (`dict.workspace.intakeAttachFailed`, `{n}`/`{error}`), with the succeeded ones already on the shelf and a button to continue into the workspace. **A silent partial fill is the exact defect this chapter exists to remove.**

- [ ] **Step 3: Replace the building copy**

`buildingTitle` stays; it now describes something real. Add `intakeAttachFailed: 'Could not add {n} of them: {error}'` and `intakeContinueAnyway: 'Open the workspace'` to both dictionaries.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/WorkspaceIntake.tsx src/lib/i18n/dictionaries/en.ts src/lib/i18n/dictionaries/he.ts
git commit -m "feat(workspace): approve and build actually builds, and says so when part of it did not"
```

---

### Task 7: Route the intake back to the front door

**Files:**
- Modify: `src/components/workspace/WorkspaceRoute.tsx:106-128`

- [ ] **Step 1: Restore the designed empty state**

Replace the picker-only empty branch with `<WorkspaceIntake workspaceId={presented.id} workspaceName={presented.name} />`, and **delete the comment justifying its removal** — it documents a decision the founder has overruled. Replace it with a short note saying the panel searches the real corpus through `findSources`, and that the picker remains the "add more sources" path inside a populated workspace (`WorkspaceShell`'s `addOpen` overlay, unchanged).

- [ ] **Step 2: Confirm the picker survives where it belongs**

`WorkspaceSourcePicker` must still be imported and rendered by `WorkspaceShell` for the add-sources overlay. Only the empty-workspace usage goes.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npm test` → green.

- [ ] **Step 4: Commit**

```bash
git add src/components/workspace/WorkspaceRoute.tsx
git commit -m "fix(workspace): the front door is the designed panel again"
```

---

### Task 8: Eyes on it, in both locales, as two users

No claim of doneness before this task passes. `.claude/rules/app.md`: a green typecheck is not evidence that a page renders.

- [ ] **Step 1: Start a clean dev server**

Confirm nothing is squatting :3003 (`Get-NetTCPConnection -LocalPort 3003`), kill a leftover if it is your own, then `npm run dev -- -p 3003`. Never verify against a server you did not just start.

- [ ] **Step 2: The happy path, in Hebrew**

Sign in, create a workspace, and type `אני רוצה את הדוחות והשיחות של תיגבור`. Confirm: the searching state appears · the clarify stage lists **real** Tigbur rows with real dates · unticking one removes it from the count · build attaches exactly the ticked ones · the workspace opens populated · **reload and the shelf is still there**.

- [ ] **Step 3: The honest-failure paths**

Type a company Atlas does not have (e.g. `אלביט`) → `intakeNoCompany`, no list, no fabricated result. Then `תיגבור 2019` → `intakeNothingInPeriod` naming Tigbur, offering what does exist, **nothing preselected**.

- [ ] **Step 4: Both locales, bidi checked**

Repeat step 2 in English. Screenshot the clarify list in both. Every mixed Hebrew/Latin line (title · company · year) must have each run in its own `<bdi>` — check the year and the company name do not jump sides.

- [ ] **Step 5: Two users**

As user A create a workspace via the intake. As user B confirm it is not visible. Confirm with the anon key that the rows are not readable.

- [ ] **Step 6: The battery, then the build**

Run: `npm test` · `npx tsc --noEmit`. **Stop the dev server**, then `npm run build`.

- [ ] **Step 7: Write the evidence file and commit**

Create `docs/evidence/feat-workspace-tables/2026-08-04-slice-1-intake.md` with the screenshots, the exact requests typed, and what each returned — including the two failure paths, which are the point of the slice.

```bash
git add docs/evidence/feat-workspace-tables/
git commit -m "docs(evidence): the intake panel, proved on real rows and on two honest failures"
```

---

## Self-review

**Spec coverage (§6 slice 1):** intake routed back → Task 7 · three designed stages wired → Tasks 5, 6 · clarify generated from what was found, hardcoded chips removed → Task 5 steps 1, 2, 4 · confirm list inside the clarify conversation (D5) → Task 5 step 2 · nothing lands unseen → Task 6 step 1 · "found nothing" stated plainly, workspace still opens → Task 5 step 2 · picker survives as add-more → Task 7 step 2 · `findSources` seam → Task 2 · both locales + bidi → Task 8 step 4 · two users → Task 8 step 5.

**Deliberately NOT in this slice:** `workspaces.layout` (slice 2), real file rendering (slice 2), the document (slice 3), chat (slice 4), export (slice 5), Maya (blocked on the key).

**Type consistency:** `SourceRequest`/`FindResult`/`FindReason` defined once in Task 1's `types.ts` and imported by Tasks 2, 4, 5. `AttachableSource` is the existing shape from `src/lib/workspace/data.ts` — `{ sourceId, kind, title, company, when }` — used unchanged throughout; note it is `sourceId`, not `id`. `ItemCreate` in Task 6 matches `src/lib/workspace/validate.ts` exactly, including that `kind` must match the provenance field or migration 017's constraint refuses the row.
