# MAYA layer + workspace document pull — design

**Date:** 2026-08-06 · **Branch:** `feat/workspace-tables` · **Lane:** multiview (port 3003)

Founder, 2026-08-06: *"enable each user pull any report / presentation of a company in a really
easy and accessible way through the chat -> through pulling from the maya api. we need to make
sure we are doing it smart and efficient."* And, on why it matters: *"The api key and data
integration is the most important product we are building. Calendar, investor calls, chat and
workspace all are being built on it."*

## Goal

A user names a company and a period in workspace chat; Atlas finds that company's filings on
MAYA, confirms in words which ones it will fetch, downloads the PDFs, extracts their text, and
puts them on the shelf — where every existing Atlas layer (grounded Q&A, clipping, citations,
the working document) already works.

**Built in two parts, and the split is the point.** Part 1 is a MAYA platform layer that knows
nothing about workspaces. Part 2 is the workspace, which is its first consumer of four.

## The four consumers, so Part 1 is not built workspace-shaped

| # | Consumer | Needs from the layer | Status |
|---|---|---|---|
| ① | **Workspace** — documents to analyse | issuer directory, `by-issuer`, event vocabulary, PDF download, ingest | **this spec** |
| ② | **Chat** — answers about companies | issuer directory, `by-issuer`, schedule feed | later |
| ③ | **Calendar** — the market's reporting month | schedule feed + a synced table | later |
| ④ | **Live calls** — what to cover, and how to join | schedule feed + the Zoom link inside a filing's HTML | later |

Consumers ②③④ are out of scope here. They are listed because Part 1's interfaces must not
assume the workspace: `src/lib/maya/**` imports nothing from `src/lib/workspace/**`, and a
test asserts that.

---

## The verified contract

Everything here came from a live 200 on 2026-08-06, not from a document. Full record:
`docs/MAYA-API.md`.

| | |
|---|---|
| Base URL | `https://datawise.tase.co.il` |
| Auth | header `apikey` — server-side only, from `MAYA_API_KEY` |
| Language | header `Accept-Language: he-IL` — **mandatory**; `en-US` returns `title: null` |
| Rate limit | 10 requests / 2 seconds, then 429 |
| `by-issuer` params | `IssuerId` (1–99999), `FromDate`, `ToDate` — all required; `EventId` optional |
| **Date range cap** | **`"The date range cannot exceed 1 year."`** — a 380-day window is a 400 |
| Attachments | `mayafiles.tase.co.il`, **public**, no key, no cookie |
| Schedule feed history | 2025 onward only (2024 returns zero rows); `by-issuer` history goes back further |

### Event vocabulary (observed; treat as a sample, not the full table)

| id | Hebrew | Role |
|---|---|---|
| 101 | דוח תקופתי ושנתי | document — annual |
| 104 | דוח רבעון 1 | document — Q1 |
| 105 | דוח רבעון 2/חצי שנתי | document — Q2 |
| 106 | דוח רבעון 3 | document — Q3 |
| 270 | מצגת | document — presentation |
| 233 | שיחת ועידה | **schedule** — consumers ③④, not a document |
| 113 | מועד פרסום דוחות | schedule |
| 114 | מצבת התחיבויות ומועדי פרעון | excluded |
| 282 | תיקון טעות סופר בדוחות | excluded |

**The document whitelist is `{101, 104, 105, 106, 270}`, and a candidate must also carry a
`.pdf` attachment.** Founder's choice, 2026-08-06: analyst-relevant kinds only, because
Tigbur filed 45 things in 2026 and a list of 45 is not "accessible". Conference calls (233)
are deliberately in the vocabulary but classified as *schedule*, not *document* — that is the
line consumers ③④ will read.

A filing with no PDF is **not offered**. Offering a source that cannot be opened is the
visible-degradation failure `.claude/rules/app.md` exists to prevent.

---

## Part 1 — the layer (`src/lib/maya/`)

### `config.ts`
Named constants: base URL, `apikey` header name, `he-IL`, timeout, max range days (365),
max PDF bytes. No secrets — the key is read from the environment inside `client.ts`.

### `client.ts` — the single chokepoint
```ts
export type MayaFailure =
  | { kind: 'unauthorized' }      // 401 — key missing or wrong
  | { kind: 'rate_limited' }      // 429
  | { kind: 'bad_request'; fields: Record<string, string[]> }  // 400 + its validation errors
  | { kind: 'unavailable' }       // 5xx, network, timeout
export type MayaResult<T> = { ok: true; data: T } | { ok: false; failure: MayaFailure }

export async function mayaGet<T>(path: string, params: Record<string, string | number>): Promise<MayaResult<T>>
```
Adds auth + language + timeout, maps every error into `MayaFailure`, **never throws**.

**EVERY MAYA call in the product goes through this function.** That is the whole mechanism
behind the deferred rate-limit queue below: adding one is a change to this file only.

### `dates.ts`
```ts
export function yearWindows(fromYear: number, toYear: number): { from: string; to: string }[]
```
One window per calendar year from `fromYear` through **`toYear + 1`**, each ≤1 year.

Two rules, both load-bearing:
- **The 1-year cap is real** — an 18-month window returns 400, so windows are never merged.
- **`+1` is the late-filing rule.** The 2024 annual report was published **2025-03-30**. A
  query for 2024 alone returns the *2023* report. We do not model fiscal calendars: we widen
  the window and let the selection model read the period out of the Hebrew title, which states
  it outright (*"דוח תקופתי ושנתי לשנת 2024"*). Reading periods out of titles is a rule the
  selection prompt already follows.

### `events.ts`
```ts
export const DOCUMENT_EVENT_IDS: ReadonlySet<number>
export const SCHEDULE_EVENT_IDS: ReadonlySet<number>       // for consumers ③④
export function docTypeFor(eventIds: number[]): 'report' | 'slides' | null
export function periodFor(eventIds: number[], title: string, publishedISO: string): string
```
`docTypeFor` returns `slides` when 270 is present, `report` for 101/104/105/106, `null` when
nothing is whitelisted (⇒ not offered). `periodFor` produces the human `quarter` string
(`"Q1 2026"`, `"FY 2024"`): period from the event id, year from a 4-digit year in the title
when present, else the publication year. Best-effort and **descriptive only** — identity is
`maya_report_id`, never this string.

### `issuers.ts`
```ts
export type IssuerRow = { issuerId: number; nameHe: string | null; nameEn: string | null }
export function resolveIssuer(query: string, rows: IssuerRow[]): IssuerRow | null
```
Pure. Normalises both sides — trims, strips `בע"מ` / `Ltd`, collapses whitespace, removes
quotes and geresh variants — then exact match, then unique prefix, then unique substring.
**Ambiguity returns `null`**, never a guess: attaching the wrong company's report is worse
than asking.

### `disclosures.ts`
```ts
export async function listDisclosures(a: { issuerId: number; fromYear: number; toYear: number })
  : Promise<MayaResult<MayaFiling[]>>
```
Calls `yearWindows`, issues one `mayaGet` per window **sequentially** (rate limit), merges,
de-duplicates by `mayaReportId`, sorts newest first. Any window failing fails the whole call —
a partial catalog presented as complete is a lie about coverage.

### `filings.ts`
```ts
export type RemoteSource = {
  sourceId: string          // `maya:<mayaReportId>`
  mayaReportId: number
  issuerId: number
  issuerName: string
  title: string
  publishedISO: string
  docType: 'report' | 'slides'
  period: string
  pdfUrl: string
}
export function toRemoteSources(filings: MayaFiling[]): RemoteSource[]
```
Drops anything without a whitelisted event or without a `.pdf`. When a filing carries several
PDFs (the 2024 annual report has two), **the first is taken and the rest ignored in v1** —
recorded as a known limitation below, not silently.

### `files.ts`
```ts
export async function downloadFiling(url: string): Promise<MayaResult<Uint8Array>>
```
Fetches, **validates the `%PDF-` magic bytes**, enforces a size cap, retries **once** on a
non-PDF body then fails. This exists because a real fetch of a `.pdf` URL returned
**HTTP 200, `content-type: text/html`, 212 bytes** — a WAF interstitial. Eight later fetches
of that same URL returned the real 438 KB PDF, so it is intermittent, which is the dangerous
kind: an ingest trusting the status code stores a 212-byte "report", caches it, and renders
success. Status codes are not evidence; magic bytes are.

---

## Part 2 — the workspace consumer

### Schema (additive only; shared production DB)

Migration `supabase/migrations/20260806_019_maya.sql`:

1. **`maya_issuers`** — the name→id directory.
   `issuer_id integer primary key`, `name_he text`, `name_en text`, `updated_at timestamptz`.
   **Shared corpus, not user data**, so it carries no `user_id`. RLS enabled with
   `for select to authenticated using (true)` — the legitimate shared-read shape already
   shipped in `20260611_006`, explicitly distinguished in `.claude/rules/db.md` from the
   banned `FOR ALL … WITH CHECK (true)` to `public`. Written only by the refresh script
   (service role).
2. **`company_documents.maya_report_id bigint`** + partial unique index
   `where maya_report_id is not null`. It gives a MAYA-sourced row the identity the feed
   actually has, so re-pulling a filing is a no-op and the intake can tell what Atlas already
   holds.

   **CORRECTION to an earlier draft of this spec, which claimed this also fixed the
   duplicate-title defect. It does not, and the diagnosis was wrong.** Checked against the
   live rows: both are `source: 'manual'` with *different* quarters (`Q1 2026` and `Q2 2026`)
   and the same title — a human gave the Q2 document the Q1 title at ingest. The
   `(company_id, quarter, doc_type)` constraint never permitted or caused it. That remains a
   data-cleanup decision for the founder.

   What follows for MAYA rows is the useful part: their `title` and `quarter` are derived from
   the *same* source string, so the two cannot disagree the way a hand-typed pair can.

   **The existing `(company_id, quarter, doc_type)` unique constraint stays and is honoured.**
   It cannot be removed (additive-only, and `DROP` is hook-blocked), so MAYA ingest keeps
   upserting on it. The consequence, stated rather than discovered later: for one company,
   period and type Atlas holds **the most recently pulled filing**. When a company files a
   correction — real example, *"מצגת משקיעים לרבעון שני 2024"* on 29 Aug 2024 and
   *"…- תיקון טעות בחלק מהנתונים"* on 1 Sep 2024 — pulling the correction replaces the
   original, which is what an analyst wants. Pulling the older one afterwards would replace it
   back; both are genuine filings, so this is a limitation, not a corruption.
3. **`companies.tase_issuer_id`** already exists and is NULL on all 4 rows. Backfilled by the
   refresh script by matching `maya_issuers` names, and set on auto-created companies.

Per `.claude/rules/db.md`, this migration is **reviewed before it is applied**, and appended to
`agent-memory/cross-cutting.md` before applying.

### `ingestFiling.ts` — the glue
```ts
export async function ingestFiling(a: { source: RemoteSource; companyId: string })
  : Promise<{ documentId: string; pageCount: number }>
```
`downloadFiling` → existing `ingestDocument`. Two targeted changes to `ingestDocument`:
- accept an optional `mayaReportId`, and when present use it as the `onConflict` target
  instead of `(company_id, quarter, doc_type)`;
- accept an explicit `storagePath` so MAYA files land at
  `${companyId}/maya/${mayaReportId}.pdf` instead of colliding on
  `${companyId}/${quarter}/${docType}.pdf`.

### Company auto-creation
```ts
export async function ensureCompanyForIssuer(admin, issuerId: number, issuerName: string): Promise<string>
```
Looks up `companies.tase_issuer_id`, then falls back to a name match, then inserts. Shared
corpus, service role. Idempotent.

### Intake route changes (`/api/workspaces/[id]/intake`)

Stage 1 stops being conditional. Today it runs **only when the corpus exceeds 80 rows**, so
with 58 rows it has never executed in production. It becomes: always interpret the request,
because that interpretation is also the MAYA query.

```
parse request  →  {company, fromYear, toYear, kinds}          (existing parseModelRequest)
      ↓ company named?
resolveIssuer(company, maya_issuers)
      ↓ resolved?
listDisclosures({issuerId, fromYear ?? thisYear-1, toYear ?? thisYear})
      ↓
toRemoteSources()  →  drop any already in company_documents (by maya_report_id)
      ↓
candidates = localCorpus ++ remoteSources        →  existing SELECT step, unchanged
```

The narrowing behaviour for a large corpus is preserved: when `candidates` exceeds
`SELECTION_CANDIDATE_CAP`, local rows are filtered by `findSources` as today, and remote rows
are kept ahead of them (the user asked for those explicitly).

**`AttachableSource` gains `remote?: RemoteSource`.** Everything downstream — `parseSelection`
dropping unknown ids, `orderBySelection`, `stripIds` — works unchanged on the synthetic
`maya:<id>` sourceId.

The selection prompt marks remote candidates plainly (*"not yet in Atlas — I would fetch this
from MAYA"*), so Atlas can say so in its sentence rather than implying the file is already held.

### Honest failure, which is the part most likely to regress

Two new deterministic flags on the intake response, rendered by the panel in the user's own
language. **Neither is left to the model**, because the failure mode here is precisely a fluent
sentence that misrepresents coverage:

- `sourceError: 'maya_unreachable'` — MAYA failed. The reply must not be "I don't have that":
  that is the exact lie fixed on 2026-08-06, arriving through a new door. The panel says Atlas
  could not reach MAYA and that local results may be incomplete.
- `unknownCompany: string` — a company was named and could not be resolved. Says so, and does
  not present local-only results as though the search succeeded.

### Attaching a remote source — a new endpoint

`POST /api/workspaces/[id]/items/from-maya` with the `RemoteSource`, re-validated server-side.
Authenticates the user (`resolveUser` + `unauthorized()`), then
`ensureCompanyForIssuer` → `ingestFiling` → `addItem`.

The client calls it once per remote source, exactly as it already calls `addItemReq` per local
source. This keeps the intake response fast (a 41-page extract is seconds, not milliseconds),
gives per-file progress, and per-file failure — the panel already renders a `failures[]` of
`{title, error}`.

### The chat prompt must change in the same commit

`src/lib/workspace/chat/prompt.ts` currently states, as an absolute:

> "You have NO connection to MAYA / the TASE Data Hub. Atlas cannot pull a filing from MAYA today."

True when written on 2026-08-05; false the moment this ships. If the plumbing lands and the
sentence does not, **Atlas politely refuses a capability it now has and nothing looks broken.**
It becomes: Atlas can fetch filings from MAYA through the document step, still cannot browse
the web or call anything else, and still must never claim to have brought a file it has not.
The forbidden-verbs rule stays exactly as it is — it guards a different failure.

The general lesson, filed: **a capability denial in a prompt is load-bearing state, and every
capability change has to revisit it.**

### The issuer directory script

`scripts/maya-refresh-issuers.ts`: read `by-report-year` for the last two years, collect
distinct `issuerId`s (233 observed across 2025–2026), then one `by-issuer` call each over a
short window to read `issuerName`, throttled to the rate limit (~47s), upsert into
`maya_issuers`, and backfill `companies.tase_issuer_id` where a name matches. Re-runnable.

**Known coverage limit, stated in the script's own output:** this finds only companies that
announced a reporting date. A listed company that never scheduled one will not resolve by name.

---

## Testing

`npm test` makes **no network calls**. The MAYA client is exercised against recorded fixtures.

| Module | What is asserted |
|---|---|
| `dates` | one window per year; never exceeds 365 days; includes `toYear + 1`; single-year request yields two windows |
| `events` | whitelist membership; 270 ⇒ slides; 101/104/105/106 ⇒ report; 233 is schedule, not document; unknown ⇒ null; period string from title year, falling back to publication year |
| `issuers` | Hebrew normalisation (`בע"מ`, quotes, geresh); exact/prefix/substring order; **ambiguous ⇒ null** |
| `filings` | filings without a whitelisted event dropped; without a PDF dropped; `sourceId` shape; multi-PDF takes the first |
| `files` | `%PDF-` accepted; the 212-byte HTML body rejected **despite a 200**; oversize rejected; retries once |
| `client` | 401/429/400/5xx each map to the right `MayaFailure`; a 400 keeps its field errors |
| layering | a test asserts `src/lib/maya/**` imports nothing from `src/lib/workspace/**` |
| intake route | remote+local merge; `maya_unreachable` set on failure and local results not dressed up as complete; `unknownCompany` set; already-ingested filings excluded |

**Live verification** (`/verify-app`, port 3003, signed-in Chrome): pull Tigbur's **2024 annual
report** — the founder's own failing case — end to end; confirm the two-window date logic
returns the 2024 report and not the 2023 one; open it and ask a grounded question about it;
check Hebrew titles render with `<bdi>` in both locales (MAYA titles mix Hebrew with Latin
`Q1`/dates, which is the exact 3-occurrence bidi rule in `.claude/rules/app.md`).

## Deferred, on the record

**The rate-limit priority queue.** 10 req/2s is one global budget across all users and all four
consumers, so a background sync could starve an interactive pull. Founder's call, 2026-08-06:
not in beta. Deferred safely **because every call goes through `mayaGet`**, making it a
one-file change. **Triggers: the first background sync (consumer ③), or beta users numerous
enough to collide.**

## Known limitations, stated rather than hidden

- Only the **first PDF** of a multi-PDF filing is attached (the 2024 annual report has two).
- The directory covers only companies that **scheduled a report** (~233).
- `period` is best-effort from title text; it is descriptive, never identity.
- MAYA titles are Hebrew only; there is no English catalog to fall back to.

## Out of scope

Consumers ②③④; the schedule sync table; the Zoom-link extraction for live calls; XBRL;
de-duplicating the two pre-existing `company_documents` rows (a separate founder decision).
