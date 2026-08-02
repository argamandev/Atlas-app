-- 20260802_015_projects.sql
-- Projects backend: persistence + ownership.
-- Personal-layer data per docs/DATA-MODEL.md — one owner, never shared.
-- Spec: docs/superpowers/specs/2026-08-02-projects-backend-design.md
--
-- ADDITIVE ONLY. Reviewed as a FILE before application per .claude/rules/db.md:
-- narrowing a policy afterwards needs DROP/ALTER, both hook-blocked, so a
-- reviewer verdict of "narrow that policy" is unactionable once it is live.
--
-- Ownership law (.claude/rules/db.md), all four points at CREATE TABLE, because
-- this database is shared with production Timlul and additive-only — retrofitting
-- ownership later means a backfill dance on live data:
--   1. real FK to auth.users(id) ON DELETE CASCADE  (not a uuid that merely looks like one)
--   2. ENABLE ROW LEVEL SECURITY
--   3. owner policy on BOTH using and with-check, granted to `authenticated`
--   4. index on user_id

create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  pinned            boolean not null default false,
  instructions      text not null default '',
  memory            text not null default '',
  -- null means memory genuinely never was updated; the UI renders "Never
  -- updated" from this rather than storing that phrase.
  memory_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- NOT redundant with the primary key: a foreign key must reference a uniquely
  -- constrained column SET, and project_sources below references the pair.
  constraint projects_id_user_id_key unique (id, user_id)
);

create table if not exists public.project_sources (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  body        text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Makes an owner mismatch IMPOSSIBLE in the database rather than checked in
  -- the app: a note's owner can only ever be its project's owner.
  constraint project_sources_project_fk
    foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

alter table public.projects        enable row level security;
alter table public.project_sources enable row level security;

-- `for all` + both sides + `to authenticated`. A using-only policy would let a
-- row be written to someone else's id; granting to `public` would expose the
-- table to anyone holding the anon key, which ships in the browser bundle.
-- CREATE POLICY has no IF NOT EXISTS, so these are guarded to keep the whole file
-- re-runnable — otherwise a partially-applied migration cannot be replayed, and on
-- this database the cleanup would need hook-blocked SQL. End state is identical to
-- the reviewed statements (reviewer NIT 2026-08-02).
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'projects'
                   and policyname = 'projects_owner') then
    create policy projects_owner on public.projects
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'project_sources'
                   and policyname = 'project_sources_owner') then
    create policy project_sources_owner on public.project_sources
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists projects_user_id_idx
  on public.projects (user_id);
create index if not exists project_sources_project_id_idx
  on public.project_sources (project_id);
create index if not exists project_sources_user_id_idx
  on public.project_sources (user_id);

-- ── The link from a chat to its project ─────────────────────────────────────
--
-- NULLABLE: all 19 pre-existing rows keep working. The column-add is instant and
-- non-rewriting, and Timlul — which shares this table — cannot reference a column
-- that postdates its code; a `select *` there merely carries a harmless extra field.
--
-- ⚠️ THIS CLAUSE GOVERNS TWO DIFFERENT EVENTS, AND ONE OF THEM DESTROYS DATA.
--
--   The ACCOUNT is removed  -> its projects go, and their chats go with them. Right.
--   A PROJECT is removed    -> ITS CONVERSATIONS ARE DELETED TOO, not unlinked.
--
-- That second one is not a detachment. chat_conversations.messages is inline
-- `jsonb` (migration 009:17), so the whole conversation history goes with the
-- row, unrecoverably. FOUNDER DECISION 2026-08-02, taken at the DDL gate with
-- that consequence in front of him: a project is a sealed container, and
-- emptying it empties it. The supervisor had recommended `on delete set null`;
-- the founder chose cascade knowingly. Reversing it needs DROP CONSTRAINT, which
-- the destructive-SQL hook blocks on this shared database.
--
-- OBLIGATION THIS CREATES, and it is binding on whoever builds project deletion:
-- the delete path MUST tell the user how many conversations it is about to
-- destroy, BEFORE destroying them. Silent destruction is exactly the
-- "degradation must be VISIBLE" class in .claude/rules/app.md. Note that DELETE
-- is already reachable without any UI — the `for all` owner policy above covers
-- it, so a project's owner can delete straight through PostgREST with the anon
-- key. Use countProjectChats() in src/lib/db/projects.ts; it exists for this.
--
-- COMPOSITE, not single-column, and that is a security property rather than
-- bookkeeping: PostgreSQL referential-integrity checks DELIBERATELY BYPASS RLS,
-- so a plain project_id -> projects(id) key validates happily against a
-- stranger's project row that RLS makes invisible. Putting user_id in the key is
-- what makes "point my chat at someone else's project" fail in the DATABASE.
-- Caught by the DDL gate 2026-08-02: the comment here previously asserted an
-- ownership chain the SQL did not enforce.
--
-- MATCH SIMPLE (the default) means a NULL project_id satisfies the constraint
-- regardless of user_id, so all 19 existing rows validate — including the 7
-- whose owner no longer exists in auth.users — and Timlul's inserts keep working.
-- This is also why the chapter does not lean on chat_conversations.user_id, which
-- has no key of its own and cannot be given one while those 7 rows stand.
alter table public.chat_conversations
  add column if not exists project_id uuid;

create index if not exists chat_conversations_project_id_idx
  on public.chat_conversations (project_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_conversations_project_fk'
  ) then
    alter table public.chat_conversations
      add constraint chat_conversations_project_fk
      foreign key (project_id, user_id)
      references public.projects (id, user_id)
      on delete cascade;
  end if;
end $$;
