# The Smart Layer — Architecture Spec & Build Sequence

**Status: APPROVED — founder, 2026-08-13** (smart-layer ticket 10; his words quoted in
`DECISIONS.md`). Nothing here was newly decided: every decision below was made and
founder-approved in tickets 01–17 of the smart-layer wayfinder map; this document assembles
them into one buildable spec, with the cost budgets recomputed at the measured Hebrew token
rate (§4–5) and the build sequence (§6) both approved with it.

Sources of record: the map and its ticket Answers + fact sheets, retired verbatim at the
map's retirement merge to `docs/archive/scratch/smart-layer-map-2026-08/`,
`docs/INGESTION-STANDARD.md`, `docs/eval/retrieval-eval-set.md`, `docs/DATA-MODEL.md`,
`DECISIONS.md`. Where this spec and a ticket record disagree, the ticket record wins and
this file gets corrected. Build tickets: `.scratch/smart-layer-build/issues/`.

---

## 1 · What we are building, in one page

Atlas gets one brain. Every reasoning surface — **Chat**, **Ask Atlas** (the same chat
reached from live calls, transcripts, company pages), **Workspace chat**, and **Agents** —
is powered by Claude **Sonnet 5** calling one shared set of tools over one shared corpus.

- A user asks anything. If they name a company (typed or `@mention`), the answer is grounded
  in that company's calls and filings. If no company resolves, Chat visibly switches to
  **search mode** and answers with leads: per-company evidence, each with a citation.
- Every claim points at its source — *call · minute · line* or *filing · page* — and the
  citation is **verified at the moment it is written**. An answer that cannot be grounded
  says so. A source that later changed renders "drifted", never a plausible lie.
- Funds create **agents** in the product: a name, a mission in their own words, a scope
  (company / sector / both). The agent introduces its plan in Hebrew, asks to confirm, then
  runs — scheduled or on demand — producing anchored findings and file artifacts into its
  own chat, with visible reasoning and visible, editable memory.
- The corpus grows itself: live calls are born attributed with real timestamps; MAYA filings
  (periodic reports + investor presentations, "latest of each" per company) are ingested,
  chunked, embedded and searchable ~10 minutes after publication.

Costs are budgeted per answer and per run (§5), enforced by context ceilings and native
budget caps, and accounted per request in our own database.

## 2 · Architecture

### 2.1 One brain, two runtimes (ticket 08)

| | Runtime | Why |
| --- | --- | --- |
| Chat, Ask Atlas, Workspace chat | **Claude Messages API called directly from our Next.js server**, streaming; the tool loop runs in our route | chat-grade latency, no sandbox fee, our infra patterns |
| Agents | **Anthropic Managed Agents** (founder decision, ticket 06; beta tradeoffs accepted eyes-open) | hosted sandbox + native scheduling + per-run budget caps |

Model: **Sonnet 5 everywhere**. Haiku only for mechanical internal steps, never for
answering the user. Opus/Fable only by explicit future decision. Transcription and polish
stay on IVRIT/RunPod + Gemini — the one-brain rule covers reasoning surfaces, not ASR.

Key: `ANTHROPIC_API_KEY` (canonical name; `.env.local` currently holds the `CLAUDE_API_KEY`
alias). The Railway variable is added with the first Claude-powered ship (slice 6). Org tier
of record: **Evaluation** — 80K output-tokens/min on the Sonnet bucket is the prototyping
constraint; plan the Start→Build→Scale path before onboarding real funds
(`research/11-key-verification.md`).

### 2.2 One tool registry, two drivers (ticket 08)

Tools are defined once — JSON schema + handler over `src/lib/db/*` — and exposed twice:
in-process to the chat tool loop, and via the custom-tool event round-trip to Managed Agents
(`agent.custom_tool_use` → our handler → `user.custom_tool_result`).

**V1 roster** (the floor of agent capability, not a cage — founder directive):

| Tool | What it does |
| --- | --- |
| `resolve_company` | alias table lookup; callable EVERY turn — the intake-bug fix by construction |
| `search_corpus` | the measured hybrid (§2.5), company/sector-scoped or market-wide-diversified; returns windows WITH anchors, never documents |
| `lookup_facts` | XBRL structured facts (ticket 14) — numeric questions become lookups, not searches |
| `read_source` | open a transcript window / filing page by anchor |
| `read_workspace` | only when the surface/agent is assigned one |
| `list_disclosures` | MAYA live feed, through the global limiter |
| `web_search` | all four surfaces (founder overrule), archive-first instruction, visibly distinct citations |
| `report_finding` | **agents only** — the single door for findings; verifies the quote exists in the cited source before saving |
| `update_memory` | **agents only** — writes the agent's Supabase memory |

**Laws at the tool boundary** (ticket 08; each slice owes its mechanism):

1. Identity is never model-supplied — handlers close over `{userId, scope}` from the
   request/run. The model cannot name a user or widen its own scope.
2. Every tool result quoting a document is fenced (`<<<ATLAS-SOURCE>>>`) **with titles and
   labels defanged** — the slice-2 BLOCKER (undefanged fence-line titles,
   `research/03-foundation-review.md`) closes before any prompt gains tools.
3. Tool errors are visible (`isError` + what to try), never silent empties (M3.3).

### 2.3 Grounding per surface (ticket 08, founder-approved recipe)

- **Chat** starts blank. `@company` → **pinpoint mode** scoped to it, behind the scope-size
  router: scope ≤ ~40K Claude tokens → stuff whole documents (cached); bigger → top-k
  retrieval. No resolvable company → **search mode**, visibly shown, one tap to switch;
  answers as leads grouped per company (per-company-diversified top-k). Mode is
  deterministic — never a hidden classifier guess (classifier-visible-failure law).
- **Ask Atlas on a live call / transcript**: that call injected whole (6–18K tokens); tools
  for anything beyond it.
- **Ask Atlas on a company page**: scoped to that company — calls, filings, MAYA facts via
  tools.
- **Workspace chat**: scoped to the shelf + `read_workspace`.
- **Everywhere**: honesty machinery — truncated / omitted / unanswerable states visible, in
  Hebrew; "cannot ground → say so" (the eval-set policy); the W1 guard lives at the answer
  layer (mis-attributed content never speaks for the company).

### 2.4 The citations contract, end to end (ticket 08 — law)

- **Corpus anchor**: `transcript_id` + line range, or `document_id` + page — plus
  `source_label` and a **`source_quote` snapshot**. The workspace quartet's SHAPE is
  inherited; its workspace-item indirection is NOT — a corpus-grounded claim must not die
  when a user tidies a shelf.
- **Verified at write, on every surface**: the quoted text must exist in the cited source or
  the claim is rejected and the model is told to fix it. This is the M3 choke point that
  closes the foundation review's two slice-4 BLOCKERs (no write-time verification, unwired
  drift detection) by construction.
- **Drift renders honestly**: on re-processing, anchors compare their `source_quote`
  snapshot at render — match → live; mismatch → "drifted", visibly.
- **The minute becomes real**: per-line timestamps are persisted at birth (ingestion
  standard §4), so citations read "Q1 call · 14:02 · L0031" per the founding law.
- **Web citations**: link + page title + exact quote verified against the page text fetched
  at that moment; later change renders "changed since cited"; visibly distinct from archive
  anchors.

### 2.5 Retrieval — the measured shape (ticket 07, founder-approved)

**C-gemini-scoped behind a scope router** — every element below was measured on our own
corpus (`research/07-retrieval-eval-results.md`), not assumed:

1. Chunking per the ingestion standard §5: transcript line-windows on speaker seams
   (~700/1,100 chars, line-id ranges); page-as-chunk for filings (split >3,500 chars,
   keeping `page_no`); verbatim `content` separate from prefixed `embedding_input`.
2. Embeddings: `gemini-embedding-001` @1536 (MRL, re-normalized). OpenAI ruled out on
   measured Hebrew quality (2/15 vs 7/15).
3. Hybrid dense + lexical fused with RRF; the deterministic metadata prefix is load-bearing
   (removing it: rank 1 → 417). Lexical channel = dual-form `tsvector 'simple'` (surface +
   prefix-stripped ו/ה/ב/ל/מ/ש/כ) — **gated by one harness re-run against real Postgres**
   before Chat ships on it (the eval's BM25 was an in-process simulation).
4. Resolve the company first, filter by `company_id` — the single biggest measured
   multiplier (MRR 0.300 → 0.365), and the honest empty result for out-of-corpus companies
   falls out for free.
5. Route by scope size: small scope → stuff whole docs; big/cross-corpus → top-20.
6. Search mode diversifies per company — one company must not monopolize the top-20
   (measured on case 04); gated by the class-G discovery cases (ticket 15).

Retrieval executes in the Next.js server at query time; chunks are written at ingestion.
The standing harness at `scripts/retrieval-eval/` gates every retrieval change against
`docs/eval/retrieval-eval-set.md` (18 anchored cases, two MUST-PASS: the intake regression
and the בז"א alias).

### 2.6 Data — tables and migrations

All additive, all through the DDL gate (file → review → COLLISIONS.md → apply). Full column
shapes: ingestion standard §"migration list".

**Shared corpus** (no `user_id`; copy `20260714_012`/`20260801_014` RLS —
`FOR SELECT TO authenticated USING (true)`):

| Table / change | Contents |
| --- | --- |
| `CREATE EXTENSION vector` | justified by measurement (ticket 07) |
| `company_aliases` | the resolver's data — the first build item |
| `document_chunks` | chunk identity, exactly-one source (transcript TEXT FK / document uuid), `company_id`, `revision`, anchors (line range XOR page), verbatim `content`, `embedding_input`, `embedding vector(1536)` + HNSW, dual-form tsvector + GIN |
| `filing_facts` | XBRL numerics keyed by `mayaReportId` (26 ifrs-full concepts + ifrs-il metadata) |
| `company_documents.publication_date` | additive column, filled from MAYA at birth |
| `transcripts` additions | `source_key` + UNIQUE, `revision`, `company_id` NOT NULL via `CHECK NOT VALID → VALIDATE` |

**Personal layer** (copy migrations 015/016 verbatim — FK to `auth.users`, RLS both sides
`to authenticated`, composite child FKs, `user_id` index; never the five FK-less tables):

| Table | Contents |
| --- | --- |
| `agents` | name, description, mission (free text), scope target, schedule, status |
| `agent_runs` | one row per run incl. honest "ran, found nothing new"; `maxBudget` + usage accounting |
| `agent_run_events` | **append-only** reasoning/tool events → visible thinking + the reflection ticker |
| `agent_findings` | anchored findings (the `report_finding` contract) |
| `agent_memory` | the standing note + summaries — visible and editable |
| agent chat turns | **append-only turn rows** — never the whole-jsonb thread PUT (slice-2 MAJOR) |

Artifacts (files the agent produced) → owner-scoped Supabase Storage bucket, rendered in
the agent's chat.

**Suspect data rule** (foundation review): threads stored by the pre-rewrite `/api/chat`
may contain silently-amputated answers and Hebrew error sentinels persisted as real
content. Nothing in the smart layer (memory, retrieval, agent context) treats pre-rewrite
thread content as ground truth.

### 2.7 Ingestion and the filing corpus (tickets 16 + 17)

`docs/INGESTION-STANDARD.md` governs how every document is born: identity/dedup at birth
(`source_key`), born attributed at every door, real per-line timestamps persisted from word
timings, the measured chunk shapes with ONE shared chunker, XBRL facts + publication date,
atomic re-chunk with drift rendering, one global MAYA limiter, visible `index_status`.

Filing corpus scale (ticket 17, approved + probe-verified):

- **Scope**: periodic financial reports + investor presentations. Immediate disclosures
  stay OUT (measured: 85–95% of volume, mostly mechanical noise).
- **Backfill**: demo-first "latest of each" per company — latest quarterly + latest annual +
  12 months of presentations, all 234 companies ≈ 55–70K pages ≈ **$5–8 one-time**
  embeddings, ≈ 400MB pgvector. Deepening (1/3/5 years) is additive later.
- **Freshness, layered**: ~10-minute poll of `latest-companies-disclosures` + nightly
  per-company `by-issuer` sweep, both through the birth sequence; identity keys make a
  sweep and a user click converge on one row.
- **Extraction**: plain text now (≈ $0). LLM per-page blurbs are NOT purchased until the
  standing harness measures their retrieval gain.
- **Probe facts the pipeline obeys**: detect financial statements by **event ids
  101/104/105/106, never `.xbrl` presence** (dual-listed issuers like ICL have none — they
  ingest as PDFs with a visible "no structured facts" flag); `.htm`-only rows are a scope
  boundary, not a bug; a future full-market ingest needs an event-id denylist.

### 2.8 Agents on Managed Agents (tickets 06 + 08)

The V1 experience (ticket 06, decided): create (name + free-text mission + scope picker:
sector / company / both) → **"Bring agent to life"** → the agent introduces its plan in
Hebrew, human vibes, and asks to confirm → armed. Runs are mission-driven: manual +
scheduled in V1; Note Taker runs on the polished transcript the moment it lands (same
machinery, simple mission); event-triggered hooks V1.5, live mid-call V2, free-play V2.

Integration mechanics (ticket 08 §7, `research/06-managed-agents.md`):

- Supabase-backed tools reach the hosted session via **custom-tool event round-trips**
  (tunneled MCP stays research-preview). `idle` time waiting on our round-trips is unbilled.
- **Findings and memory-of-record live in Supabase.** Anthropic-side session + memory store
  are **deleted as soon as a run completes** and its findings/artifacts land; memory is
  re-created from Supabase each run. Nothing of a fund's research accumulates outside our DB.
- Run events stream into `agent_run_events` → visible thinking + the reflection ticker.
- **Budget caps**: native per-session `budget` in cents (run: 100¢; Note Taker: 50¢) +
  our `maxBudget` accounting on the run row. `session.usage.list_cost` is the authoritative
  per-session figure; client-side estimates are never billed onward.
- Agent chat: fresh session per conversation; continuity is OUR Supabase state. Two
  fidelities — side panel ↔ full page (a first-class frontend requirement).
- Hebrew end to end; the bidi law applies to every new surface.

### 2.9 Security laws inherited (tickets 03 + 12, standing law)

- Every new route: `getRequestUserId` + `unauthorized()` — the boundary test scans it.
  Post-auth **authorization** is the part the test cannot see: judge every write against
  `docs/DATA-MODEL.md`'s three lines (corpus writes = admin curation; personal rows =
  owner-only; curation→derived propagation the one exception).
- New personal tables use the **user client + RLS** (projects/workspaces pattern), not
  supabaseAdmin + app filter. An agent runner that must use the service role states that
  per module and owner-filters every query.
- Prompt-injection posture: ALL untrusted text (corpus content, titles, labels, web
  content) rides inside defanged fences; instructions never share a channel with quoted
  material. Closed before any prompt gains tools (§2.2).
- The rewrite must not "harden" shared-corpus reads into per-user scoping — shared read is
  a founder ruling. `transcripts.user_id` stays load-bearing for writes.

## 3 · The chat rewrite (ticket 08 §6)

A new unified chat backend replaces `POST /api/chat`. The slice-1 BLOCKERs die by
construction:

- **Errors and degradation move out-of-band.** The stream carries framed events (answer
  deltas / tool activity / degradation / error), never in-band Hebrew sentinel text. A
  mid-stream provider failure ends the message as *visibly truncated* — a partial answer is
  never persisted as complete. DB failure ≠ "no transcripts exist". Missing-key ≠ a 200
  answer.
- Source fencing + defanged titles from day one; the W1 answer-layer guard in the system
  prompt; `x-chat-source`-class metadata carried in the new framing.
- `streamChat`'s **two callers** (`ChatView`, `TranscriptChatPanel`) are updated in the
  same change that retires the old route wire format — no half-migrated client renders
  error frames as content.
- Persistence keeps backward compatibility: absent degradation fields on old stored turns
  mean "complete", never "unknown, warn".

**Migration order (founder-approved): Chat → Ask Atlas surfaces → Workspace chat (only
once the new retrieval measurably beats the planner on the eval set) → Agents in parallel
(they replace nothing).** Each step ships alone; `main` stays working.

## 4 · Hebrew token arithmetic — the correction this spec carries

Ticket 11 measured Sonnet 5 on real Hebrew: **1.43 chars/token**, vs the 2.1 chars/token
(Gemini-calibrated) the eval counts used — Claude-side Hebrew token counts are **×1.47**
the eval figures, worse than the ×1.3 research/09 assumed. Consequences:

1. Every Claude cost line in research/09 §2 scales ~×1.13 further (the ×1.47/×1.3 ratio) on
   its Hebrew-dominated portion. Recomputed budgets: §5.
2. **The scope router's ceiling is defined in Claude tokens** (~40K), estimated at 1.43
   chars/token for Hebrew — NOT with `plan.ts`'s 2.1 calibration, which under-counts Claude
   tokens by ~47% and would blow the budget cap. The token estimator used for budgeting the
   new backend is recalibrated (and re-measured with `count_tokens` on long transcript
   prose during slice 6, per research/11's caveat that the 1.43 sample was short questions).
3. Embedding/Gemini arithmetic is unchanged (different tokenizer, negligible cost).

## 5 · Cost budgets — recomputed, for the founder to veto or approve

In plain language: **at list prices, one fund on typical daily use costs about $35–50 a
month in AI.** One chat answer ≈ 6 cents (~₪0.22); one full agent run ≈ half a dollar.
The measured Hebrew correction moved each number up ~10–15% from the ticket-09 proposal.

| Budget | Typical (recomputed) | Hard cap | Enforced by |
| --- | --- | --- | --- |
| Chat / Ask Atlas / Workspace answer | **≤ $0.06** (was $0.05) | **≤ $0.15** | context ceilings (40K *Claude*-token stuffing ceiling, top-20 retrieval), `max_tokens`, ~4 round-trip cap |
| First turn on a large stuffed document | ≤ $0.13 | ≤ $0.15 | the scope router's ceiling, restated in Claude tokens (§4) |
| Agent run (Sonnet 5, standard mission) | **≤ $0.60** (was $0.50) | **≤ $1.00** | Managed Agents native `budget` = 100¢, platform-enforced |
| Note Taker / short mechanical run | ≤ $0.30 | ≤ $0.50 | same, 50¢ |
| Per fund, monthly | **~$40** (was $35) | alert at $100 | our accounting |
| Monthly envelope | 5 funds ≤ $250 · 30 funds ≤ $1,300 · 100 funds ≤ $4,200 | | monthly reconciliation vs Console |
| Ingestion backfill (one-time) | **$5–8** (ticket 17 demo scope) | ≤ $500 all-in | batch API + batch embeddings |

Worked bases (research/09 §2 arithmetic × the §4 correction): chat tool-loop answer $0.04 →
**≈ $0.055–0.06**; 20K stuffed first turn $0.06 → **≈ $0.09** (follow-ups ≈ $0.02, riding
the cache); agent run $0.39 → **≈ $0.55** (token subtotal $0.35 → $0.51 + runtime $0.01 +
web $0.03). Monthly typical per fund $32 → **≈ $38–40**; 5/30/100 funds ≈ **$190 / $1,150 /
$3,800**/mo typical.

Standing consequences (unchanged from ticket 09): caching is mandatory and worth 3–4× —
the chat loop is built cache-first (byte-stable system prompt + tool list, volatile facts
last); tool results are anchored windows, never documents; the Start tier's $500/mo cap now
binds at **~12 funds** typical (was ~15) — plan Build before that; accounting per request
(`usage` block) and per run (`list_cost`) reconciled monthly against the Console.

**Every build slice in §6 that calls a model states its arithmetic against these numbers.**

## 6 · Build sequence — small shippable slices

Each slice is one branch, one session, shipped via `/ship`; `main` stays working after
every one. The three execution missions already outside the map (ticket 13's cleanup ·
`profiles`/`access_requests` policy narrowing · the PUT admin-gate) run independently and
before or alongside Phase A — nothing below depends on them except where noted.

**Phase A — the corpus becomes searchable (no user-facing change until A5)**

| # | Slice | Contents | Acceptance | Cost |
| --- | --- | --- | --- | --- |
| A1 | Foundations migrations | the §2.6 shared-corpus set: pgvector, `company_aliases`, `document_chunks`, `filing_facts`, `publication_date`, `transcripts` columns | fully specified below — the first slice | $0 |
| A2 | Company resolver | seed `company_aliases` (registered names, common abbreviations, tickers; בז"א included), `resolveCompany()` + unit tests | בז"א MUST-PASS case green offline; resolver returns null honestly for unknowns | $0 |
| A3 | Birth sequence | ONE shared chunker module; single transcript birth door (`source_key`, born-attributed); persisted line-timestamp alignment; XBRL facts + publication date in `ingestFiling()`; global MAYA limiter | the standard's "mechanisms owed" table, each law with its test | $0 |
| A4 | Backfill + harness re-run | existing corpus (5 transcripts, 23 documents) through the standard; embed ~3,200 chunks | **the standing 18-case harness re-runs against the REAL pipeline (pgvector + real tsvector) and reproduces the measured results** — the gate for every surface slice | ≈ $0.35 |
| A5 | MAYA demo backfill + freshness | "latest of each" per company; ~10-min poller + nightly sweep | spot-check: a fresh filing searchable ≤ ~15 min after publication; `index_status` visible in admin | **$5–8** one-time, ~$1–7/mo |

**Phase B — the surfaces move to the one brain (order is law: B1 → B2 → B3)**

| # | Slice | Contents | Acceptance | Cost |
| --- | --- | --- | --- | --- |
| B1a | Unified chat backend (server) | new route: Sonnet 5 tool loop, the §2.2 registry (minus agents-only tools), out-of-band framing, fencing + defang, verify-at-write citations, cache-first prompt; old route still serves clients | route tests: 401 path, injection fence, error framing, intake-regression simulation (mid-conversation correction reaches `resolve_company`) | ≤ $0.06/answer |
| B1b | Chat surface | `ChatView` onto the new backend; `@company` autocomplete from the alias table; **visible search mode** with leads-style diversified answers; degradation UI | both MUST-PASS eval cases green end-to-end; class-G discovery cases green; `/verify-app` both locales, every state | ≤ $0.06/answer |
| B2 | Ask Atlas surfaces | `TranscriptChatPanel` (live calls, transcripts, multiview) + company-page chat onto the new backend: whole-call injection recipe + company scoping; retire the old `/api/chat` wire format | `/verify-app` on live-call, transcript and company surfaces, both locales | ≤ $0.06/answer; stuffed first turn ≤ $0.13 |
| B3 | Workspace chat | swap the planner's scoring for the retrieval subsystem; defang the workspace fence line (titles/labels); keep `truncated[]`/`omitted[]` honesty | **gated: new retrieval measurably beats the planner on the eval set**; workspace honesty states verified in browser | ≤ $0.06/answer |

**Phase C — agents, in parallel with Phase B (start after A4)**

| # | Slice | Contents | Acceptance | Cost |
| --- | --- | --- | --- | --- |
| C1 | Agent tables + create flow | the §2.6 personal-layer migrations (015/016 template); create UI on the existing frontend contract; "Bring agent to life" intro (one Messages call) + confirm → armed | non-owner 403 tests; intro renders in Hebrew, bidi-clean; no run machinery yet | ~$0.01/intro |
| C2 | Run engine | Managed Agents integration: agent definition, session start, custom-tool round-trip webhook, `report_finding` verify-at-write, native 100¢ budget, Anthropic-side deletion on completion, run rows incl. "found nothing new" | an end-to-end mission on a real company produces only verifiably-anchored findings; a fabricated anchor is rejected; deletion confirmed post-run | ≤ $0.60/run |
| C3 | Agent chat + memory + ticker | two-fidelity chat (append-only turns), visible/editable memory, `agent_run_events` → visible thinking + reflection ticker | `/verify-app` both fidelities; memory edit round-trips; ticker live during a run | ≤ $0.06/answer |
| C4 | Note Taker + scheduling | post-polish trigger + manual/scheduled runs (staggered crons), the Note Taker mission preset | a finished call yields notes minutes after polish, displayed as the scheduled agent it is | ≤ $0.30/run |

**Phase D — accounting.** D1: per-request/per-run usage rows, the per-fund monthly view,
the $100 alert, Console reconciliation. Small, ships any time after B1a.

Deliberately NOT in the sequence (decided): user memory (design only), event-triggered
agents (V1.5), live mid-call notes and free-play agents (V2), LLM page blurbs
(measure-first), immediate disclosures (measured out), deeper filing history (additive
later), `.htm` extraction (scope boundary).

### Slice A1, fully specified — the foundations migrations

One branch (`feat/smart-layer-foundations`), six additive migrations under
`supabase/migrations/`, filed → reviewed on the file (atlas-reviewer) → appended to
`COLLISIONS.md` → applied, per `.claude/rules/db.md`. No app code changes beyond types.

1. `YYYYMMDD_NNN_pgvector.sql` — `CREATE EXTENSION IF NOT EXISTS vector;`
2. `YYYYMMDD_NNN_company_aliases.sql` — shared-corpus shape: `id uuid PK`,
   `company_id uuid NOT NULL REFERENCES companies(id)` (uuid — the live `companies.id`
   type, migration `20260611_006`; an earlier draft said bigint), `alias text NOT NULL`,
   `kind text NOT NULL` (`registered|abbreviation|ticker|latin`), `UNIQUE (alias)`,
   index on `company_id`; RLS + `FOR SELECT TO authenticated USING (true)`; writes
   service-role only (no other policy).
3. `YYYYMMDD_NNN_document_chunks.sql` — per §2.6: exactly-one-source CHECK
   (`transcript_id text REFERENCES transcripts(id)` XOR
   `document_id uuid REFERENCES company_documents(id)`), `company_id NOT NULL`,
   `revision int NOT NULL`, anchor columns (`first_line_id`/`last_line_id` XOR
   `page_no` + `part_no`), `section text`, `speakers text[]`, `content text NOT NULL`,
   `embedding_input text NOT NULL`, `embedding vector(1536)`, HNSW index
   (`vector_cosine_ops`), generated dual-form tsvector column + GIN, index on
   `company_id`; same RLS shape.
4. `YYYYMMDD_NNN_filing_facts.sql` — `maya_report_id`, `company_id`, `concept text`,
   `value numeric`, `currency`, `period_start/period_end`, `metadata jsonb`,
   `UNIQUE (maya_report_id, concept, period_start, period_end)`; same RLS shape.
5. `YYYYMMDD_NNN_company_documents_publication_date.sql` —
   `ADD COLUMN publication_date timestamptz;` (backfilled in A4/A5, never shown as
   `created_at`).
6. `YYYYMMDD_NNN_transcripts_identity.sql` — `ADD COLUMN source_key text`,
   `ADD COLUMN revision int NOT NULL DEFAULT 1`, partial UNIQUE index on `source_key
   WHERE source_key IS NOT NULL`, and `ADD CONSTRAINT transcripts_company_required
   CHECK (company_id IS NOT NULL) NOT VALID` (VALIDATEd in A4 after the 5 rows are
   confirmed attributed — they are, per ticket 04).

Acceptance: reviewer verdict on the files BEFORE applying; battery green; `npm run
env:health` unchanged; a follow-up query confirms RLS enabled + the single SELECT policy
per new table (the banned `FOR ALL`/`WITH CHECK (true)`/`public` shape appears nowhere).
Risk to surface first (iron rule 6): these migrations touch the production DB; they are
additive-only and reviewed on file before apply — the founder is told before "apply" runs.

## 7 · Quality gates standing over the whole build

- `scripts/retrieval-eval/` vs `docs/eval/retrieval-eval-set.md` — every retrieval change;
  the two MUST-PASS cases gate B1 absolutely.
- `/verify-app` in both locales for every UI state a slice can render (M4); bidi law on
  every new surface.
- The auth boundary test scans every new route; curation writes go through `requireAdmin`
  (`curationAuthz.test.ts` pattern); new personal tables copy 015/016.
- Budget arithmetic per slice (§5); usage accounting from B1a onward.
- The ingestion standard's "mechanisms owed" table — each law lands with its enforcement,
  or says honestly that it is unenforced (ADR-0002).

## 8 · What the founder is approving

1. **This spec as the architecture of record** — assembled from his own approved decisions;
   approving it resolves ticket 10 and ends the map at its destination.
2. **The recomputed budgets (§5)** — answer ≤ $0.06 typical / $0.15 cap; agent run ≤ $0.60
   typical / $1.00 cap; ~$40/fund/mo; the numbers moved because measured Hebrew costs ~47%
   more Claude tokens than the estimator assumed, not because anything was re-designed.
3. **The build sequence (§6)** — Phase A first (the corpus becomes searchable, ~$6–9 total
   spend), then Chat → Ask Atlas → Workspace with agents in parallel; slice A1 starts on
   approval.
