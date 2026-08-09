// ─────────────────────────────────────────────────────────────────────────────
// WHETHER THE STORED ROW IS THE DOCUMENT THE USER JUST CLICKED.
//
// `company_documents` is unique on (company_id, quarter, doc_type) — migration
// 012 — and that constraint cannot be removed, because this database is shared
// with production Timlul and `DROP CONSTRAINT` is destructive. So ONE period and
// type keeps ONE row: the most recently pulled filing. Bytes never collide
// (storage is keyed by maya_report_id) but ROWS do.
//
// A period legitimately offers two filings about a quarter of the time — a
// Hebrew and an English edition, or a correction and its original — so this is
// not an exotic case to be waved away.
//
// The guard is therefore IDENTITY, not existence: serve the stored row only
// when it points at the filing that was clicked; otherwise fetch that filing
// and overwrite the pointer. The cost is one re-fetch when a user alternates
// between two editions of one period. The alternative is showing a document
// nobody asked for, silently, which is the failure class `rules/app.md` exists
// to record.
// ─────────────────────────────────────────────────────────────────────────────

export function needsIngest(stored: { mayaReportId: number | null } | null, requested: number): boolean {
  if (!stored) return true
  return stored.mayaReportId !== requested
}
