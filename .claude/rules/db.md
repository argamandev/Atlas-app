# Database law — Supabase shared with production

The old repo (Timlul, Railway) uses THIS SAME database.

- Additive-only: CREATE TABLE / ADD COLUMN / CREATE INDEX are allowed. DROP/TRUNCATE/
  ALTER-destructive are hook-blocked. Renames = add new + backfill, never in-place.
- Migrations: `supabase/migrations/YYYYMMDD_NNN_description.sql`; APPEND to
  `agent-memory/cross-cutting.md` before applying; RLS on any user-facing table.
- When unsure whether a change is destructive → it goes to the supervisor + founder first.
- Supabase MCP auth: the token lives in the checkout's `.mcp.json`; after a token change,
  `/mcp` → reconnect (or restart the session). "Please provide a valid access token" can mean
  an EXPIRED/ROTATED token, not a missing one; `claude mcp list` health ✓ only proves the
  server starts, NOT that the token works (2026-07-16).
- The destructive-SQL hook pattern-matches ANYWHERE in a Bash command — including commit
  messages ("drop policy") and compound commands. Split commands / reword rather than fight it.

## Ownership law — every new user-facing table (verified against the live DB 2026-08-01)

The identity table is **`auth.users`** (Supabase built-in). `public.profiles` mirrors it
(`profiles.id REFERENCES auth.users(id) ON DELETE CASCADE`; columns `id, first_name, last_name,
role, summary_instructions, created_at`) and `profiles.role` is what `requireAdmin` reads.
**Do not invent a second users table.** Ownership hangs off `auth.users(id)`.

Every new user-facing table (workspaces, projects, agents, embeddings, agent runs …) gets ALL
FOUR of these at `CREATE TABLE`, never bolted on later — this database is shared with production
Timlul and additive-only, so retrofitting ownership means a backfill dance on a live DB:

1. `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` — **the FK, not just a
   uuid column.** Without it `user_id` is a uuid that merely looks like a user.
2. `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.
3. A policy scoped to the owner on **both** sides: `USING (auth.uid() = user_id)` **and**
   `WITH CHECK (auth.uid() = user_id)`. A USING-only policy lets a row be written to someone
   else's id. Grant it to `authenticated`, not `public`.
4. `CREATE INDEX ON <table>(user_id)` — every query filters on it.

Child rows (a project's messages, an agent's runs) either carry their own `user_id` under the
same rule or reach the owner through a `NOT NULL` FK to the parent. Never "the app will filter it".

**Why the FK is spelled out: the existing schema is INCONSISTENT and half of it is the bad half.**
Verified 2026-08-01 — WITH a real FK to `auth.users`: `transcripts`, `watchlist`,
`notification_prefs`, `sent_alerts`, `profiles`, `access_requests.reviewed_by`. `user_id NOT NULL`
but **NO foreign key at all**: `chat_conversations`, `quotes`, `quote_folders`, `user_quotes`,
`followed_calls`. In those five nothing in the database stops a garbage or deleted user id from
being stored — and since the server queries with `supabaseAdmin` (service role, which BYPASSES
RLS), the FK was the only remaining guard. Copy the first group's shape, not the second's.
Also `user_quotes` has RLS enabled with ZERO policies (0 rows — looks abandoned): that denies all
anon/authenticated access, which is safe but is not a pattern to imitate.

**Never write `USING (true) WITH CHECK (true)` "for the service role".** The service-role key
bypasses RLS entirely and needs no policy; such a policy is granted to `public`, so it silently
opens the table to everyone holding the anon key (which ships in the browser bundle). Two live
examples on this DB — `profiles` and `access_requests` — are flagged by Supabase's own linter
(`rls_policy_always_true`) and are the reason this paragraph exists. See the 2026-08-01 ALERT in
`agent-memory/cross-cutting.md`; do not "fix" them without checking Timlul first, since it shares
this database and may depend on them.
**Not to be confused with a legitimate shared-corpus read:** `FOR SELECT TO authenticated USING
(true)` on data that is deliberately public-to-members is correct and already shipped — migration
`20260611_006` (`companies`, `scheduled_calls`) and `20260801_014` (`transcripts`, see
`docs/DATA-MODEL.md`). The banned shape is `FOR ALL` + `WITH CHECK (true)` + role `public`. The
three differences that matter: command scope, the write check, and the role.

## DDL against the shared DB is reviewed BEFORE it is applied (2026-08-01)

Every other change in this repo can be reviewed after the fact because it can be reverted. A
policy cannot: narrowing or removing one needs `DROP POLICY`/`ALTER POLICY`, both matched by the
destructive-SQL hook. Migration `20260801_014` was applied first and reviewed second, which made
the reviewer's "narrow the scope" verdict **unactionable by design** — the gate was inverted for
the one irreversible class of change here. So: write the migration file, push the branch, run the
reviewer on the FILE, then apply. Applying first is only acceptable when the founder has asked for
it explicitly and the statement is provably reversible without hook-blocked SQL.

**Measure blast radius on `auth.users`, never on `public.profiles`.** `profiles` is a mirror
maintained by the `handle_new_user()` trigger, so any auth user whose row is missing is invisible
to a `profiles` count while still holding whatever `TO authenticated` grants. Same migration: the
first blast-radius measurement used `profiles` and only happened to be right.
