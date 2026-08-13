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
2026-08-13 · feat/smart-layer-foundations · slice A1 DDL: CREATE EXTENSION vector; new tables company_aliases, document_chunks (+ atlas_dual_tsv function), filing_facts (all RLS + SELECT-to-authenticated only); company_documents.publication_date column; transcripts source_key + revision columns, partial UNIQUE on source_key, CHECK (company_id IS NOT NULL) NOT VALID (binds new writes now, VALIDATE in A4). Reviewed on file (atlas-reviewer, APPROVED) before apply.
2026-08-13 · feat/smart-layer-a3-birth-sequence · MIGRATION 028 about to be applied — supabase/migrations/20260813_028_index_status_atomic_rechunk.sql. Additive: index_status on transcripts + company_documents, facts_status on company_documents (CHECK-constrained, defaults pass all rows), atlas_replace_chunks() plpgsql (EXECUTE service_role only). Reviewed on file (atlas-reviewer, 4 rounds, APPROVED) before apply. Bites: anything selecting * from those tables; chunk writers must use the RPC.
2026-08-14 · feat/smart-layer-a4-backfill · MIGRATION 029 about to be applied — supabase/migrations/20260814_029_search_chunks.sql. Additive, two new FUNCTIONS only, no table touched: atlas_dual_tsquery(text) (query-side twin of atlas_dual_tsv, OR semantics) and atlas_search_chunks(...) (dense pgvector + tsvector ts_rank_cd fused by RRF k=50 1/1, optional company pre-filter). SECURITY INVOKER so document_chunks RLS keeps applying; EXECUTE revoked from public, granted to authenticated + service_role. Reviewed on file before apply, per rules/db.md. Bites: any session adding retrieval SQL — there is now ONE retrieval door (src/lib/corpus/retrieve.ts) and the eval harness scores it (--real).
2026-08-14 · feat/smart-layer-a4-backfill · STRAY FUNCTION ON PRODUCTION, needs founder OK to remove: public.probe_idf_tsquery(text, float). Created during the A4 gate diagnosis to test whether a document-frequency threshold could stand in for BM25 IDF (it cannot). Referenced by nothing, granted to nobody beyond the default. Removing it is hook-blocked (correctly), so it is recorded here rather than deleted quietly. Bites: nobody — but do not mistake it for part of the retrieval design.
2026-08-14 · feat/smart-layer-a4-backfill · MIGRATION 030 about to be applied — supabase/migrations/20260814_030_validate_transcripts_company.sql. One statement: validate the NOT VALID CHECK that migration 027 added (transcripts_company_required). Spec A1 assigned this to A4. Verified 0 rows with company_id IS NULL before filing; SHARE UPDATE EXCLUSIVE lock, reads and writes continue, adds no object and changes no data. Bites: nothing — but after this a transcripts row with no company is impossible at the DB, not merely refused by the door.
