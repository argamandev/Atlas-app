# The ingestion standard — how a document is born

Type: grilling
Status: claimed
Blocked by: (none — frontier; its inputs 07, 08 and 14 are all resolved)

## Question

The standard every new transcript and filing obeys the moment it joins the corpus — written
once, cited by the spec (ticket 10). Decide the end-to-end birth sequence: **born attributed**
(`company_id` required at creation — no unattributed rows ever again); **chunked** per the
measured shapes (speaker-seam line-windows for transcripts, page-as-chunk for filings);
**embedded** (`gemini-embedding-001` @1536 with the deterministic metadata prefix, verbatim
`content` kept separate from `embedding_input`); **anchored** (real per-line timestamps from
the pipeline, quote snapshots, the corpus-level anchor from ticket 08); **deduped at birth**
(the `PyuMxe88e8g_live` lesson — a duplicate must be caught at ingestion, not by a ranker);
**structured facts extracted** (the XBRL parser in `ingestFiling()`, ticket 14); **publication
date recorded** (the new additive column). Also decide: where the pipeline runs, how it
respects MAYA's rate limit, and the re-processing story — what happens to chunks, embeddings
and anchors when `formatted_data` regenerates (drift is rendered, never hidden).

Most of this is engineering under laws already set; the founder confirms the product-visible
calls. Deliverable: the standard as a document the spec cites, plus the migration list it
implies.

## Comments

**2026-08-13 — drafted, awaiting the founder's four calls (HITL).** The standard is
drafted in full at `docs/INGESTION-STANDARD.md` (DRAFT header), including the birth
sequence, the laws with their mechanisms-owed table, and the six-migration list. Grounded
in a fresh code survey: 7 transcript write paths exist and 5 allow a null company; the
live engines never touch the DB; timestamps are one hard-coded `'00:00:00'`
(`transcription.ts:507`) while real IVRIT/Recall word timings already sit in
`word_segments` and the alignment code exists in `loadCall.ts`; the `PyuMxe88e8g_live`
duplicate was born from an id-collision check that never looked at the source; MAYA's
`publicationDate` reaches `ingestFiling()` and is dropped at the door; no queue/cron
machinery exists anywhere (everything is request-time `setImmediate`), and MAYA pacing is
per-call-site, not global. Four product-visible calls put to the founder (⚑ in the
draft): Q1 attribution door (company required at every door; non-TASE content stays out),
Q2 duplicate UX ("already in the archive", re-processing updates in place), Q3 timestamp
backfill for the 5 existing transcripts (align where word timings exist, line-only
citations elsewhere), Q4 day-one indexing backfill of the existing corpus (~$0.35).
On his answers: fold in, drop DRAFT, file his words in `DECISIONS.md`, resolve.
