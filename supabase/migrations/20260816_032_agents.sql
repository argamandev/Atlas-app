-- 032 — agents: the personal layer for Agents V1 (.scratch/agents-v1/spec.md §3).
--
-- ADDITIVE ONLY. Reviewed on the file BEFORE apply, per .claude/rules/db.md.
--
-- PERSONAL DATA, NOT SHARED CORPUS. Every table here is one fund's own work, so
-- all four ownership requirements apply to each: the real FK to auth.users, RLS
-- on, a policy scoped on BOTH sides to `authenticated`, and an index on user_id.
-- This copies the projects/workspaces shape (user client, RLS load-bearing), NOT
-- the supabaseAdmin + app-filter shape half the existing schema uses.
--
-- ONE LEVEL DEEPER: every CHILD row (agent_runs -> agents, agent_findings ->
-- agent_runs, agent_run_files -> agent_runs) is keyed COMPOSITE, through
-- user_id, never single-column. PostgreSQL referential-integrity checks
-- DELIBERATELY BYPASS RLS, so a plain agent_id -> agents(id) FK would validate
-- a row inserted with `user_id = self` and `agent_id = <a stranger's agent>` —
-- the parent row RLS makes invisible is still perfectly happy to be pointed at.
-- Round-1 review caught this (R10): the first draft of this file used
-- single-column child FKs throughout. Copied from
-- supabase/migrations/20260802_015_projects.sql (30-33, 44-49) and
-- 20260803_016_workspaces.sql (33-35, 96-109) and the three-column shape in
-- 20260803_017_workspace_integrity.sql (57-71), rather than re-derived.
--
-- WHAT IS DELIBERATELY NOT HERE. The agent's MEMORY. Founder decision 2026-08-16:
-- what the agent KNOWS lives in an Anthropic memory store; what Atlas SHOWS and
-- OWNS lives here. `anthropic_memory_store_id` is a pointer, never a copy.
--
-- DELETING AN AGENT IS A REAL DELETE — FOUNDER RULING, 2026-08-16, taken at this
-- migration's review gate. He was shown three options — archive-only (no hard
-- delete), a real cascading delete, or deferring the decision — with ON DELETE's
-- irreversibility and the two leaks below stated to him first, and he chose the
-- real cascading delete: deleting an `agents` row removes every run, finding and
-- file-index row it produced (full record: `DECISIONS.md`). The child FKs'
-- `on delete cascade` clauses further down did not change for this — that was
-- always the written behaviour — but it is now a RULING rather than an
-- unexamined default, because ON DELETE cannot be changed afterwards without
-- hook-blocked SQL (`DROP CONSTRAINT` / `ALTER ... DROP CONSTRAINT ... ADD
-- CONSTRAINT`), which is exactly why it was put to him BEFORE apply rather than
-- discovered after.
--
-- WHAT THE CASCADE DOES NOT REACH, so the next reader does not assume it does:
-- the FILE BYTES in Supabase Storage — deleting an agent takes its
-- `agent_run_files` INDEX rows with it, not the storage objects they point at
-- (no migration in this repo creates the `storage.objects` policies that would
-- let anything reach those, see the comment on `storage_path` below); and the
-- ANTHROPIC-SIDE agent and memory store, a separate system with their own
-- lifecycle, which keep COSTING MONEY until something archives them
-- deliberately — spec §9.5: that archive is TERMINAL, no unarchive anywhere.
--
-- REACHABLE TODAY WITHOUT ANY UI. The `for all` owner policy on `agents` (below)
-- covers DELETE, so an agent's owner can delete straight through PostgREST
-- before any delete button exists in the product — the policy is `to
-- authenticated`, so this needs the owner's own signed-in session (their JWT),
-- not the anon key alone; the anon key by itself satisfies no owner policy here.

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- free text from the create form; `context` is the "who you are", `mission`
  -- the "what to do". Both go into the Anthropic agent's system prompt.
  context text,
  mission text not null,
  -- Assignment. NULLABLE — an unassigned agent is valid (spec §0d) and works
  -- from its mission text alone. For Company/Sector this is context plus a soft
  -- default scope; for Workspace/Report it is an ACCESS BOUNDARY read from this
  -- row through the handler closure, never from the model (spec §2.2).
  scope_kind text,
  scope_target_id text,
  scope_target_label text,
  constraint agents_scope_kind_known check (
    scope_kind is null
    or scope_kind in ('Call', 'Workspace', 'Company', 'Sector', 'Report')
  ),
  -- NO CHECK pairs scope_kind with scope_target_id — deliberately, unlike every
  -- other honest pair in this file. Task 5's `NewAgent`/`createAgent` already
  -- makes the two independently optional and a Sector assignment may carry a
  -- LIST of companies rather than one target id, so the create form's real
  -- shape is not settled yet. A CHECK can be ADDED later without touching
  -- production rows; REMOVING one needs hook-blocked SQL. Deferred to Plan 2,
  -- once that shape is fixed, rather than guessed at here.
  -- Pointers into Anthropic. Nullable because the row is written first and the
  -- remote objects are created immediately after; a row with nulls here is an
  -- agent whose creation did not finish, and the UI must say so rather than
  -- render it as ready (rules/app.md: degradation must be VISIBLE).
  anthropic_agent_id text,
  anthropic_memory_store_id text,
  anthropic_deployment_id text,
  -- Schedule (spec §4.1). NULL cadence = manual only. Timezone is Israel by the
  -- founder's 2026-08-09 ruling; stored explicitly so a future per-fund timezone
  -- is an ADD COLUMN and not a data migration.
  schedule_cadence text,
  schedule_timezone text not null default 'Asia/Jerusalem',
  schedule_paused boolean not null default false,
  -- Next scheduled firing, mirrored from Anthropic so the panel renders without
  -- calling out (spec §3, §4.1). NULL means no scheduled firing is pending —
  -- manual-only, paused, or not yet scheduled. Anthropic jitters firing by up to
  -- 15% of the interval, capped at 9 minutes (spec §4.1), so this value is
  -- APPROXIMATE BY CONSTRUCTION: the panel must show it as a cadence ("weekly,
  -- Sunday morning"), never a to-the-minute promise. A NON-NULL value can also
  -- go STALE: spec §9.6 records that Anthropic auto-pauses a deployment after a
  -- non-recoverable failure, which leaves the last mirrored instant sitting here
  -- looking like a still-pending promise. The panel must read this alongside
  -- schedule_paused / deployment status, never on its own, to say "next run"
  -- rather than silently keep showing a firing that will not happen.
  next_run_at timestamptz,
  -- Row is written before the Anthropic objects exist (spec §2.1), so a default
  -- of 'active' would be a row that reads ready when it isn't. 'creating' is the
  -- honest default; Task 5's createAgent also writes it explicitly, and this is
  -- the backstop for any future insert path that forgets to.
  status text not null default 'creating',
  constraint agents_status_known check (status in ('active', 'creating', 'archived')),
  created_at timestamptz not null default now(),
  -- NOT redundant with the primary key: a foreign key must reference a uniquely
  -- constrained column SET, and agent_runs below references the pair.
  constraint agents_id_user_id_key unique (id, user_id)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  -- Bare uuid, NOT a single-column FK — see the composite constraint at the
  -- bottom of this table, which is what actually enforces "this run belongs to
  -- this agent AND this user" together.
  agent_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- `manual` = the Run button or first run; `scheduled` = Anthropic's deployment
  -- fired it and our sweep attached (spec §4.1).
  trigger text not null default 'manual',
  constraint agent_runs_trigger_known check (trigger in ('manual', 'scheduled')),
  status text not null default 'running',
  constraint agent_runs_status_known check (status in ('running', 'finished')),
  -- Exactly one honest outcome per finished run (spec §5). NULL while running.
  -- `never_started` is a scheduled firing Anthropic could not turn into a session
  -- at all — a schedule that silently stops firing is this feature's worst failure.
  outcome text,
  constraint agent_runs_outcome_known check (
    outcome is null
    or outcome in ('completed', 'found_nothing', 'budget_reached', 'failed', 'stalled', 'never_started')
  ),
  constraint agent_runs_finished_has_outcome check (status <> 'finished' or outcome is not null),
  -- The converse of the line above: no outcome may be recorded before the run
  -- is actually finished. Together the two make "outcome is set" mean EXACTLY
  -- "status = 'finished'", not merely allow it as one of several shapes.
  constraint agent_runs_outcome_only_when_finished check (status = 'finished' or outcome is null),
  constraint agent_runs_finished_has_ended_at check (status <> 'finished' or ended_at is not null),
  anthropic_session_id text,
  -- Authoritative per-session figure is Anthropic's usage.list_cost; a client-side
  -- estimate is never billed onward (spec §6).
  list_cost_cents integer,
  constraint agent_runs_list_cost_cents_nonneg check (list_cost_cents is null or list_cost_cents >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,

  -- COMPOSITE, not single-column, and that is a security property rather than
  -- bookkeeping: PostgreSQL referential-integrity checks DELIBERATELY BYPASS RLS,
  -- so a plain agent_id -> agents(id) key validates happily against a stranger's
  -- agent row that RLS makes invisible. Putting user_id in the key is what makes
  -- "attach my run to someone else's agent" fail in the DATABASE.
  constraint agent_runs_agent_fk
    foreign key (agent_id, user_id)
    references public.agents (id, user_id) on delete cascade,

  -- TWO different composite unique keys, for two different children below:
  -- agent_run_files only ever carries (run_id, user_id), so it needs the plain
  -- pair; agent_findings also carries agent_id and must have THAT matched too,
  -- so a finding's agent_id cannot disagree with its own run's agent_id.
  constraint agent_runs_id_user_id_key unique (id, user_id),
  constraint agent_runs_id_agent_user_key unique (id, agent_id, user_id)
);

create table if not exists public.agent_findings (
  id uuid primary key default gen_random_uuid(),
  -- Bare uuids — the composite foreign key below carries the ownership check.
  run_id uuid not null,
  agent_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  -- SPEC §0a, THE ANTI-FABRICATION MECHANISM. A finding cannot exist without a
  -- source. NOT NULL is half of it; the CHECK is the other half, because '' is
  -- not null and an empty source is exactly the shape a lazy caller produces.
  source text not null,
  constraint agent_findings_source_present check (length(btrim(source)) > 0),
  created_at timestamptz not null default now(),

  -- COMPOSITE across THREE columns (the 20260803_017_workspace_integrity.sql
  -- shape): binding only (run_id, user_id) would prove the finding and the run
  -- share an OWNER but say nothing about sharing an AGENT — a finding could then
  -- claim a different agent_id than the run it cites. Requires agent_runs to
  -- carry unique (id, agent_id, user_id), added above for exactly this.
  constraint agent_findings_run_fk
    foreign key (run_id, agent_id, user_id)
    references public.agent_runs (id, agent_id, user_id) on delete cascade
);

create table if not exists public.agent_run_files (
  id uuid primary key default gen_random_uuid(),
  -- Bare uuid — the composite foreign key below carries the ownership check.
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Path inside Supabase Storage. The bytes live there; this row is the index.
  -- NOTE: no migration in this repo creates the `storage.objects` policies for
  -- that bucket — the four owner policies below govern only THIS TABLE's rows,
  -- not the underlying storage object. Do not read "agent_run_files is RLS-owned"
  -- as "the file bytes are private"; that is a separate, not-yet-done piece.
  storage_path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  constraint agent_run_files_size_bytes_nonneg check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now(),

  constraint agent_run_files_run_fk
    foreign key (run_id, user_id)
    references public.agent_runs (id, user_id) on delete cascade
);

alter table public.agents           enable row level security;
alter table public.agent_runs       enable row level security;
alter table public.agent_findings   enable row level security;
alter table public.agent_run_files  enable row level security;

-- `for all` + both sides + `to authenticated`. A using-only policy would let a
-- row be written to someone else's id; granting to `public` would silently open
-- the table to anyone holding the anon key, which ships in the browser bundle.
--
-- CREATE POLICY has no IF NOT EXISTS, so these are guarded to keep the whole
-- file re-runnable — otherwise a partially-applied migration cannot be
-- replayed, and on this database the cleanup would need hook-blocked SQL
-- (the 015:57-60 shape).
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'agents'
                   and policyname = 'agents_owner') then
    create policy agents_owner on public.agents
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'agent_runs'
                   and policyname = 'agent_runs_owner') then
    create policy agent_runs_owner on public.agent_runs
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'agent_findings'
                   and policyname = 'agent_findings_owner') then
    create policy agent_findings_owner on public.agent_findings
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'agent_run_files'
                   and policyname = 'agent_run_files_owner') then
    create policy agent_run_files_owner on public.agent_run_files
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists agents_user_idx on public.agents (user_id);

create index if not exists agent_runs_user_idx on public.agent_runs (user_id);
create index if not exists agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);
-- The sweep (spec §4.1) asks one question every minute: which runs are still
-- running, oldest first? `status` is a constant under this predicate (it can
-- only ever be 'running'), so keying the index on it buys nothing — keyed on
-- `started_at` instead, which is what the sweep actually orders by.
create index if not exists agent_runs_running_idx on public.agent_runs (started_at) where status = 'running';

create index if not exists agent_findings_user_idx on public.agent_findings (user_id);
create index if not exists agent_findings_run_idx on public.agent_findings (run_id, created_at);

create index if not exists agent_run_files_user_idx on public.agent_run_files (user_id);
create index if not exists agent_run_files_run_idx on public.agent_run_files (run_id);
