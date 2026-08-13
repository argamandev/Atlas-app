-- 028 — visible index status + the atomic re-chunk door (smart-layer slice A3,
-- ingestion standard §5 + §8; the "mechanisms owed" table).
--
-- ADDITIVE ONLY. Reviewed on the file BEFORE apply, per .claude/rules/db.md.
--
-- 1. index_status — LAW: an embedding failure is visible, never silent. Every corpus
--    source carries pending/indexed/failed/excluded; search must never pretend an
--    unindexed document doesn't exist, and a chunk row without its embedding is not a
--    success state (M3.3). 'excluded' is the demo/test-content state (standard §1:
--    demo rows never enter the corpus — the chunker refuses them and says so here,
--    visibly, instead of leaving an eternal 'pending').
--    Default 'pending' is honest for every existing row: nothing is chunked until the
--    A4 backfill runs.
--
-- 2. facts_status (filings) — LAW: a missing XBRL fact set is "no structured facts",
--    NEVER zeros; foreign-track issuers (ICL-shaped, no ISA XBRL) get a visible flag,
--    not silence (standard §6). NULL = predates this migration / not yet examined.
--      'facts'  — filing_facts rows were written from the .xbrl attachment
--      'none'   — no .xbrl attachment, or it carried no numeric fact set
--      'failed' — the attachment existed but could not be fetched/parsed (visible,
--                 retryable — never recorded as 'none')
--
-- 3. atlas_replace_chunks — LAW: chunks are derived data, rebuilt ATOMICALLY on
--    re-processing (delete + reinsert in one transaction — a reader never sees half a
--    transcript's chunks). supabase-js cannot open a transaction, so the transaction
--    IS this function. It also carries embeddings forward server-side: a new chunk
--    whose embedding_input is byte-identical to a deleted one inherits its embedding
--    (the hash-cache law — an unchanged chunk re-embeds for free, with zero payload
--    cost). It RETURNS the ids still needing embeddings; the caller embeds those,
--    updates each row, and only then flips index_status to 'indexed'.

alter table public.transcripts
  add column if not exists index_status text not null default 'pending';

alter table public.company_documents
  add column if not exists index_status text not null default 'pending';

alter table public.company_documents
  add column if not exists facts_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transcripts_index_status_valid'
      and conrelid = 'public.transcripts'::regclass
  ) then
    alter table public.transcripts
      add constraint transcripts_index_status_valid
      check (index_status in ('pending', 'indexed', 'failed', 'excluded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'company_documents_index_status_valid'
      and conrelid = 'public.company_documents'::regclass
  ) then
    alter table public.company_documents
      add constraint company_documents_index_status_valid
      check (index_status in ('pending', 'indexed', 'failed', 'excluded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'company_documents_facts_status_valid'
      and conrelid = 'public.company_documents'::regclass
  ) then
    alter table public.company_documents
      add constraint company_documents_facts_status_valid
      check (facts_status is null or facts_status in ('facts', 'none', 'failed'));
  end if;
end $$;

-- The atomic re-chunk. Exactly one of p_transcript_id / p_document_id names the source;
-- p_chunks is a jsonb array of chunk rows (ids client-generated). Chunk anchors and the
-- exactly-one-source shape are enforced by document_chunks' own CHECK constraints — this
-- function adds atomicity and embedding carry-forward, nothing else.
create or replace function public.atlas_replace_chunks(
  p_transcript_id text,
  p_document_id uuid,
  p_chunks jsonb
) returns table (chunk_id uuid)
language plpgsql
as $$
begin
  if (p_transcript_id is null) = (p_document_id is null) then
    raise exception 'atlas_replace_chunks: exactly one of p_transcript_id / p_document_id required';
  end if;

  return query
  with old as (
    select distinct on (dc.embedding_input) dc.embedding_input, dc.embedding
    from public.document_chunks dc
    where dc.embedding is not null
      and ((p_transcript_id is not null and dc.transcript_id = p_transcript_id)
        or (p_document_id is not null and dc.document_id = p_document_id))
    order by dc.embedding_input, dc.created_at desc
  ),
  gone as (
    delete from public.document_chunks dc
    where (p_transcript_id is not null and dc.transcript_id = p_transcript_id)
       or (p_document_id is not null and dc.document_id = p_document_id)
  ),
  new_rows as (
    select *
    from jsonb_to_recordset(p_chunks) as x(
      id uuid,
      company_id uuid,
      revision int,
      first_line_id text,
      last_line_id text,
      page_no int,
      part_no int,
      section text,
      speakers text[],
      content text,
      embedding_input text
    )
  ),
  ins as (
    insert into public.document_chunks
      (id, transcript_id, document_id, company_id, revision,
       first_line_id, last_line_id, page_no, part_no,
       section, speakers, content, embedding_input, embedding)
    select
      n.id, p_transcript_id, p_document_id, n.company_id, n.revision,
      n.first_line_id, n.last_line_id, n.page_no, n.part_no,
      n.section, n.speakers, n.content, n.embedding_input, o.embedding
    from new_rows n
    left join old o on o.embedding_input = n.embedding_input
    returning document_chunks.id, document_chunks.embedding
  )
  select ins.id from ins where ins.embedding is null;
end $$;

-- Service-role only: the ingestion pipeline's door, not a client API. EXECUTE defaults
-- to PUBLIC on new functions — revoke it; the service role connects as a member of the
-- postgres-owned side and bypasses RLS anyway.
revoke execute on function public.atlas_replace_chunks(text, uuid, jsonb) from public;
revoke execute on function public.atlas_replace_chunks(text, uuid, jsonb) from anon;
revoke execute on function public.atlas_replace_chunks(text, uuid, jsonb) from authenticated;
grant execute on function public.atlas_replace_chunks(text, uuid, jsonb) to service_role;
