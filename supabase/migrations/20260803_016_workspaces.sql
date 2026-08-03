-- 20260803_016_workspaces.sql
-- Workspace backend: persistence + ownership.
-- Personal-layer data per docs/DATA-MODEL.md — one owner, never shared.
-- Spec: docs/superpowers/specs/2026-08-03-workspace-backend-design.md
-- Plan: docs/superpowers/plans/2026-08-03-workspace-backend.md
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

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  -- The working document's title. One document per workspace, so it lives here
  -- rather than in a table that would only ever hold one row per workspace.
  doc_title   text not null default '',
  created_at  timestamptz not null default now(),
  -- Moves on CONTENT change (item attached/removed, block written, name or
  -- doc_title edited) and NOT on a pure layout change (is_open, position).
  -- Pane drags are frequent and debounced; if they bumped this, the derived
  -- "edited 2h ago" would quietly come to mean "looked at 2h ago". Same
  -- reasoning as memory_updated_at in migration 015.
  updated_at  timestamptz not null default now(),
  -- NOT redundant with the primary key: a foreign key must reference a uniquely
  -- constrained column SET, and all three child tables reference the pair.
  constraint workspaces_id_user_id_key unique (id, user_id)
);

-- ── The shelf ───────────────────────────────────────────────────────────────
--
-- THREE provenances, not two (founder clarification 2026-08-03): a workspace
-- holds investor-call TRANSCRIPTS as well as Maya/corpus documents and private
-- files. That is also what makes it useful today — verified against this
-- database on 2026-08-03, there are 60 transcripts against 2 corpus documents,
-- so a document-only shelf would sit almost empty until Maya lands.
--
-- transcript_id is TEXT because transcripts.id is text, also verified against
-- the live database rather than assumed. A uuid column would fail this foreign
-- key outright, and "fixing" that by dropping the key is exactly the bad half
-- of the schema that .claude/rules/db.md warns about: five existing tables
-- carry a user_id with no key behind it.
--
-- ⚠️ THE CORPUS CASCADE GOVERNS THREE DIFFERENT EVENTS, AND ONE DESTROYS
--    SOMETHING NOBODY ASKED IT TO:
--
--   The ACCOUNT is removed   -> its workspaces and everything in them go. Right.
--   A WORKSPACE is removed   -> its items go. Right.
--   A CORPUS ROW is removed  -> the item vanishes from EVERY user's shelf,
--                               silently, with no UI having said so.
--
-- What protects the thing that actually matters: workspace_doc_blocks below
-- references the ITEM with `on delete set null`, so the user's WRITING survives
-- its source vanishing and the citation renders as visibly broken rather than
-- disappearing with it. Corpus rows are removed only by an admin/script path,
-- and Atlas ships no such UI today.
--
-- FOUNDER RULING 2026-08-03, taken at the DDL gate with that consequence in
-- front of him: the item goes. The alternative put to him and declined was
-- `on delete restrict`, which blocks the corpus delete outright while any user
-- holds the row on a shelf — nothing ever vanishes, but corpus maintenance
-- fails loudly and someone must go clear the workspaces first. He chose cascade
-- knowing the writing is protected separately, one table down.
create table if not exists public.workspace_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  user_id       uuid not null references auth.users (id) on delete cascade,

  transcript_id text references public.transcripts (id)       on delete cascade,
  document_id   uuid references public.company_documents (id) on delete cascade,
  storage_path  text,

  name          text not null,
  kind          text not null check (kind in ('transcript','document','file')),
  -- Side-by-side survives the browser closing, and so does the order. Founder,
  -- 2026-08-03: "the workspace should remember how i left it. it must not open
  -- cold every time." So this is stored data, not session state.
  --
  -- position orders ALL items, not only the open ones: a closed source keeps
  -- its place, so reopening restores it rather than appending it to the end.
  is_open       boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),

  constraint workspace_items_one_source
    check (num_nonnulls(transcript_id, document_id, storage_path) = 1),

  -- COMPOSITE, and that is a security property rather than bookkeeping:
  -- PostgreSQL referential-integrity checks DELIBERATELY BYPASS RLS, so a plain
  -- workspace_id -> workspaces(id) key validates happily against a stranger's
  -- workspace that RLS makes invisible. Putting user_id in the key is what makes
  -- "attach my item to someone else's workspace" fail in the DATABASE rather
  -- than in a check we remembered to write. (Caught at the 015 gate, where a
  -- comment asserted an ownership chain the SQL did not enforce.)
  constraint workspace_items_workspace_fk
    foreign key (workspace_id, user_id)
    references public.workspaces (id, user_id) on delete cascade,

  -- Referenced by workspace_doc_blocks below, same reason as on workspaces.
  constraint workspace_items_id_user_id_key unique (id, user_id)
);

-- The two corpus keys above are deliberately NOT composite: transcripts and
-- company_documents are shared corpus (docs/DATA-MODEL.md) with no owner to
-- match against, and every member may legitimately read them — `transcripts`
-- carries `transcripts_shared_read` (for select to authenticated using (true))
-- from migration 20260801_014. A plain key still does the job that matters here:
-- the column cannot hold an id that does not exist.

create table if not exists public.workspace_threads (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null default '',
  -- Inline jsonb, matching chat_conversations.messages. NOTE THE CONSEQUENCE:
  -- a cascade takes the whole history with the row rather than unlinking it,
  -- which is why countWorkspaceContents() exists and why any delete path must
  -- show the count BEFORE destroying anything (lane rule 3).
  --
  -- A SEPARATE TABLE rather than reusing chat_conversations — founder decision
  -- 2026-08-03, against the recommendation, and it was the right call:
  -- chat_conversations has user_id NOT NULL with NO foreign key at all and
  -- carries 7 rows whose owner no longer exists in auth.users, which is why
  -- migration 015 could not give it a key. Reusing it would have made Workspace
  -- inherit that shape permanently.
  messages      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint workspace_threads_workspace_fk
    foreign key (workspace_id, user_id)
    references public.workspaces (id, user_id) on delete cascade
);

-- ── The working document ────────────────────────────────────────────────────
--
-- Structured blocks with citation anchors, NOT rich-text HTML in one field
-- (founder decision 2026-08-01). One document per workspace, so blocks point
-- straight at the workspace and there is no document table between them.
create table if not exists public.workspace_doc_blocks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('heading','text','quote')),
  body            text not null default '',
  position        integer not null default 0,

  source_item_id  uuid,
  -- Snapshot of how the source read when it was cited, e.g.
  -- 'תדיראן Q4 2025 · 00:12:31'. This is what makes an absent source
  -- INFORMATIVE rather than a dangling marker the reader cannot interpret.
  source_label    text,
  source_page     integer,   -- a document page  (company_documents/document_pages)
  source_line_id  text,      -- a transcript line, e.g. 'L0001'
  -- Snapshot of the quoted words. formatted_data is REGENERATED when a
  -- transcript is re-processed through Gemini, so L0004 can come back meaning a
  -- different sentence: the citation would still RESOLVE — to the wrong words.
  -- Comparing this against whatever the anchor resolves to today is the only
  -- thing that lets the UI render "drifted" instead of a plausible-looking lie,
  -- which is the exact failure class .claude/rules/app.md keeps filing.
  source_quote    text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A page OR a line, never both. Which one applies is given by the kind of the
  -- item this block cites.
  constraint workspace_doc_blocks_one_anchor
    check (num_nonnulls(source_page, source_line_id) <= 1),
  constraint workspace_doc_blocks_quote_has_text
    check (kind <> 'quote' or source_quote is not null),

  constraint workspace_doc_blocks_workspace_fk
    foreign key (workspace_id, user_id)
    references public.workspaces (id, user_id) on delete cascade,

  -- SET NULL, NEVER CASCADE — the load-bearing decision of this table.
  -- Removing a source from the shelf must not delete the user's writing. The
  -- surviving block with a null source_item_id IS the "visibly absent" state
  -- the brief requires: the sentence stays, and the citation renders broken
  -- while source_label and source_quote still say what it used to point at.
  --
  -- The column list is named EXPLICITLY because an unqualified composite
  -- set-null would try to null user_id as well, which is NOT NULL — that fails
  -- at DELETE time, not at migration time, so it would have looked fine here
  -- and broken the first time a user removed a cited source. Requires PG15+;
  -- this database is PostgreSQL 17.6 (verified 2026-08-03).
  constraint workspace_doc_blocks_item_fk
    foreign key (source_item_id, user_id)
    references public.workspace_items (id, user_id)
    on delete set null (source_item_id)
);

alter table public.workspaces           enable row level security;
alter table public.workspace_items      enable row level security;
alter table public.workspace_threads    enable row level security;
alter table public.workspace_doc_blocks enable row level security;

-- `for all` + both sides + `to authenticated`. A using-only policy would let a
-- row be written to someone else's id; granting to `public` would silently open
-- the table to anyone holding the anon key, which ships in the browser bundle
-- (two live tables on this database are flagged by Supabase's own linter for
-- exactly that — see the 2026-08-01 ALERT in agent-memory/cross-cutting.md).
--
-- CREATE POLICY has no IF NOT EXISTS, so these are guarded to keep the whole
-- file re-runnable — otherwise a partially-applied migration cannot be replayed,
-- and on this database the cleanup would need hook-blocked SQL. The generated
-- statements were verified with a read-only format() call before this file was
-- committed; end state is identical to writing the four out by hand.
do $$
declare
  t text;
begin
  foreach t in array array['workspaces','workspace_items','workspace_threads','workspace_doc_blocks']
  loop
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = t
                     and policyname = t || '_owner') then
      execute format(
        'create policy %I on public.%I for all to authenticated
           using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t || '_owner', t);
    end if;
  end loop;
end $$;

create index if not exists workspaces_user_id_idx
  on public.workspaces (user_id);
create index if not exists workspace_items_user_id_idx
  on public.workspace_items (user_id);
create index if not exists workspace_items_workspace_id_idx
  on public.workspace_items (workspace_id);
create index if not exists workspace_threads_user_id_idx
  on public.workspace_threads (user_id);
create index if not exists workspace_threads_workspace_id_idx
  on public.workspace_threads (workspace_id);
create index if not exists workspace_doc_blocks_user_id_idx
  on public.workspace_doc_blocks (user_id);
create index if not exists workspace_doc_blocks_workspace_id_idx
  on public.workspace_doc_blocks (workspace_id);
-- The delete path sets this column to null on every citing block, so it is
-- looked up by value rather than only joined through.
create index if not exists workspace_doc_blocks_source_item_id_idx
  on public.workspace_doc_blocks (source_item_id);

-- The same source cannot sit on one shelf twice.
create unique index if not exists workspace_items_transcript_uniq
  on public.workspace_items (workspace_id, transcript_id) where transcript_id is not null;
create unique index if not exists workspace_items_document_uniq
  on public.workspace_items (workspace_id, document_id) where document_id is not null;
