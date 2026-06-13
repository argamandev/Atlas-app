-- "My Quotes" folders: user-named, per-company folders that saved quotes can be filed into.
-- A quote belongs to at most one folder (quotes.folder_id). Mirrors the quotes RLS model
-- (owner-only via auth.uid() = user_id); supabaseAdmin bypasses RLS for the server layer.

create table if not exists public.quote_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists quote_folders_user_company_idx on public.quote_folders(user_id, company_id);

-- file a quote into a folder; on folder delete the quote stays, just unfiled.
alter table public.quotes
  add column if not exists folder_id uuid references public.quote_folders(id) on delete set null;

alter table public.quote_folders enable row level security;

drop policy if exists quote_folders_own on public.quote_folders;
create policy quote_folders_own on public.quote_folders
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
