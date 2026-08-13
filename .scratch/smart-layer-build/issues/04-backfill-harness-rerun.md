# A4 · Backfill + harness re-run (the gate)

Status: ready-for-agent
Blocked by: 02, 03

Spec §6 A4; the standard's backfill section. Existing corpus (5 transcripts, 23
documents) through the standard: publication dates, XBRL facts, source keys, timestamp
alignment, ~3,200 chunks embedded. **Acceptance — the gate for every surface slice: the
standing 18-case harness (`scripts/retrieval-eval/`) re-runs against the REAL pipeline
(pgvector + real tsvector lexical channel) and reproduces the measured eval results,
MUST-PASS cases included.** Cost: ≈ $0.35.
