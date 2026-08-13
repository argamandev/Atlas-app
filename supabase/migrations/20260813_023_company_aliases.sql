-- 023 — company_aliases: the company resolver's data (smart-layer slice A1, spec §2.6).
--
-- ADDITIVE ONLY. Reviewed on the file BEFORE apply, per .claude/rules/db.md.
--
-- WHY. Resolving the company FIRST and filtering retrieval by company_id was the single
-- biggest measured retrieval multiplier (MRR 0.300 → 0.365, eval finding 4), and the
-- resolver's data is this table: every way users actually write an issuer's name —
-- registered Hebrew name, common abbreviation (בז"א), ticker, Latin name — mapped to one
-- companies row. Seeded and used by slice A2 (`resolveCompany()`); callable every chat
-- turn per the tool registry (spec §2.2).
--
-- SHARED CORPUS, NOT USER DATA — deliberately no user_id: which aliases name which TASE
-- issuer is the same fact for every member (docs/DATA-MODEL.md). Same reasoning as
-- maya_issuers in migration 019.
--
-- NOTE the spec's A1 text spelled company_id as bigint; the live schema's companies.id
-- is uuid (migration 006), so uuid is what a real foreign key can reference. The spec
-- file is corrected in the same branch (its own rule: where spec and record disagree,
-- the record wins and the spec gets fixed).

create table if not exists public.company_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  alias text not null,
  -- The four founder-approved kinds (spec §6 slice A1). A CHECK rather than prose:
  -- a typo'd kind would silently break the resolver's ranking between alias kinds.
  kind text not null
    constraint company_aliases_kind_check
    check (kind in ('registered', 'abbreviation', 'ticker', 'latin')),
  created_at timestamptz not null default now(),
  -- One alias resolves to exactly one company — an ambiguous alias is a seeding
  -- decision to make explicitly (pick the primary bearer or leave the alias out),
  -- never a runtime coin-flip.
  constraint company_aliases_alias_uniq unique (alias)
);

-- Named access pattern: "all aliases of this company" (seeding upkeep, showing a
-- company's aliases in admin, cascade maintenance).
create index if not exists company_aliases_company_idx
  on public.company_aliases (company_id);

alter table public.company_aliases enable row level security;

-- A LEGITIMATE SHARED-CORPUS READ — the 20260714_012 / 20260801_014 shape:
-- command scope SELECT only, no write check, role `authenticated` (never `public`).
-- Writes are the seeder's job through the service role, which bypasses RLS and
-- therefore needs no policy of its own.
create policy company_aliases_read on public.company_aliases
  for select to authenticated using (true);
