create table if not exists notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  whatsapp_phone text,
  notify_email boolean default false,
  notify_whatsapp boolean default false,
  updated_at timestamptz default now()
);
alter table notification_prefs enable row level security;
create policy "users manage own prefs" on notification_prefs
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
