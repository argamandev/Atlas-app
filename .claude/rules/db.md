# Database law — Supabase shared with production

The old repo (Timlul, Railway) uses THIS SAME database.

- Additive-only: CREATE TABLE / ADD COLUMN / CREATE INDEX are allowed. DROP/TRUNCATE/
  ALTER-destructive are hook-blocked. Renames = add new + backfill, never in-place.
- Migrations: `supabase/migrations/YYYYMMDD_NNN_description.sql`; post to BOARD.md
  CROSS-CUTTING before applying; RLS on any user-facing table.
- When unsure whether a change is destructive → it goes to the supervisor + founder first.
