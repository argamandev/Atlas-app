# COLLISIONS — the one thing `main` cannot arbitrate ahead of time

**APPEND-ONLY. Current era only.** Appends go via `>>` or `fs.appendFileSync` — never `Edit`,
never `Write`, never `>`. Both doors are denied in `.claude/settings.json` and
`.claude/hooks/pre-bash-gate.mjs`, deliberately: an append-only log that a session can rewrite is
a log that will be rewritten.

## What belongs here — and nothing else

Sessions integrate through `main`. That works for every change `main` can merge and a test can
check. Three kinds of change it cannot arbitrate ahead of time, because the damage is done before
the merge (`CONTEXT.md` → *Collision*):

1. **A Supabase migration.** The database is SHARED with production Timlul and is additive-only
   (`.claude/rules/db.md`). Append the migration BEFORE applying it, never after.
2. **A shared type** — `src/lib/types.ts`, `lib/api/types`, or a `lib/db` / `lib/api` shape two
   pieces of work both read.
3. **A design token or a DS component** — a change to one repaints surfaces nobody is looking at.

Merges, findings, status, lessons and decisions do **not** belong here. A merge is visible in
`main`. Status is `STATUS.md`. A founder decision is `DECISIONS.md`. A lesson that recurred is a
LAW in `.claude/rules/` with a mechanism (ADR-0002). The retired `cross-cutting.md` accepted all
of them, which is how it reached 40 KB and stopped being read.

## The entry

One line, ~3 lines at most: what changed, and who it bites.

```
[YYYY-MM-DD] MIGRATION 022 about to be applied — supabase/migrations/20260812_022_x.sql.
             Additive: adds column y to table z. Bites: anything selecting * from z.
```

Detail belongs in `docs/evidence/<branch>/`, which exists for exactly this.

## Eviction

Closed eras move to `docs/archive/` when work merges (`CONTEXT.md` → *Eviction*); this file holds
the current era only. Everything before 2026-08-12 is verbatim and complete in:

- `docs/archive/cross-cutting-2026-07-03--2026-08-10.md`
- `docs/archive/agent-memory-snapshots/2026-08-12-fleet-retired/cross-cutting.md`

**A search for prior art must include the archive.** "It is not in `COLLISIONS.md`" means "it is
not in the last few days", which is a different sentence.

---

[2026-08-12] Era opened. The fleet's `cross-cutting.md` is retired to the archive above; this file
             replaces it, scoped to the three collisions named at the top and nothing else.
[2026-08-12] SMOKE — append door verified after the move to the repo root.
[2026-08-12] DATA DELETE executed on shared DB (ticket 04, founder-decided): 55 unattributed transcripts (company_id IS NULL) deleted after verified export to Desktop/Atlas-cold-storage/timlul-transcripts-2026-08-12. 5 attributed rows remain. Bites: any session assuming the Timlul-era transcript rows still exist.
