-- Company profiles (seeded manually for now; later synced from the MAYA/TASE API)
-- Applied to production via MCP on 2026-06-11; kept here as the source of record.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- official Hebrew name
  display_name text not null,         -- short name shown in UI (e.g. רג"א)
  name_en text,
  tase_security_id text,              -- TASE security number
  tase_issuer_id text,                -- issuer id for MAYA API calls (filled when API connects)
  sector text,
  sub_sector text,
  logo_url text,
  description text,
  website text,
  created_at timestamptz not null default now()
);

-- Upcoming/past investor calls per company (source 'mock' now, 'maya' when the API connects)
create table public.scheduled_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scheduled_at timestamptz not null,
  quarter text not null,              -- e.g. 'Q2 2026'
  zoom_url text,                      -- filled from MAYA announcement (or manually)
  status text not null default 'scheduled',  -- scheduled | live | ended | processed
  source text not null default 'mock',       -- mock | maya
  recall_bot_id text,                 -- set when a bot is dispatched (Core 1)
  transcript_id text references public.transcripts(id),  -- linked after processing
  created_at timestamptz not null default now()
);
create index scheduled_calls_company_idx on public.scheduled_calls(company_id);
create index scheduled_calls_time_idx on public.scheduled_calls(scheduled_at);

-- link existing transcripts to company profiles
alter table public.transcripts add column company_id uuid references public.companies(id);
create index transcripts_company_idx on public.transcripts(company_id);

-- RLS: platform data is readable by any signed-in user; writes go through the service role
alter table public.companies enable row level security;
alter table public.scheduled_calls enable row level security;
create policy companies_read on public.companies for select to authenticated using (true);
create policy scheduled_calls_read on public.scheduled_calls for select to authenticated using (true);
