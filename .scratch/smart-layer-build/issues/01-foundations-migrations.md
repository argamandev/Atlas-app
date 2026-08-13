# A1 · Foundations migrations

Status: done (2026-08-13 — six migrations reviewed on file, applied, verified; branch feat/smart-layer-foundations)
Blocked by: (none)

Spec: `docs/SMART-LAYER-SPEC.md` §6 "Slice A1, fully specified" + §2.6. Six additive
migrations (pgvector, `company_aliases`, `document_chunks`, `filing_facts`,
`company_documents.publication_date`, `transcripts` identity columns) through the DDL
gate: file → atlas-reviewer on the files → COLLISIONS.md → apply. **Production DB — the
founder is told before "apply" runs.** Acceptance: reviewer verdict before apply; battery
green; RLS shape verified per table (SELECT-to-authenticated only). Cost: $0.
