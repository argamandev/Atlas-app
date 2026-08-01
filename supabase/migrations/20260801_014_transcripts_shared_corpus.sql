-- 20260801_014_transcripts_shared_corpus
--
-- Transcripts become SHARED CORPUS: readable by every signed-in user, not owned by one.
--
-- WHY. Founder decision 2026-08-01 (docs/DATA-MODEL.md): company data — investor call
-- transcripts, company profiles, reports and PDFs, the calendar — is one copy for everyone;
-- only what a user MAKES (chat, projects, workspaces, agents) is user-scoped. The old repo
-- (Timlul) was a personal transcription tool, so `transcripts` still carried ITS model:
-- the sole policy was "users see own transcripts", USING (auth.uid() = user_id).
--
-- That model is not just wrong for Atlas, it was silently doing nothing useful. Of 60 rows,
-- 30 have user_id IS NULL (the Atlas-era company calls). Against a NULL owner the expression
-- auth.uid() = user_id evaluates to NULL — not TRUE — so those 30 were invisible to EVERY
-- user under RLS. They reached the app only because every server route queries with
-- supabaseAdmin (service role), which bypasses RLS entirely. In other words: for the shared
-- half of the corpus, RLS was contributing nothing and the application was the only gate.
--
-- Atlas's whole premise depends on this being shared. "Which company talked about M&A last
-- quarter?" searches the entire archive; an archive partitioned per user is a filing cabinet,
-- which is precisely the product Atlas is not.
--
-- WHAT THIS DOES. One additive statement. No DROP, no ALTER, no data modified — this database
-- is shared with the old repo's production and is additive-only (.claude/rules/db.md).
--
-- The pre-existing "users see own transcripts" policy is deliberately LEFT IN PLACE: removing
-- a policy is destructive and hook-blocked. That turns out to be exactly what we want, because
-- RLS policies combine with OR:
--   * SELECT — the new policy grants it to every authenticated user, so the corpus is shared.
--   * INSERT / UPDATE / DELETE — still governed by the old owner-scoped policy for any
--     non-service-role client.
-- Net result is the target model: SHARED READ, OWNER-RESTRICTED WRITE. Real writes happen
-- server-side through supabaseAdmin regardless.
--
-- SCOPE, stated honestly: this does NOT address the service-role bypass (that key is meant to
-- bypass RLS) and does not touch the getSession() item. What it buys is that the day the read
-- routes are rewritten onto the user's own session, the shared corpus keeps working while the
-- per-user tables stay private — instead of the archive going dark.
--
-- Granted to `authenticated`, not `public`: the corpus sits behind the login gate shipped
-- 2026-08-01. Whether logged-out visitors should ever read it (marketing/SEO) is an open
-- question recorded in docs/DATA-MODEL.md, and would be its own later migration.

create policy transcripts_shared_read
  on public.transcripts
  for select
  to authenticated
  using (true);

comment on policy transcripts_shared_read on public.transcripts is
  'Shared corpus: any signed-in user may read any transcript. Atlas data model, 2026-08-01 — see docs/DATA-MODEL.md. Writes remain owner-scoped via the older policy.';
