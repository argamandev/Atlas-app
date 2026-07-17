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
