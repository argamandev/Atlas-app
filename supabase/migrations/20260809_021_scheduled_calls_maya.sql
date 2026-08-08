-- 021 — teach `scheduled_calls` what the MAYA report schedule actually says.
--
-- NOT YET APPLIED when this file was written. Per `.claude/rules/db.md`, DDL
-- against this database (shared with production Timlul) is reviewed as a FILE
-- and applied afterwards, because narrowing or removing anything here would need
-- DROP/ALTER, both blocked on purpose. That gate ran and returned CHANGES; this
-- file is the second draft. What the review removed is recorded at the bottom,
-- because two of the three blockers were things that would have been PERMANENT.
--
-- ADDITIVE ONLY: five columns, two CHECKs, one UNIQUE. Nothing is dropped,
-- renamed or retyped, no existing row's data is touched, and no statement in
-- this file contains a removal verb. RLS is unchanged — `scheduled_calls` stays
-- shared corpus (migration 006's `for select to authenticated using (true)`),
-- and this migration adds no `user_id`, which is correct for a shared table per
-- `docs/DATA-MODEL.md`. New columns inherit that policy.
--
-- Every DDL statement is wrapped in an existence guard rather than
-- `drop … if exists; create …`, which is the re-runnable idiom already used by
-- migration 019 for its policy. The `drop`-first spelling is refused by
-- `.claude/hooks/pre-bash-gate.mjs` on BOTH doors, and correctly so.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY EACH COLUMN EXISTS. Every claim below was measured against the live MAYA
-- feed on 2026-08-09 across the 925 schedule rows of 2025+2026, not assumed.
--
-- `kind` — MAYA's `financialReportTypeId` splits the feed in two:
--     1 = שיחת ועידה   (a conference call: a real appointment)
--     2 = פרסום דוחות  (a report publication: a date, not an appointment)
--   The calendar reads an optional `kind` hint
--   (`src/lib/calendar/event-meta.ts`); this column supplies it. 'webinar' is
--   permitted by the CHECK but nothing writes it — webinars are deliberately a
--   later slice (founder decision 2026-08-09).
--
-- `time_known` — THE HONESTY COLUMN, and the reason this migration is not just
--   the key. Measured: conference calls carry a time in 452 of 453 rows; report
--   publications carry one in 0 of 472. `scheduled_at` is NOT NULL, so a
--   publication must be stored at SOME instant — midnight Israel time on its
--   date. Without this flag the UI cannot tell that midnight from a real 00:00
--   appointment and would print a clock for 461 of the 879 rows the sync writes.
--   Defaults true so the four existing rows (all `source='mock'`, all with real
--   times) keep their meaning without a backfill.
--
-- `maya_year`, `maya_period_type_id`, `maya_report_type_id` — the natural key,
--   because THE SCHEDULE FEED SHIPS NO ROW ID. A row is
--   {scheduledDate, scheduledTime, financialReportTypeId, issuerId, year,
--    periodTypeId, timeZone, url} and nothing in it is stable-and-unique, so a
--   re-run has nothing to upsert against. `scheduled_calls` had NO unique
--   constraint of any kind before this file, so a second sync would have
--   duplicated all ~879 rows — and DELETE is hook-blocked, so those duplicates
--   would have been unremovable.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE UNIQUE CONSTRAINT IS PLAIN AND NOT PARTIAL: the obvious spelling is
-- `… where source = 'maya'`, which is a PARTIAL index — and Postgres will not
-- infer a partial index for `on conflict (cols)` without repeating its
-- predicate, which PostgREST does not emit. A plain UNIQUE needs no predicate
-- here because unique indexes are NULLS DISTINCT by default: every non-MAYA row
-- has NULL in all three `maya_*` columns and therefore collides with nothing,
-- including other non-MAYA rows. The four existing rows are unaffected and the
-- constraint validates over zero rows at apply time.
--
-- ⚠ THE COROLLARY, WRITTEN DOWN BECAUSE IT IS NOT OBVIOUS: this holds only
-- while hand-added calls leave the `maya_*` columns NULL. A manually created
-- call for a company+period MAYA also covers will appear on the calendar
-- alongside the synced one, and nothing in the database prevents that.
--
-- ⚠ AND THE LIMIT OF THE KEY ITSELF: it cannot represent two genuinely distinct
-- events for one company, period and type — an issuer that runs the same call in
-- Hebrew and in English (issuer 1916 does) collapses to one row, later wins.
-- That is a known loss, recorded in the spec's risks, not an oversight.

alter table public.scheduled_calls
  add column if not exists kind                text    not null default 'call',
  add column if not exists time_known          boolean not null default true,
  add column if not exists maya_year           int,
  add column if not exists maya_period_type_id int,
  add column if not exists maya_report_type_id int;

-- A closed vocabulary. This does NOT stop an unrecognised MAYA event becoming a
-- calendar kind — `src/lib/maya/schedule.ts` collapses every non-call into
-- 'report' before the database sees it — but it does stop hand-written SQL and a
-- future writer from inventing a fourth kind the UI has no icon or filter for.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scheduled_calls'::regclass and conname = 'scheduled_calls_kind_chk'
  ) then
    alter table public.scheduled_calls
      add constraint scheduled_calls_kind_chk check (kind in ('call', 'report', 'webinar'));
  end if;
end $$;

-- THE KEY MUST BE WHOLE, OR IT IS NOT A KEY. NULLs are distinct in a unique
-- constraint, which is exactly what makes the plain constraint above safe for
-- non-MAYA rows — and exactly what makes a MAYA row with a null key part
-- invisible to it. Such a row would conflict with nothing and be re-inserted on
-- every nightly run, accumulating duplicates that DELETE (hook-blocked) could
-- not clean up. `year` and `periodTypeId` are unvalidated wire fields, so this
-- is the database refusing what the parser might let through.
-- Existing rows are all `source='mock'` and satisfy the first branch.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scheduled_calls'::regclass and conname = 'scheduled_calls_maya_key_whole_chk'
  ) then
    alter table public.scheduled_calls
      add constraint scheduled_calls_maya_key_whole_chk check (
        source <> 'maya'
        or (maya_year is not null and maya_period_type_id is not null and maya_report_type_id is not null)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scheduled_calls'::regclass and conname = 'scheduled_calls_maya_key'
  ) then
    alter table public.scheduled_calls
      add constraint scheduled_calls_maya_key
      unique (company_id, maya_year, maya_period_type_id, maya_report_type_id);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- NO INDEX ON `kind`, DELIBERATELY — the first draft had one and the pre-apply
-- review caught it, which is the entire reason `.claude/rules/db.md` puts the
-- gate before the apply. `lib/db/calls.ts` is the only SQL against this table
-- and never filters on `kind`; the calendar's chips filter in React, over rows
-- already loaded. An index nothing uses costs a write on every insert, and
-- `drop index` is hook-blocked — so it would have been permanent. Migration 019
-- records the same lesson about name indexes on `maya_issuers`, and 020 exists
-- only to clean up two indexes that were not caught in time.
--
-- Existing indexes already cover every query: `scheduled_calls_time_idx` (the
-- `order by scheduled_at` and the `upcoming` scope) and
-- `scheduled_calls_company_idx` (the `companyId` filter), both from 006.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION TO RUN AFTER APPLYING (paste the output into the evidence file,
-- do not assert it from memory):
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema='public' and table_name='scheduled_calls'
--   order by ordinal_position;
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint where conrelid='public.scheduled_calls'::regclass
--   order by conname;
--
--   -- the four pre-existing rows must be untouched and still readable:
--   select id, source, kind, time_known, maya_year from public.scheduled_calls;
