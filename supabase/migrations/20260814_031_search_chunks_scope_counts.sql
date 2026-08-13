-- 031 — atlas_search_chunks_v2: completeness measured against the SCOPE (slice A5).
--
-- ADDITIVE ONLY (one new function, no table touched, nothing dropped, nothing revoked
-- from what 029 granted). Reviewed on the file BEFORE apply, per .claude/rules/db.md.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS. Ticket 05 (slice A5) owes it, and A4 wrote down why: the
-- `truncated` flag `retrieveChunks` returns had a blind spot that opens at exactly
-- this slice's scale.
--
-- 029 reports how many rows each channel produced (dense_candidates /
-- lexical_candidates). The caller compared that against the requested POOL: fewer
-- than the pool was read as "the channel saw everything there was". That inference
-- is true only while every scan is exhaustive — which is a property of a 3,181-row
-- corpus, where the planner seq-scans, and NOT a property of the code. Two ways it
-- goes silently false once the corpus is big enough for HNSW to engage, which is
-- what A5's backfill makes it:
--
--   * `hnsw.ef_search` caps an index scan at ≤1000 candidates. A 5,000-row pool over
--     a 60K-chunk corpus can only ever come back with 1000 — under the pool, and
--     reported complete.
--   * a scoped `iterative_scan = strict_order` walk stops at `hnsw.max_scan_tuples`
--     (20,000 by default), which can end a company-filtered search well under the
--     pool while most of that company's chunks were never looked at.
--
-- Both are a thin answer reported as a complete one — the exact failure the
-- "degradation must be VISIBLE" law exists to prevent (.claude/rules/app.md).
--
-- THE FIX IS TO STOP INFERRING. Give the caller the fact instead of a proxy for it
-- (app.md M3.2): how many rows the channel could have matched IN THIS SCOPE.
-- Completeness is then `saw < least(pool, in_scope)` — the channel is cut short
-- when it returned less than BOTH what the caller asked for and what the scope
-- holds. Neither Postgres ceiling appears in that comparison; the pool does, and
-- must, because the pool is a number the CALLER chose. A top-20 search over 60K
-- chunks is not a degradation, and a rule that flagged it would be the loud
-- failure mode this file already made once (see below) wearing new clothes.
--
-- ⚠ THE FIRST VERSION OF THIS MIGRATION GOT EXACTLY THAT WRONG — `saw < in_scope`,
-- which is permanently true for any scope bigger than the pool, i.e. every
-- production query after this slice's backfill. Caught in pre-apply review, which
-- is what the pre-apply review is for: applied, it could only have been narrowed
-- by a hook-blocked DROP.
--
-- COUNTED UP TO `p_candidates + 1`, NEVER FURTHER, and that bound is load-bearing
-- rather than an optimisation. `least(pool, in_scope)` cannot tell an in_scope of
-- 201 from one of 61,402 when the pool is 200, so counting past the pool changes
-- no answer and would make every search pay for a full count of document_chunks.
-- The capped count is EXACT whenever it lands at or below the pool — the only
-- range that changes the answer — and saturates at pool+1 otherwise. It is named
-- `_capped` so nothing downstream can mistake it for "how much the corpus holds"
-- and print it at a user.
--
-- ⚠ WHAT THE `limit` DOES AND DOES NOT BOUND, because the first version of this
-- comment claimed more than it can deliver: it bounds rows RETURNED, not rows
-- SCANNED. The scan ends as soon as 201 matching rows have been found, so the work
-- is small exactly when the predicate is dense and NOT when it is sparse — and the
-- sparse case is this slice's own mid-backfill state, where most chunks have no
-- embedding yet and the dense probe walks a long way to find 201 that do. The
-- lexical probe has a second shape: a GIN scan builds its match bitmap before any
-- limit applies, so a term the corpus holds everywhere (`שנת`, 96% of chunks per
-- the A4 gate) is a bitmap over most of the table whatever the limit says. Neither
-- is measured here. What IS true unconditionally is that the bound removes the
-- unbounded-by-construction full count, and that both probes read the null bitmap
-- / the index rather than detoasting any vector.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A NEW NAME RATHER THAN `create or replace` ON 029. Ticket 05 assumed this
-- would be an in-place replace. It cannot be: widening a `returns table` changes the
-- function's return type, and Postgres refuses that on `create or replace`
-- ("cannot change return type of existing function"). The way round it is
-- `drop function` first — which is hook-blocked on this database, correctly, and
-- costs a founder round-trip (COLLISIONS.md, 2026-08-14, probe_idf_tsquery).
--
-- So 029's function STAYS, untouched and still granted. That is also the safe
-- ordering for a live deploy: this migration is applied while Railway is still
-- running the code that calls the old function, and that code keeps working
-- unchanged until the new build ships. Once it has, `atlas_search_chunks` is dead
-- weight with no caller; removing it is a founder-run DROP, filed as an open item
-- rather than done quietly here.
--
-- EVERYTHING ELSE IS 029 VERBATIM — the same dense channel, the same lexical
-- channel, the same RRF k=50 1/1 fusion, the same company pre-filter, the same
-- SECURITY INVOKER (so document_chunks' RLS keeps applying to whoever calls), the
-- same grants. Retrieval behaviour is byte-for-byte what the A4 gate measured; only
-- the completeness reporting is new. That matters: a retrieval-shape change would
-- re-run the eval gate (ingestion standard §5), and this deliberately is not one.

create or replace function public.atlas_search_chunks_v2(
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
  -- HOW MUCH EACH CHANNEL ACTUALLY SAW …
  dense_candidates int,
  lexical_candidates int,
  -- … AND HOW MUCH THERE WAS TO SEE, counted no further than p_candidates + 1.
  -- The pair is the point: either number alone is a proxy, and it was reasoning
  -- from the first one alone that produced the blind spot this migration closes.
  -- `_capped` is not decoration — at p_candidates + 1 this says "more than the
  -- pool", NOT how many chunks the scope holds.
  dense_in_scope_capped int,
  lexical_in_scope_capped int,
  -- WHICH CHANNELS ACTUALLY RAN, from the only place that knows. The caller can
  -- work out that it switched a channel off, but not that THIS FUNCTION did: a
  -- query whose tsquery comes out empty (punctuation only, or terms the tokenizer
  -- drops) downgrades the lexical channel below, and without this the caller
  -- reports a half-strength hybrid search as a full one — `ran and found nothing`
  -- wearing `never ran`'s clothes, which is the distinction its own ChannelReport
  -- documents.
  dense_ran boolean,
  lexical_ran boolean
)
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
declare
  v_tsquery tsquery;
  v_has_text boolean;
  v_ef int;
  v_dense_in_scope int := 0;
  v_lexical_in_scope int := 0;
begin
  v_has_text := p_query_text is not null and btrim(p_query_text) <> '';
  if p_query_embedding is null and not v_has_text then
    raise exception 'atlas_search_chunks_v2: needs a query embedding, a query text, or both';
  end if;

  if v_has_text then
    v_tsquery := public.atlas_dual_tsquery(p_query_text);
    -- A query of nothing but punctuation yields an empty tsquery, which matches no row
    -- rather than every row. Turn the channel off, and if that leaves nothing on, say so
    -- instead of returning an empty set that reads like "the corpus has nothing".
    if v_tsquery = ''::tsquery then
      v_has_text := false;
      if p_query_embedding is null then
        raise exception 'atlas_search_chunks_v2: the query has no searchable terms (%)', p_query_text;
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

  -- ── the capped scope counts ────────────────────────────────────────────────
  -- COUNTED ONLY FOR A CHANNEL THAT RAN. A count for a switched-off channel is a
  -- number nobody asked for, paid for on every query; and the caller reports
  -- `ran: false` for it anyway, which is a different fact from "ran and saw none".
  --
  -- THE INNER `limit` REMOVES THE UNBOUNDED FULL COUNT — read the ⚠ in the header
  -- for what it does and does not bound; it is not a promise about scan cost.
  --
  -- Each probe's row predicate is the same as its channel's below, term for term
  -- (`embedding is not null` + the company filter; `tsv @@ v_tsquery` + the company
  -- filter). The channel-on conditions — `p_query_embedding is not null` and
  -- `v_has_text` — are the same too, hoisted into the enclosing `if` rather than
  -- repeated in the WHERE. That correspondence is the whole reason
  -- `saw <= in_scope_capped` holds: a probe over a DIFFERENT predicate would be a
  -- proxy again, and could hand back an incoherent pair.
  --
  -- Both counts and both channels read one snapshot because this function is
  -- declared `stable` — the whole call sees the calling query's snapshot. That is
  -- load-bearing at THIS slice above all others: the backfill and the poller insert
  -- chunks while users are searching, and under `volatile` a count taken after the
  -- channel ran could include rows the channel could not have seen, making
  -- `saw > in_scope` unrepresentable only by luck. Do not relax `stable`.
  if p_query_embedding is not null then
    select count(*)::int into v_dense_in_scope
    from (
      select 1
      from public.document_chunks c
      where c.embedding is not null
        and (p_company_id is null or c.company_id = p_company_id)
      limit p_candidates + 1
    ) probe;
  end if;

  if v_has_text then
    select count(*)::int into v_lexical_in_scope
    from (
      select 1
      from public.document_chunks c
      where c.tsv @@ v_tsquery
        and (p_company_id is null or c.company_id = p_company_id)
      limit p_candidates + 1
    ) probe;
  end if;

  return query
  -- TWO STEPS PER CHANNEL, NOT ONE. A window function in the same query level as the
  -- ORDER BY/LIMIT is evaluated BEFORE the limit, over every row the WHERE matched — which
  -- makes the planner sort the whole table and throws away the index this migration exists
  -- to use. Rank the LIMITED set instead. At A4's ~3k chunks either shape answers
  -- correctly; at this slice's ~60k pages only this one answers quickly, and the version
  -- that quietly stopped using the index would look identical from here.
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
    seen.l,
    v_dense_in_scope,
    v_lexical_in_scope,
    (p_query_embedding is not null),
    v_has_text
  from fused f
  join public.document_chunks c on c.id = f.chunk_id
  cross join seen
  order by f.score desc, c.id
  limit p_limit;
end $$;

-- EXECUTE defaults to PUBLIC on a new function, and PostgREST exposes every
-- public-schema function as an RPC endpoint — so an un-revoked function is a live
-- anon-callable endpoint (COLLISIONS.md, 2026-08-14, probe_idf_tsquery). Same
-- narrowing 028 and 029 use.
revoke execute on function
  public.atlas_search_chunks_v2(extensions.vector, text, uuid, int, int, int)
  from public, anon, authenticated;
grant execute on function
  public.atlas_search_chunks_v2(extensions.vector, text, uuid, int, int, int)
  to authenticated, service_role;
