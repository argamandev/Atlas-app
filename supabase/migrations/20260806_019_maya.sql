-- 019 — MAYA / TASE Data Hub: the issuer directory, and filing identity on documents.
--
-- ADDITIVE ONLY. This database is shared with production Timlul, so nothing here
-- removes, renames or narrows anything. Reviewed BEFORE being applied, per
-- `.claude/rules/db.md`: a policy cannot be walked back without DROP/ALTER, both
-- of which are hook-blocked, so review-after-apply would be an inverted gate.
--
-- Context: `docs/MAYA-API.md` (the live contract) and
-- `docs/superpowers/specs/2026-08-06-maya-layer-and-workspace-pull-design.md`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE ISSUER DIRECTORY.
--
-- MAYA is keyed by issuer number and users type company names, so this table is
-- the hinge the whole feature turns on. Note `tase_security_id` is NOT this
-- number — Tigbur is issuer 1460 and security 1105022, unrelated schemes.
--
-- SHARED CORPUS, NOT USER DATA, so it deliberately carries no `user_id`: which
-- companies exist on the Tel Aviv exchange is the same fact for every member
-- (`docs/DATA-MODEL.md`). The ownership law in `.claude/rules/db.md` governs
-- user-facing tables; this is reference data, and giving it a fake owner would
-- be worse than giving it none.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.maya_issuers (
  issuer_id  integer primary key,
  name_he    text,
  name_en    text,
  updated_at timestamptz not null default now()
);

alter table public.maya_issuers enable row level security;

-- A LEGITIMATE SHARED-CORPUS READ, and the distinction matters.
--
-- This is `for select` + role `authenticated` — the shape already shipped in
-- `20260611_006` for `companies` and `scheduled_calls`, and explicitly
-- distinguished in `.claude/rules/db.md` from the banned
-- `for all … with check (true)` granted to `public`. The three differences that
-- make it safe are all present: command scope is SELECT only, there is no write
-- check to subvert, and the role is `authenticated` rather than `public` (which
-- would hand it to anyone holding the anon key that ships in the browser bundle).
--
-- Writes are the refresh script's job, through the service role, which bypasses
-- RLS and therefore needs no policy of its own.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'maya_issuers' and policyname = 'maya_issuers_read'
  ) then
    create policy maya_issuers_read on public.maya_issuers
      for select to authenticated using (true);
  end if;
end $$;

-- Name lookups are how this table is read; the directory is ~233 rows today but
-- is refreshed wholesale and will grow with the market.
create index if not exists maya_issuers_name_he_idx on public.maya_issuers (name_he);
create index if not exists maya_issuers_name_en_idx on public.maya_issuers (name_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FILING IDENTITY ON company_documents.
--
-- A MAYA filing's real identity is its report number. Recording it lets the
-- intake know what Atlas already holds, and makes re-pulling the same filing a
-- no-op instead of a 23505 surfaced as a 500.
--
-- THE EXISTING UNIQUE CONSTRAINT company_documents_company_id_quarter_doc_type_key
-- STAYS AND IS STILL THE UPSERT TARGET. It cannot be removed here (additive-only,
-- and DROP is hook-blocked), so the consequence is stated in the spec rather
-- than discovered in production: for one company, period and document type Atlas
-- holds the most recently pulled filing, so a company's corrected presentation
-- replaces the erroneous one — which is what an analyst wants.
--
-- This column does NOT explain the two same-titled rows already in the table.
-- Both are `source: 'manual'` with different quarters; a person mislabelled one
-- at ingest. That is a data decision for the founder, not something a migration
-- should quietly rewrite.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.company_documents add column if not exists maya_report_id bigint;

-- Partial, because every hand-ingested row is legitimately NULL and NULLs would
-- otherwise be the only thing this index contained.
create unique index if not exists company_documents_maya_report_uniq
  on public.company_documents (maya_report_id)
  where maya_report_id is not null;
