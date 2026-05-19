CREATE EXTENSION IF NOT EXISTS pgcrypto;

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  ticker text not null,
  company_name text not null,
  maya_company_id text,
  created_at timestamptz default now(),
  unique(user_id, ticker)
);
create index if not exists watchlist_user_id_idx on watchlist(user_id);
create index if not exists watchlist_company_name_idx on watchlist(lower(company_name));
alter table watchlist enable row level security;
create policy "users manage own watchlist" on watchlist
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
