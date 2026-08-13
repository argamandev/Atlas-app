-- 024 — document_chunks: the retrieval substrate (smart-layer slice A1, spec §2.6 + §2.5,
-- ingestion standard §5).
--
-- ADDITIVE ONLY. Reviewed on the file BEFORE apply, per .claude/rules/db.md.
--
-- WHAT. One row per retrieval chunk, for both corpus source types:
--   * transcripts — line-windows cut on speaker seams (~700/1,100 chars), anchored by
--     first_line_id/last_line_id (the "call · minute · line" citation law);
--   * filings — page-as-chunk (oversized pages split into parts), anchored by
--     page_no (+ part_no when split).
-- Chunks are DERIVED DATA: rebuildable at any time from the source row, carrying the
-- source's `revision`; re-processing rebuilds a source's chunks atomically (remove +
-- reinsert in one transaction) so a reader never sees half a transcript's chunks.
--
-- SHARED CORPUS, NOT USER DATA — no user_id, same reasoning as migration 019/023.
--
-- content vs embedding_input (ingestion standard §5, LAW): `content` is verbatim and
-- citable — it is what source_quote drift comparison runs against; `embedding_input` is
-- the deterministic metadata prefix + content (removing the prefix collapsed retrieval:
-- rank 1 → 417, eval finding 2). Separate columns; the prefix never enters `content`.

-- ─────────────────────────────────────────────────────────────────────────────
-- The lexical channel's tokenizer, in the database.
--
-- The measured shape (eval finding: dual-form 'simple' tsvector) indexes every token
-- twice: its surface form, and — for Hebrew tokens of 4+ chars starting with a clitic
-- prefix (ו/ה/ב/ל/מ/ש/כ) — the form with that one leading clitic stripped. This mirrors
-- tokenize() in scripts/retrieval-eval/run.mjs; the A4 harness re-run against REAL
-- Postgres is the gate that this SQL reproduces the measured results before any surface
-- ships on it (the eval's BM25 was an in-process simulation).
--
-- IMMUTABLE is honest here: to_tsvector with an explicit config and regexp_replace are
-- both immutable, so the function qualifies for a stored generated column. If A4's
-- re-run demands a tweak, `create or replace function` is additive and the atomic
-- re-chunk (remove + reinsert) recomputes stored values for every rebuilt row.
--
-- Known, accepted divergence from the harness: the second to_tsvector re-indexes ALL
-- words (not only clitic-bearing ones), so non-clitic terms carry doubled positions.
-- Recall (which rows match) is identical; scoring is ts_rank/RRF territory and is
-- exactly what the A4 gate measures.
create or replace function public.atlas_dual_tsv(input text)
returns tsvector
language sql
immutable
parallel safe
as $$
  select to_tsvector('simple', input)
      || to_tsvector(
           'simple',
           regexp_replace(
             input,
             '(^|[^0-9A-Za-z֐-׿])[והבלמשכ]([0-9A-Za-z֐-׿]{3})',
             '\1\2',
             'g'
           )
         )
$$;

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),

  -- Exactly one source (CHECKed below). Types match the live schema:
  -- transcripts.id is TEXT (video id / live call id), company_documents.id is uuid.
  -- Cascade: chunks are derived data — they die with their source.
  transcript_id text references public.transcripts(id) on delete cascade,
  document_id uuid references public.company_documents(id) on delete cascade,

  -- Not merely a convenience label: generated, so it CANNOT disagree with which
  -- source column is set (M3 — the lying state is unrepresentable).
  source_type text generated always as (
    case when transcript_id is not null then 'transcript' else 'filing' end
  ) stored,

  -- Born attributed, like everything in the corpus. The company filter is the single
  -- biggest measured retrieval multiplier (eval finding 4).
  company_id uuid not null references public.companies(id) on delete cascade,

  -- The source row's revision this chunk was cut from (ingestion standard §8):
  -- re-polish bumps the source revision and rebuilds chunks; anchors downstream carry
  -- source_quote snapshots precisely because L-ids renumber across revisions.
  revision int not null,

  -- Anchors — transcript chunks carry a line range, filing chunks a page (+ optional
  -- part when an oversized page was split; null part_no = the whole page).
  first_line_id text,
  last_line_id text,
  page_no int,
  part_no int,

  section text,
  speakers text[],

  content text not null,
  embedding_input text not null,
  embedding extensions.vector(1536),
  tsv tsvector generated always as (public.atlas_dual_tsv(embedding_input)) stored,

  created_at timestamptz not null default now(),

  constraint document_chunks_exactly_one_source check (
    (transcript_id is not null)::int + (document_id is not null)::int = 1
  ),
  -- Anchor columns match the source type — a transcript chunk with a page number (or a
  -- filing chunk with line ids) is not representable.
  constraint document_chunks_anchors_match_source check (
    (
      transcript_id is not null
      and first_line_id is not null and last_line_id is not null
      and page_no is null and part_no is null
    )
    or
    (
      document_id is not null
      and page_no is not null
      and first_line_id is null and last_line_id is null
    )
  )
);

-- Dense channel: HNSW, cosine — the measured retrieval shape (spec §2.5). Built now,
-- while the table is empty, so creation is instant.
create index if not exists document_chunks_embedding_hnsw
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Lexical channel.
create index if not exists document_chunks_tsv_gin
  on public.document_chunks using gin (tsv);

-- Named access pattern: retrieval filters by company_id (pinpoint mode; the measured
-- multiplier above).
create index if not exists document_chunks_company_idx
  on public.document_chunks (company_id);

-- Named access pattern: the atomic rebuild removes a single source's chunks
-- (`where transcript_id = X` / `where document_id = X`), and the FK cascades walk the
-- same paths. Partial — each index only carries rows of its own source type.
create index if not exists document_chunks_transcript_idx
  on public.document_chunks (transcript_id) where transcript_id is not null;
create index if not exists document_chunks_document_idx
  on public.document_chunks (document_id) where document_id is not null;

alter table public.document_chunks enable row level security;

-- A LEGITIMATE SHARED-CORPUS READ — the 012/014 shape: SELECT only, to authenticated,
-- never public. Writes are the ingestion pipeline's job through the service role,
-- which bypasses RLS and needs no policy.
create policy document_chunks_read on public.document_chunks
  for select to authenticated using (true);
