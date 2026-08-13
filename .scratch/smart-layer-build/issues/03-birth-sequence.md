# A3 · Ingestion birth sequence

Status: done (2026-08-13 — `feat/smart-layer-a3-birth-sequence`; one chunker shared with the
harness (identical lexical re-run), birth door in `src/lib/db/transcripts.ts` + battery guard,
aligned line times persisted at finalize, XBRL facts + publication_date + facts_status in
`ingestFiling()`, global limiter in `mayaGet`, migration 028 (index_status + atomic
`atlas_replace_chunks`). Admin surface for index_status deferred to A5's admin view.)
Blocked by: 01

Spec §2.7 + `docs/INGESTION-STANDARD.md` (the law). ONE shared chunker module (harness
imports it); single transcript birth door (`source_key`, born-attributed, company from
scheduling); persisted line-timestamp alignment; XBRL facts + `publication_date` in
`ingestFiling()`; one global MAYA limiter. Acceptance: the standard's "mechanisms owed"
table — each law lands with its test. Cost: $0.
