-- 20260613_009: speaker-name overrides, quote line-anchor, persisted chat conversations.

-- #6 editable speaker names: override map { [speakerId]: displayName } applied at load.
alter table public.transcripts add column if not exists speaker_names jsonb;

-- #5 go-to-quote: stable line anchor { segmentId, text } captured when a quote is saved.
alter table public.quotes add column if not exists anchor jsonb;

-- #9b persisted conversations. Messages kept inline as a jsonb array (V1: context-stuffing,
-- no per-message querying). No hard FKs — mirrors quotes.transcript_id (plain text id).
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'New chat',
  company_id uuid,
  transcript_id text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc);

alter table public.chat_conversations enable row level security;

-- App code uses the service role (bypasses RLS); this owner policy is a safety net for any
-- future anon-key access. Drop-then-create so the migration is re-runnable.
drop policy if exists chat_conversations_owner on public.chat_conversations;
create policy chat_conversations_owner on public.chat_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
