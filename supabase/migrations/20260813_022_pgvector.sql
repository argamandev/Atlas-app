-- 022 — pgvector: the extension behind document_chunks.embedding (smart-layer slice A1).
--
-- ADDITIVE ONLY. Justified by measurement, not fashion: smart-layer ticket 07 measured
-- hybrid dense+lexical retrieval on our own Hebrew corpus (gemini-embedding-001 @1536,
-- MRL re-normalized) against alternatives, and dense retrieval needs a vector column and
-- an ANN index. See docs/SMART-LAYER-SPEC.md §2.5 and
-- .scratch/smart-layer/research/07-retrieval-eval-results.md.
--
-- Verified against the live DB before filing (2026-08-13): PostgreSQL 17.6, extension
-- 'vector' available and not yet installed.
--
-- Installed into the `extensions` schema per Supabase convention; the platform's default
-- search_path exposes it, so `vector(1536)` stays unqualified in later migrations.

create extension if not exists vector with schema extensions;
