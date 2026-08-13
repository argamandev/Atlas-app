-- 025 — filing_facts: XBRL structured numerics per filing (smart-layer slice A1,
-- spec §2.6; ingestion standard §6; probe facts in
-- docs/archive/scratch/smart-layer-map-2026-08/research/14-maya-structured-data.md).
--
-- ADDITIVE ONLY. Reviewed on the file BEFORE apply, per .claude/rules/db.md.
--
-- WHY. Numeric questions ("what was Tigbur's revenue in Q1?") become LOOKUPS, not
-- searches (the `lookup_facts` tool, spec §2.2). `ingestFiling()` parses the filing's
-- .xbrl attachment when present — the 26 ifrs-full concepts + ifrs-il metadata (MAGNA
-- ref, receipt time, auditor, review qualification) — keyed by the filing's MAYA report
-- id. A missing fact set is "no structured facts", NEVER zeros; foreign-track issuers
-- (ICL-shaped, no ISA XBRL) get a visible "no structured facts" flag, not silence.
--
-- Keyed by maya_report_id VALUE, deliberately not a foreign key: the only unique index
-- on company_documents.maya_report_id is partial (WHERE not null), which Postgres does
-- not accept as an FK target. The ingest writes facts and the document row in one flow,
-- so the pairing is the pipeline's to keep (slice A3).
--
-- SHARED CORPUS, NOT USER DATA — no user_id, same reasoning as 019/023/024.

create table if not exists public.filing_facts (
  id uuid primary key default gen_random_uuid(),
  maya_report_id bigint not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- XBRL concept name, e.g. 'ifrs-full:Revenue'; ifrs-il metadata concepts ride the
  -- same column.
  concept text not null,
  -- numeric facts carry value; textual metadata facts (auditor name, MAGNA ref) may
  -- carry theirs in metadata instead — value is nullable on purpose.
  value numeric,
  currency text,
  -- XBRL duration facts carry start+end; instant facts (balance-sheet items) are
  -- written start = end by the parser. Both nullable because pure metadata facts
  -- have no period at all.
  period_start date,
  period_end date,
  metadata jsonb,
  created_at timestamptz not null default now(),
  -- One fact per (report, concept, period). NULLS NOT DISTINCT (PG 15+; live server
  -- verified 17.6) so period-less metadata facts dedupe too — under default UNIQUE
  -- semantics two NULL periods count as distinct and re-ingest would silently pile up
  -- duplicate rows.
  constraint filing_facts_fact_uniq
    unique nulls not distinct (maya_report_id, concept, period_start, period_end)
);

-- Named access pattern: lookup_facts filters by company (then concept/period).
-- maya_report_id lookups ride the unique constraint's index.
create index if not exists filing_facts_company_idx
  on public.filing_facts (company_id);

alter table public.filing_facts enable row level security;

-- A LEGITIMATE SHARED-CORPUS READ — the 012/014 shape: SELECT only, to authenticated,
-- never public. Writes are ingestFiling()'s job through the service role.
create policy filing_facts_read on public.filing_facts
  for select to authenticated using (true);
