-- 029 — atlas_search_chunks: the REAL retrieval pipeline (smart-layer slice A4).
--
-- ADDITIVE ONLY (two new functions, no table touched). Reviewed on the file BEFORE
-- apply, per .claude/rules/db.md.
--
-- WHY THIS EXISTS IN A4. The eval that chose the design (ticket 07) ran entirely in
-- process: brute-force cosine and an in-memory BM25 simulation of the 'simple' tsvector.
-- Slice A4's acceptance is that the harness re-runs against the REAL pipeline — pgvector
-- + the real Postgres lexical channel — and reproduces the measured results. That real
-- pipeline is THIS function; without it "the real pipeline" would be a second copy of the
-- retrieval logic living in the harness, which is exactly the fiction the one-chunker law
-- (ingestion standard §5) exists to forbid. src/lib/corpus/retrieve.ts is its only caller,
-- and the harness calls that module.
--
-- WHAT IT DOES — the measured design C-gemini(-scoped), verbatim:
--   dense    : cosine over document_chunks.embedding (HNSW, gemini-embedding-001 @1536)
--   lexical  : the dual-form 'simple' tsvector (surface + clitic-stripped ו/ה/ב/ל/מ/ש/כ)
--   fusion   : RRF, k = 50, weights 1/1 (the Supabase recipe's defaults, as measured)
--   scope    : an optional company_id PRE-filter — the single biggest measured retrieval
--              multiplier (eval finding 4). Pre-filtering is what production does; the
--              harness's scoped numbers were an explicit post-filter APPROXIMATION, and
--              closing that gap is part of what this slice measures.
-- A null embedding runs lexical-only; a null/blank query text runs dense-only. Both null
-- is an error rather than a silent empty result set (M3.3: "success with nothing" is not a
-- state this returns).
--
-- SECURITY INVOKER (the default) is deliberate: document_chunks' RLS — SELECT to
-- authenticated, the legitimate shared-corpus shape from 012/014/024 — keeps applying to
-- whoever calls. EXECUTE defaults to PUBLIC on new functions, so it is revoked and
-- re-granted narrowly, as in 028.

-- ─────────────────────────────────────────────────────────────────────────────
-- The query-side twin of atlas_dual_tsv (024).
--
-- OR semantics, deliberately: the eval's BM25 scores a document by summing the terms it
-- HAS, so a chunk missing one query word still ranks. plainto_tsquery/websearch_to_tsquery
-- are AND by default and would silently measure a different, far stricter design than the
-- one the founder approved (M2 — a green test asserting a wrong premise is worse than no
-- test).
--
-- Terms come out of atlas_dual_tsv itself, so query and document are tokenized by the SAME
-- code: a clitic-stripped query form finds a surface-form document and vice versa, exactly
-- as the harness's tokenize() dual-indexes both sides.
create or replace function public.atlas_dual_tsquery(input text)
returns tsquery
language sql
immutable
parallel safe
as $$
  select coalesce(
    (
      select string_agg(quote_literal(lexeme), ' | ')::tsquery
      from (select distinct lexeme from unnest(public.atlas_dual_tsv(input))) t
    ),
    ''::tsquery
  )
$$;

create or replace function public.atlas_search_chunks(
  p_query_embedding extensions.vector(1536) default null,
  p_query_text text default null,
  p_company_id uuid default null,
  p_limit int default 20,
  p_candidates int default 200,
  p_rrf_k int default 50
) returns table (
  id uuid,
  source_type text,
  transcript_id text,
  document_id uuid,
  company_id uuid,
  revision int,
  first_line_id text,
  last_line_id text,
  page_no int,
  part_no int,
  section text,
  speakers text[],
  content text,
  dense_rank int,
  lexical_rank int,
  score double precision
)
language plpgsql
stable
as $$
declare
  v_tsquery tsquery;
  v_has_text boolean;
begin
  v_has_text := p_query_text is not null and btrim(p_query_text) <> '';
  if p_query_embedding is null and not v_has_text then
    raise exception 'atlas_search_chunks: needs a query embedding, a query text, or both';
  end if;

  if v_has_text then
    v_tsquery := public.atlas_dual_tsquery(p_query_text);
    -- A query of nothing but stop-ish punctuation yields an empty tsquery, which matches
    -- every row at rank 0 in some formulations. Treat it as "no lexical channel" instead.
    if v_tsquery = ''::tsquery then
      v_has_text := false;
    end if;
  end if;

  -- HNSW returns at most ef_search candidates per scan; asking for p_candidates while
  -- ef_search sits at its default 40 silently truncates the dense channel and would make a
  -- deep-rank measurement report "not found" for something the index simply never looked at
  -- (M1). Raised for this transaction only.
  perform set_config('hnsw.ef_search', greatest(p_candidates, 40)::text, true);

  return query
  with dense as (
    select
      c.id as chunk_id,
      row_number() over (order by c.embedding <=> p_query_embedding) as rnk
    from public.document_chunks c
    where p_query_embedding is not null
      and c.embedding is not null
      and (p_company_id is null or c.company_id = p_company_id)
    order by c.embedding <=> p_query_embedding
    limit p_candidates
  ),
  lexical as (
    select
      c.id as chunk_id,
      row_number() over (order by ts_rank_cd(c.tsv, v_tsquery, 1) desc, c.id) as rnk
    from public.document_chunks c
    where v_has_text
      and c.tsv @@ v_tsquery
      and (p_company_id is null or c.company_id = p_company_id)
    order by ts_rank_cd(c.tsv, v_tsquery, 1) desc, c.id
    limit p_candidates
  ),
  fused as (
    select
      coalesce(d.chunk_id, l.chunk_id) as chunk_id,
      d.rnk as dense_rank,
      l.rnk as lexical_rank,
      coalesce(1.0 / (p_rrf_k + d.rnk), 0) + coalesce(1.0 / (p_rrf_k + l.rnk), 0) as score
    from dense d
    full outer join lexical l on l.chunk_id = d.chunk_id
  )
  select
    c.id,
    c.source_type,
    c.transcript_id,
    c.document_id,
    c.company_id,
    c.revision,
    c.first_line_id,
    c.last_line_id,
    c.page_no,
    c.part_no,
    c.section,
    c.speakers,
    c.content,
    f.dense_rank::int,
    f.lexical_rank::int,
    f.score::double precision
  from fused f
  join public.document_chunks c on c.id = f.chunk_id
  -- chunk id breaks ties so a rerun of the same query returns the same order: an eval gate
  -- whose ranks wobble between runs cannot tell a regression from a coin flip.
  order by f.score desc, c.id
  limit p_limit;
end $$;

revoke execute on function public.atlas_dual_tsquery(text) from public;
revoke execute on function public.atlas_search_chunks(extensions.vector, text, uuid, int, int, int) from public;
grant execute on function public.atlas_dual_tsquery(text) to authenticated, service_role;
grant execute on function public.atlas_search_chunks(extensions.vector, text, uuid, int, int, int) to authenticated, service_role;
