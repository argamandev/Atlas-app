-- 026 — company_documents.publication_date (smart-layer slice A1, spec §2.6;
-- ingestion standard §6).
--
-- ADDITIVE ONLY — one column.
--
-- WHY. The shipped embarrassment this closes: Atlas told an analyst a 2020 annual
-- report was published on 07.08.2026 — the afternoon we ingested it. `created_at` is
-- ingestion time, a DIFFERENT FACT, and is never shown as the publication date. MAYA
-- already hands us `publicationDate` (carried as `publishedISO` today and dropped at
-- the door); from slice A3 on it is recorded at birth, and existing rows are backfilled
-- in A4/A5 (one by-issuer read per company under the global limiter). Nullable is the
-- honest state for a hand-ingested document whose publication date nobody recorded.

alter table public.company_documents
  add column if not exists publication_date timestamptz;

comment on column public.company_documents.publication_date is
  'When the filing was published on MAYA (publicationDate). Distinct from created_at, which is when Atlas ingested it — never show one as the other. Filled at birth from slice A3 on; older rows backfilled in A4/A5, null until then.';
