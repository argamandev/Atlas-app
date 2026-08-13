-- 027 — transcripts identity: source_key, revision, and company_id required
-- (smart-layer slice A1, spec §2.6; ingestion standard §1–§2).
--
-- ADDITIVE ONLY. Reviewed on the file BEFORE apply, per .claude/rules/db.md.
--
-- WHY, in three parts:
--
-- 1. source_key — dedup at birth. A corpus document's identity is its real-world
--    source (YouTube/Vimeo video id, live call), never our row id. The PyuMxe88e8g_live
--    lesson: the same Tigbur call written twice, and the duplicate outranked its twin
--    in every retrieval design (eval finding 6). No ranker fixes a duplicate — it dies
--    at this door. UNIQUE is partial (WHERE not null) because the 5 existing rows are
--    backfilled in A4; until then null means "not yet keyed", and nulls must not block
--    each other.
--
-- 2. revision — re-processing updates the SAME row, bumping revision (ingestion
--    standard §8). Chunks carry the revision they were cut from; anchors carry
--    source_quote snapshots because L-ids renumber across revisions. Default 1: every
--    existing row is its own first revision.
--
-- 3. company_id required — born attributed (founder decision 2026-08-12, DECISIONS.md:
--    no unattributed corpus rows, ever again). NOT VALID defers checking EXISTING rows;
--    verified against the live DB before filing (2026-08-13): 5 rows, 0 with null
--    company_id, so VALIDATE in A4 is a formality once source_keys are backfilled.
--
--    STATED CONSEQUENCE, not discovered later: a NOT VALID check still binds NEW writes
--    immediately. Two current doors can write company_id null — POST /api/transcripts
--    (an import not started from a company page) and finishLiveCall's ticker-miss
--    (which today "quietly stores null on a miss"). From this migration on those writes
--    FAIL VISIBLY at the database instead of minting an unattributed corpus row — that
--    is the law working (an unattributed row is invisible to the company filter that
--    makes search good, and the 55-row Timlul export proved this cannot be
--    retrofitted). The single birth door that resolves the company BEFORE the row
--    exists lands in slice A3; until then an unresolvable company surfaces as a visible
--    error, per the founder-approved standard.

alter table public.transcripts
  add column if not exists source_key text;

alter table public.transcripts
  add column if not exists revision int not null default 1;

create unique index if not exists transcripts_source_key_uniq
  on public.transcripts (source_key)
  where source_key is not null;

-- add constraint has no if-not-exists form; guarded for idempotence.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transcripts_company_required'
      and conrelid = 'public.transcripts'::regclass
  ) then
    alter table public.transcripts
      add constraint transcripts_company_required
      check (company_id is not null) not valid;
  end if;
end $$;
