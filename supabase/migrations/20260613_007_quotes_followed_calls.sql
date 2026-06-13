-- V1 frontend backend gaps: user-saved quotes ("My Quotes") + followed calls ("My Calendar").
-- Apply via Supabase MCP / CLI. Until applied, the app falls back to an in-process store
-- (see src/lib/db/quotes.ts) so the UI and the live-transcript self-test still work.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid references public.companies(id) on delete set null,
  transcript_id text references public.transcripts(id) on delete set null,
  text text not null,
  speaker text,
  quarter text,
  start_sec double precision,           -- audio offset of the quote (when known)
  created_at timestamptz not null default now()
);
create index if not exists quotes_user_idx on public.quotes(user_id);
create index if not exists quotes_company_idx on public.quotes(company_id);

create table if not exists public.followed_calls (
  user_id uuid not null,
  call_id uuid not null references public.scheduled_calls(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, call_id)
);

alter table public.quotes enable row level security;
alter table public.followed_calls enable row level security;

create policy quotes_own on public.quotes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy followed_own on public.followed_calls
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
