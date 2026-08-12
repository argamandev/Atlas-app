# Foundations — the ground the smart layer sits on

Codebase survey, 2026-08-12. Verified by reading code + live Supabase queries. Read this
before working any ticket on this map.

## 1. LLM call sites today — two vendors, no Anthropic, no shared layer

No Anthropic code exists anywhere in `src/`. Two vendors, three implementations:

| Call site | Provider / model | Role |
| --- | --- | --- |
| `src/app/api/chat/route.ts` | Gemini `gemini-3.5-flash` primary, streaming; `openAiFallback()` → OpenAI `gpt-4.1` on 503 | The main chat (Chat, Ask Atlas, company page, projects) |
| `src/lib/workspace/askModel.ts` | OpenAI `gpt-4.1` primary + Gemini hedged at 6s, temp 0, JSON mode | Workspace chat / compose / intake (3 routes) |
| `src/lib/transcription.ts` | Gemini formatter (+ GPT fallback), Whisper ASR fallback, RunPod IVRIT primary ASR | Transcript pipeline |
| `scripts/live-broadcast.mjs` | Gemini per-utterance caption correction | Live :8788 engine |

Known inconsistency: the founder's 2026-08-05 "lead with OpenAI" instruction reached
`askModel.ts` but never `/api/chat`, which still leads with Gemini. `src/lib/correction.ts`
is dormant Timlul-era code (imported only by its own test). Agents call no model at all.
No tool-calling and no agent loop exist anywhere — both chat routes are single-shot.

## 2. Two chat backends, four front doors

"Ask Atlas" is not a separate backend — every front door hits one of two routes:

- **`POST /api/chat`** serves Chat, project chat, Ask Atlas on live calls and company pages.
  Context = exactly ONE transcript (`src/lib/chat/context.ts`), flattened, hard-cut at
  40,000 chars; optional ≤4-page `REPORT CONTEXT`; ≤4 Pinge image snips; `PROJECT CONTEXT`
  (8,000-char budget with honest `x-project-context: truncated|failed` header); last 8 turns.
  No cross-call search, no ranking, no company data, no calendar. **This is the weak one —
  it gets rewritten, not extended.**
- **`POST /api/workspaces/[id]/chat`** is the strong one and the built retrieval seam:
  `src/lib/workspace/chat/plan.ts` — 18,000-token prompt budget, budget split (25% history),
  windows cut along document seams (`## section` for transcripts, `[p.N]` for documents),
  Hebrew-aware term-overlap scoring (strips leading ו/ה/ב/ל/מ/ש/כ), fairness pass, and
  visible `truncated[]`/`omitted[]` honesty in the UI. Token estimate calibrated: 2.1
  chars/token Hebrew, 3.9 Latin. Sources fenced with `<<<ATLAS-SOURCE …>>>` (prompt-injection
  boundary, `context.ts:156-158`). Its own comments say: "step 2 is the only part that
  changes — swap term overlap for embedding similarity and everything either side stays."
  The founder's verdict 2026-08-12: still "not good — sometimes unable to pull required
  documents"; it is the better seam, not the standard.

## 3. The corpus

- **`transcripts`** (60 rows; `id` is TEXT): the chunkable unit is
  `formatted_data.sections[].lines[]` — every line already carries a stable id (`L0001`) and
  timestamp. Shared-read RLS (`transcripts_shared_read`, migration `20260801_014`); `user_id`
  still load-bearing for writes. **Only 5 of 60 rows carry a `company_id`** — the other 55
  are Timlul-era and the founder ruled 2026-08-12 they are exported then deleted (ticket 04).
- **`company_documents`** (23) + **`document_pages`** (2,549; `document_id, page_no, text`):
  page-anchored plain text — the cheapest thing in the repo to embed. `company_documents`
  has NO publication-date column (`created_at` = ingestion time, a different fact).
- **MAYA**: cached = `maya_issuers` (233; **all `name_en` NULL**, no alias table — בז"א
  resolves to nothing), `companies` (234), `scheduled_calls` (895). Live per request =
  `listDisclosures()` (~1.6s / 4 years) and `ingestFiling()` (PDF pulled only when a user
  opens it). Deliberately no local filings-catalog table (`src/lib/workspace/intake/corpus.ts`).
  Rate limit 10 req / 2s across the whole key. `Accept-Language: he-IL` mandatory.

## 4. Vectors — zero today

`vector` 0.8.0 is AVAILABLE on the Supabase instance but **not installed**; no `pg_trgm`, no
full-text index, no embeddings table, no migration or code touching embeddings. Enabling the
extension is a real migration through the DDL gate (`.claude/rules/db.md`: file first, review,
COLLISIONS.md, then apply). `docs/DATA-MODEL.md` already fixes the shape: embeddings of
shared documents belong to the SHARED corpus (no `user_id`); open question — one
`document_embeddings` table vs per-source-type tables.

## 5. The Agents stub — a UI contract that already exists

`src/lib/agents/data.ts` is frontend-only (hardcoded `DEMO`, rendered behind a DemoBanner).
The contract worth treating as a spec: an agent = **name, description, one scope target
(`'Call'|'Workspace'|'Company'|'Sector'|'Report'`), a schedule** → produces **findings, each
with a source string** (e.g. `"Q1 call · 14:02 · CEO"`). `src/app/app/agents/page.tsx`
already derives real assignment targets from real workspaces; only the runtime, findings and
scheduling are fake. Components: `src/components/agents/{AgentsPage,AgentDock,CommandDeck,CreateAgent}.tsx`.

## 6. Workspace document model — citation anchors are already shipped

Migration `20260803_016`: `workspaces`, `workspace_items` (exactly-one-provenance CHECK;
composite `(workspace_id, user_id)` FK because PG referential checks bypass RLS),
`workspace_threads` (whole-conversation jsonb, whole-array PUT), and **`workspace_doc_blocks`**
— the 2026-08-01 structured-blocks decision, live: anchor quartet `source_item_id` +
`source_label` + (`source_page` XOR `source_line_id`) + `source_quote`, FK `ON DELETE SET
NULL` so a removed source renders a visibly broken citation instead of deleting the writing.
`source_quote` exists because `formatted_data` is REGENERATED on re-processing — `L0004` can
come back meaning different words; comparing the snapshot is the only way to render
"drifted" instead of a plausible lie. **Chunks must carry these anchors from day one.**

## 7. Prior art (searched, including `docs/archive/`)

- `docs/archive/cross-cutting-2026-07-03--2026-08-10.md` — the smart-layer brief verbatim
  ([2026-08-09 18:10], [2026-08-10 00:20], [2026-08-10 00:45]): tool-call architecture, RAG,
  Claude Agent SDK, cost-per-answer as a design constraint. Plus the intake defect
  root-cause: `intake/route.ts:87` freezes the FIRST user turn, so a mid-conversation
  company correction never reaches the resolver — proved `resolveIssuer('בית זיקוק אשדוד')`
  → 1361 while `resolveIssuer('בז"א')` → null. **The intake bug is the chapter's acceptance
  test** — a tool-boundary defect, not a prompt defect.
- `docs/DATA-MODEL.md` — reads shared / writes personal; the law any new table obeys.
- `docs/product/2026-08-01-projects-workspace-agents-brief.md` — "cross-archive retrieval is
  a foundation all three features sit on… specced once, on its own."
- `docs/superpowers/specs/2026-08-04-workspace-experience-design.md` D8 — vector retrieval
  deferred to this chapter; **"Hebrew embedding quality, on our own transcripts: ten
  questions with known answers, retrieval vs whole-file, compared. Measured, not assumed."**
- `docs/product/2026-08-09-documents-catalog-findings.md` — measured MAYA facts.
- `ARCHITECTURE.md` §2C (chat flow), §8 gap #6 (intake), `docs/open-findings.md`.

## The five facts that shape the plan

1. The two chat backends are not one layer; `/api/chat` is the weak one and gets rewritten —
   the target pattern (budgeting, windowing, honesty) already exists in `plan.ts`.
2. `vector` is not installed, and installing it is a gated migration on the production DB.
3. The corpus cannot be cited before it is attributed — cleanup (ticket 04) and
   born-attributed ingestion are prerequisites of quality, not nice-to-haves.
4. The citation-anchor format is decided and shipped (`workspace_doc_blocks`); transcript
   lines carry stable ids. The smart layer inherits it.
5. The intake bug is the ready-made acceptance test, with a proved expected answer.
