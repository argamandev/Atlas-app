CREATE EXTENSION IF NOT EXISTS pgcrypto;

create table if not exists sent_alerts (
  id uuid primary key default gen_random_uuid(),
  report_id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  channel text not null check (channel in ('email','whatsapp')),
  sent_at timestamptz default now(),
  report_url text,
  company_name text,
  unique(report_id, user_id, channel)
);
create index if not exists sent_alerts_user_sent_idx on sent_alerts(user_id, sent_at desc);
alter table sent_alerts enable row level security;
-- service role only writes; authenticated users can read own rows for history
create policy "users read own alerts" on sent_alerts
  for select using (auth.uid() = user_id);
