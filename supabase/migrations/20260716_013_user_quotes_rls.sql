-- Enable RLS on user_quotes (Supabase Advisor: publicly exposed via PostgREST, RLS off).
-- The table belongs to the PARKED personal-transcribe feature (branch personal-transcribe-parked);
-- no deployed code references it. Enabling RLS with no policies = deny-all through the public
-- API (anon + authenticated); service-role access unaffected. If the feature is revived,
-- add owner-scoped policies (user_id = auth.uid()) alongside the revived code.
alter table public.user_quotes enable row level security;
