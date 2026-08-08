-- 021 — teach `scheduled_calls` what the MAYA report schedule actually says.
--
-- NOT YET APPLIED when this file was written. Per `.claude/rules/db.md`, DDL
-- against this database (shared with production Timlul) is reviewed as a FILE
-- and applied afterwards, because narrowing or removing anything here would need
-- DROP/ALTER, both blocked on purpose.
--
-- ADDITIVE ONLY: five new columns, one CHECK, one UNIQUE, one index. No column
-- is dropped, renamed or retyped, and no existing row's data is touched. RLS on
-- `scheduled_calls` is unchanged — it stays shared corpus (migration 006's
-- `FOR SELECT TO authenticated USING (true)`), and this migration adds no
-- `user_id`, which is correct for a shared table per `docs/DATA-MODEL.md`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY EACH COLUMN EXISTS. Every claim below was measured against the live MAYA
-- feed on 2026-08-09 across the 925 schedule rows of 2025+2026, not assumed.
--
-- `kind` — MAYA's `financialReportTypeId` splits the feed in two:
--     1 = שיחת ועידה   (a conference call: a real appointment)
--     2 = פרסום דוחות  (a report publication: a date, not an appointment)
--   The calendar already filters on three kinds and reads an optional `kind`
--   hint (`src/lib/calendar/event-meta.ts`); this is the column that finally
--   supplies it. 'webinar' is permitted by the CHECK but nothing writes it yet —
--   webinars are deliberately a later slice (founder decision 2026-08-09).
--
-- `time_known` — THE HONESTY COLUMN, and the reason this migration is not just
--   two columns. Measured: conference calls carry a time in 452 of 453 rows;
--   report publications carry one in 0 of 472. `scheduled_at` is NOT NULL, so a
--   publication has to be stored at SOME instant — midnight Israel time on its
--   date. Without this flag the UI cannot tell that midnight apart from a real
--   00:00 appointment, and would print a clock for 472 events whose time nobody
--   published. The flag is what lets the renderer omit it. Defaults to true so
--   the four existing rows (all `source='mock'`, all with real times) keep their
--   meaning without a backfill.
--
-- `maya_year`, `maya_period_type_id`, `maya_report_type_id` — the natural key,
--   because THE SCHEDULE FEED SHIPS NO ROW ID. A row is
--   {scheduledDate, scheduledTime, financialReportTypeId, issuerId, year,
--    periodTypeId, timeZone, url} and nothing in it is stable-and-unique, so a
--   re-run has nothing to upsert against and would duplicate all 925 rows.
--   `scheduled_calls` had NO unique constraint of any kind before this file.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE UNIQUE CONSTRAINT IS PLAIN AND NOT PARTIAL, which looks wrong until
-- you check it: the obvious spelling is `... where source = 'maya'`, and that
-- would be a PARTIAL index — which PostgREST's `on_conflict` cannot name, the
-- exact trap that made `company_documents`'s upsert key undeliverable for two
-- chapters (`company_documents_maya_report_uniq` is partial). A plain UNIQUE
-- works here without one, because Postgres treats NULLs as DISTINCT in a unique
-- constraint: every non-MAYA row has NULL in all three `maya_*` columns, so such
-- rows never collide with each other or with synced rows. The four existing mock
-- rows are therefore unaffected, and the sync gets a constraint it can name.
--
-- It is a CONSTRAINT rather than a bare index deliberately: PostgREST resolves
-- `on_conflict` against constraints.
--
-- ⚠ `company_id` is part of the key rather than the issuer id, because that is
-- what the row stores. The sync resolves issuerId -> company_id before writing.

alter table public.scheduled_calls
  add column if not exists kind                text    not null default 'call',
  add column if not exists time_known          boolean not null default true,
  add column if not exists maya_year           int,
  add column if not exists maya_period_type_id int,
  add column if not exists maya_report_type_id int;

-- A closed vocabulary, so an unrecognised MAYA event can never quietly become a
-- calendar kind the UI has no icon, colour or filter chip for.
alter table public.scheduled_calls
  drop constraint if exists scheduled_calls_kind_chk;
alter table public.scheduled_calls
  add constraint scheduled_calls_kind_chk
  check (kind in ('call', 'report', 'webinar'));

alter table public.scheduled_calls
  drop constraint if exists scheduled_calls_maya_key;
alter table public.scheduled_calls
  add constraint scheduled_calls_maya_key
  unique (company_id, maya_year, maya_period_type_id, maya_report_type_id);

-- The calendar filters by kind on every render.
create index if not exists scheduled_calls_kind_idx on public.scheduled_calls(kind);

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
