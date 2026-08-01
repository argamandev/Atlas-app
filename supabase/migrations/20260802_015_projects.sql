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
create policy projects_owner on public.projects
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy project_sources_owner on public.project_sources
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists projects_user_id_idx
  on public.projects (user_id);
create index if not exists project_sources_project_id_idx
  on public.project_sources (project_id);
create index if not exists project_sources_user_id_idx
  on public.project_sources (user_id);

-- The link from a chat to its project. NULLABLE: all 19 pre-existing rows keep
-- working, and Timlul — which shares this table — simply never selects it.
--
-- A project chat's ownership runs project_id -> projects.id -> user_id ->
-- auth.users.id, cascading the whole way. It deliberately does NOT lean on
-- chat_conversations.user_id, which has no foreign key and cannot be given one:
-- 7 of those 19 rows already belong to an account that no longer exists in
-- auth.users (verified 2026-08-02, filed to cross-cutting). Clearing them is
-- destructive, hook-blocked, and the table is shared with production.
alter table public.chat_conversations
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

create index if not exists chat_conversations_project_id_idx
  on public.chat_conversations (project_id);
