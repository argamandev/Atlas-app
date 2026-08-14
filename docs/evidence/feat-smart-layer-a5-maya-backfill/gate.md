# A5 acceptance gate — the harness against the REAL pipeline, at the real corpus size

Ticket 05's own owed item: *"the retrieval gate has NOT been re-run at this size (`run.mjs --real`).
Deferred past the merge by founder decision to unblock B1 — a real weakening of A5's acceptance.
It gates B1 SHIPPING, not B1 starting."* This file closes it.

- Command: `node --import tsx scripts/retrieval-eval/run.mjs --real --dense-only`
- Corpus at run time: 98,042 chunks (92 transcript windows, 97,950 filing page chunks), 1,298 of
  1,300 `company_documents` indexed — see "What did not finish" below.
- Result file: `scripts/retrieval-eval/results/run-real-2026-08-14T11-36-49.md`
- Compare against: `docs/evidence/feat-smart-layer-a4-backfill/gate.md` (3,181 chunks, dense-only
  measured there too, but over a corpus small enough that Postgres never engaged the ANN index —
  see that file's "THE ANN INDEX WAS NEVER EXERCISED").

## Why `--dense-only`, not the full 5-design `--real` run

Two unscoped `--real` attempts at the full design set (`L-real`, `B-gemini-real`, `C-gemini-real`,
`B-gemini-scoped-real`, `C-gemini-scoped-real`) both failed outright — `Error: retrieveChunks:
canceling statement due to statement timeout` — on the very FIRST design tried, `L-real`: unscoped
lexical over the whole 98K-chunk corpus. `atlas_search_chunks_v2` sorts every GIN-matched row by an
unindexed `ts_rank_cd`; for a common Hebrew term that bitmap is most of the table, and that sort
alone exceeded PostgREST's `authenticator` role's `statement_timeout = 8s` (verified: `select
rolconfig from pg_roles where rolname = 'authenticator'`).

That is not a corpus-size regression to chase — it is the harness measuring a channel **production
does not call**. The founder's 2026-08-14 decision (`DECISIONS.md`) already ships dense-only; the
lexical/hybrid channel is a flag away, not deleted, for his own stated revisit trigger. So `run.mjs`
gained `--dense-only` (this branch): it measures only `B-gemini-real` and `B-gemini-scoped-real` —
the two designs `retrieveChunks(db, {channels: 'dense', ...})` actually calls in production. The
other three designs stay defined in `buildRealDesigns`, unmeasured here.

## Verdict in one table

| Design | A4 (3,181 chunks, seq-scan) | A5 real (98,042 chunks, ANN engaged) |
| --- | --- | --- |
| dense, unscoped (`B-gemini-real`) | MRR 0.254 · hit@5 6/15 · hit@20 7/15 | MRR **0.131** · hit@5 2/15 · hit@20 5/15 |
| dense, scoped (`B-gemini-scoped-real`) | MRR 0.268 · hit@5 7/15 · hit@20 8/15 | MRR **0.195** · hit@5 3/15 · hit@20 5/15 |

Unscoped MRR roughly HALVED; scoped MRR dropped ~27%. Both hit@20 counts dropped from 7–8/15 to
5/15. This is the exact question A4's gate flagged before A5's backfill even ran: *"the dense
channel's reproduction should be re-measured once the corpus is large enough to make the index
engage... at ~60K pages the planner will use the index, and HNSW is approximate by construction."*
The answer, now measured: yes, the approximation costs real rank quality at this corpus size.

**MUST-PASS case 14 (`בז"א` alias resolution) is BROKEN unscoped.** It has ranked 1 in every prior
measurement, A4 included. In this run it ranks **18** unscoped — outside hit@20 — and only holds at
rank 1 in the **scoped** design, where the company pre-filter narrows the HNSW walk enough to
compensate. Read literally, the MUST-PASS gate now depends on scoping.

**What is NOT the cause, confirmed by the header this harness already carried:** every case in this
run reports its dense channel "CUT SHORT: 1000 rows for a 5000-row request, with ≥5001 in scope" —
`hnsw.ef_search`'s hard ceiling (pgvector caps it at 1000; this is not a tunable past that point,
verified against the `atlas_search_chunks_v2` clamp and pgvector's own limit). That truncation was
anticipated in `run.mjs`'s own header before this run and is not new information. The rank drop is
a separate, real fact: at the SAME 1000-candidate ceiling, HNSW's approximate walk is finding worse
matches than the exact cosine A4 measured, because A4 never actually exercised the index.

## What was tried, and why it stopped short of a fix

The index (`document_chunks_embedding_hnsw`) was built with pgvector's bare defaults — `m=16`,
`ef_construction=64`, no tuning at all (verified: `select indexdef from pg_indexes where
tablename='document_chunks'`). Raising `hnsw.ef_search` further is not available — it is already at
pgvector's hard ceiling. The remaining real lever is rebuilding the index with a higher `m`/
`ef_construction`, which needs `DROP INDEX` first — hook-blocked on this database by design
(`rules/db.md`: *"When unsure whether a change is destructive → it goes to the founder first"*).
The founder attempted it directly in the Supabase SQL editor (`drop index ...; create index ...
with (m = 32, ef_construction = 128);`) but ran it from two tabs simultaneously, which did not
complete cleanly; the index is, as of this file, still the untuned default. **Deferred, not
abandoned** — his own words: *"can we maybe try to improve it, and if it is still bad we will move
forward and come back to it later on... we could attack this specific search in the whole market in
a better way in a dedicated grill me session and prd."*

## What this means for what ships next

Every corpus-grounded surface — Chat, Ask Atlas, Workspace chat, and Agents once built — shares this
ONE retrieval door (`retrieveChunks` → `atlas_search_chunks_v2`). None of them can be more accurate
than what is measured here. Company-scoped questions (`@company`, a context-scoped Ask Atlas) fare
meaningfully better than open market-wide questions but are still down from the A4 baseline that
originally justified going dense-only. This is a recall problem — finding the right chunk — not a
hallucination problem; a citation that does surface should still be trustworthy. Ticket 06 (B1a,
unified chat backend) already merged and ticket 07 continue regardless — they inherit whatever this
number is at the time they ship, which is why it is filed here rather than left implied.

## What did not finish, named rather than rounded off

Two documents (426 and 537 pages — annual reports) remain `index_status = 'failed'` after several
repair passes: `atlas_replace_chunks` hits `canceling statement due to statement timeout` on their
bulk chunk insert every time, regardless of the corpus-wide compute strain being resolved. This is
a structural scale-tail (thousands of chunks in one delete+insert transaction), not the same defect
as the corpus-wide strain below, and is a design question for `atlas_replace_chunks` (batching the
insert), not a retry problem. 1,298 of 1,300 documents are indexed; these 2 are not, and are not
silently counted as done.

## A genuine infrastructure incident, for the record

Mid-repair, the Supabase project's compute was saturated (CPU 98%, Disk IO 100%, confirmed via the
dashboard) by the embedding backfill's write load — pgvector's HNSW index maintenance is disk-IO
heavy, and the project's compute tier at the time was too small for A5's corpus-scale write volume.
This produced cascading `statement_timeout` / PostgREST schema-cache errors across unrelated,
read-only queries for roughly 40 minutes, including from this session's own diagnostic reads. The
founder raised the compute tier; the backfill then completed cleanly in three short passes. Not a
retrieval-design defect — noted here because it is exactly the kind of failure `app.md` M1 warns
reads as "the query is broken" when the honest read is "the database is out of headroom."
