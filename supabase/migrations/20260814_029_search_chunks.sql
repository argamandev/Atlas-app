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
-- WHAT IT DOES — the measured design C-gemini(-scoped):
--   dense    : cosine over document_chunks.embedding (HNSW, gemini-embedding-001 @1536)
--   lexical  : the dual-form 'simple' tsvector (surface + clitic-stripped ו/ה/ב/ל/מ/ש/כ)
--   fusion   : RRF, k = 50, weights 1/1 (the Supabase recipe's defaults, as measured)
--   scope    : an optional company_id filter — the single biggest measured retrieval
--              multiplier (eval finding 4).
--
-- ONE HONEST DIFFERENCE FROM THE MEASUREMENT, stated here rather than discovered later:
-- the lexical SCORER is `ts_rank_cd`, not BM25. The tokenizer is identical on both sides,
-- so RECALL (which rows can match) is the measured one; the ORDER within those rows is a
-- different function, and a clitic-bearing term is counted twice because the dual tsvector
-- indexes it at the same positions twice. Reproducing the measured ranks is therefore a
-- claim to be TESTED by the A4 harness re-run, never one this header may assert (M1).
--
-- A null embedding runs lexical-only; a null/blank query text runs dense-only. A call that
-- would leave BOTH channels off raises instead of returning zero rows — "success with
-- nothing" is not a state this function can express (M3.3).
--
-- SECURITY INVOKER (the default) is deliberate: document_chunks' RLS — SELECT to
-- authenticated, the legitimate shared-corpus shape from 012/014/024 — keeps applying to
-- whoever calls. EXECUTE defaults to PUBLIC on new functions, so it is revoked from
-- public/anon/authenticated and re-granted narrowly, exactly as 028 does.

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
--
-- WORD-SHAPED LEXEMES ONLY. The `simple` parser can emit tokens carrying punctuation
-- (file paths, urls, hosts); those reach tsquery through quote_literal as the E'…' escape
-- form, which the tsquery parser reads as a bare `E` followed by a quoted lexeme and
-- REJECTS — so one stray backslash in a question would turn a search into an error. The
-- filter also happens to be the harness's own rule (`tokenize()` strips every non-word
-- character before indexing), so dropping them moves this closer to the measured design,
-- not further from it. Quoting is otherwise injection-safe: tsquery uses the same
-- doubled-quote convention SQL does.
create or replace function public.atlas_dual_tsquery(input text)
returns tsquery
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select string_agg(quote_literal(lexeme), ' | ')::tsquery
      from (
        select distinct lexeme
        from unnest(public.atlas_dual_tsv(input))
        where lexeme ~ '^[0-9A-Za-z֐-׿]+$'
      ) t
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
  score double precision,
  -- HOW MUCH EACH CHANNEL ACTUALLY SAW. A channel that returned exactly
  -- p_candidates rows may have been cut off; one that returned fewer saw
  -- everything there was. Without these the caller cannot tell a thin answer
  -- from a complete one, and degradation must be VISIBLE (app.md).
  dense_candidates int,
  lexical_candidates int
)
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
declare
  v_tsquery tsquery;
  v_has_text boolean;
  v_ef int;
begin
  v_has_text := p_query_text is not null and btrim(p_query_text) <> '';
  if p_query_embedding is null and not v_has_text then
    raise exception 'atlas_search_chunks: needs a query embedding, a query text, or both';
  end if;

  if v_has_text then
    v_tsquery := public.atlas_dual_tsquery(p_query_text);
    -- A query of nothing but punctuation yields an empty tsquery, which matches no row
    -- rather than every row. Turn the channel off, and if that leaves nothing on, say so
    -- instead of returning an empty set that reads like "the corpus has nothing".
    if v_tsquery = ''::tsquery then
      v_has_text := false;
      if p_query_embedding is null then
        raise exception 'atlas_search_chunks: the query has no searchable terms (%)', p_query_text;
      end if;
    end if;
  end if;

  -- HNSW returns at most ef_search candidates per scan; asking for p_candidates while
  -- ef_search sits at its default 40 silently truncates the dense channel and would make a
  -- deep-rank measurement report "not found" for something the index never looked at (M1).
  -- Clamped: pg raises "outside the valid range" above 1000, and a caller passing a bigger
  -- number should get a working search, not a 22023.
  v_ef := least(greatest(p_candidates, 40), 1000);
  perform set_config('hnsw.ef_search', v_ef::text, true);

  -- THE FILTERED-SEARCH TRAP, and the reason this line exists. An HNSW scan walks the
  -- graph and applies the WHERE clause to what it finds, so a scoped query is served the
  -- GLOBAL nearest ef_search rows and then throws away everything outside the company —
  -- which can leave a handful of rows for a company holding hundreds, with nothing in the
  -- output saying so. `iterative_scan` makes the scan keep going until enough rows survive
  -- the filter; `strict_order` keeps them in true distance order, which a ranking gate
  -- cannot do without. pgvector 0.8.0 on this database (verified 2026-08-14).
  if p_company_id is not null then
    perform set_config('hnsw.iterative_scan', 'strict_order', true);
  end if;

  return query
  -- TWO STEPS PER CHANNEL, NOT ONE. A window function in the same query level as the
  -- ORDER BY/LIMIT is evaluated BEFORE the limit, over every row the WHERE matched — which
  -- makes the planner sort the whole table and throws away the index this migration exists
  -- to use. Rank the LIMITED set instead. At today's ~3k chunks either shape answers
  -- correctly; at A5's ~60k pages only this one answers quickly, and the version that
  -- quietly stopped using the index would look identical from here.
  with dense_raw as (
    select c.id as chunk_id, c.embedding <=> p_query_embedding as dist
    from public.document_chunks c
    where p_query_embedding is not null
      and c.embedding is not null
      and (p_company_id is null or c.company_id = p_company_id)
    order by c.embedding <=> p_query_embedding
    limit p_candidates
  ),
  dense as (
    -- chunk_id breaks distance ties so a rerun of the same query ranks the same way: an
    -- eval gate whose ranks wobble between runs cannot tell a regression from a coin flip.
    select chunk_id, row_number() over (order by dist, chunk_id) as rnk from dense_raw
  ),
  lexical_raw as (
    select c.id as chunk_id, ts_rank_cd(c.tsv, v_tsquery, 1) as rank_score
    from public.document_chunks c
    where v_has_text
      and c.tsv @@ v_tsquery
      and (p_company_id is null or c.company_id = p_company_id)
    order by ts_rank_cd(c.tsv, v_tsquery, 1) desc, c.id
    limit p_candidates
  ),
  lexical as (
    select chunk_id, row_number() over (order by rank_score desc, chunk_id) as rnk from lexical_raw
  ),
  seen as (
    select (select count(*) from dense)::int as d, (select count(*) from lexical)::int as l
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
    f.score::double precision,
    seen.d,
    seen.l
  from fused f
  join public.document_chunks c on c.id = f.chunk_id
  cross join seen
  order by f.score desc, c.id
  limit p_limit;
end $$;

revoke execute on function public.atlas_dual_tsquery(text) from public, anon, authenticated;
revoke execute on function public.atlas_search_chunks(extensions.vector, text, uuid, int, int, int)
  from public, anon, authenticated;
grant execute on function public.atlas_dual_tsquery(text) to authenticated, service_role;
grant execute on function public.atlas_search_chunks(extensions.vector, text, uuid, int, int, int)
  to authenticated, service_role;
