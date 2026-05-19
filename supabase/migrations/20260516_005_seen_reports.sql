create table if not exists seen_reports (
  report_id text primary key,
  company_name text not null,
  report_url text not null,
  publication_date text,
  first_seen_at timestamptz default now()
);
create index if not exists seen_reports_first_seen_idx on seen_reports(first_seen_at desc);
alter table seen_reports enable row level security;
create policy "authenticated users read seen_reports" on seen_reports
  for select using (auth.role() = 'authenticated');
