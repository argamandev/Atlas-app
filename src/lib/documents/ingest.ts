// Ingest = upload PDF to the private bucket + extract per-page text + persist rows.
// Imports extract.ts → pdfjs, so it may ONLY run where pdfjs is not bundled: scripts (tsx),
// and Next server code because pdfjs-dist is listed in serverComponentsExternalPackages.
// The CLI wraps this, and `lib/maya/ingestFiling.ts` calls it for a MAYA filing.
// Idempotent on (company, quarter, docType) — NOT on maya_report_id, see IngestArgs.
import { createClient } from '@supabase/supabase-js'
import { extractPdfPages } from './extract'

export const DOCUMENTS_BUCKET = 'company-documents'

export interface IngestArgs {
  supabaseUrl: string
  serviceRoleKey: string
  fileBytes: Uint8Array
  companyId: string
  quarter: string
  docType: 'report' | 'slides'
  title: string
  source?: string
  /**
   * A MAYA filing's own identity (migration 019). Recorded so the intake can
   * tell what Atlas already holds and re-pulling a filing is a no-op.
   *
   * NOT the upsert target: `(company_id, quarter, doc_type)` still is, because
   * its unique constraint cannot be removed from a database shared with
   * production. The consequence is deliberate — for one company, period and
   * type Atlas keeps the most recently pulled filing, so a corrected
   * presentation replaces the erroneous one.
   */
  mayaReportId?: number
  /**
   * Overrides the default `${companyId}/${quarter}/${docType}.pdf`.
   *
   * MAYA needs this: a company can file several documents that map to the same
   * quarter and type, and the default path would have them overwrite each
   * other's BYTES in storage even when the rows are distinct.
   */
  storagePath?: string
}

export async function ingestDocument(a: IngestArgs): Promise<{ documentId: string; pageCount: number }> {
  const db = createClient(a.supabaseUrl, a.serviceRoleKey)

  // 1. extraction first — if the PDF is bad we fail before touching storage/DB
  const { pageCount, pages } = await extractPdfPages(a.fileBytes)
  if (pageCount === 0) throw new Error('PDF has no pages')

  // 2. ensure the private bucket exists (idempotent)
  const { data: buckets } = await db.storage.listBuckets()
  if (!buckets?.some((b) => b.name === DOCUMENTS_BUCKET)) {
    const { error } = await db.storage.createBucket(DOCUMENTS_BUCKET, { public: false })
    if (error) throw new Error(`createBucket failed: ${error.message}`)
  }

  // 3. upload (upsert = re-ingest replaces the file)
  const storagePath = a.storagePath ?? `${a.companyId}/${a.quarter.replace(/\s+/g, '-')}/${a.docType}.pdf`
  const up = await db.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, a.fileBytes, { contentType: 'application/pdf', upsert: true })
  if (up.error) throw new Error(`upload failed: ${up.error.message}`)

  // 4. upsert the document row
  const doc = await db
    .from('company_documents')
    .upsert(
      {
        company_id: a.companyId,
        quarter: a.quarter,
        doc_type: a.docType,
        title: a.title,
        source: a.source ?? 'manual',
        storage_path: storagePath,
        page_count: pageCount,
        updated_at: new Date().toISOString(),
        // Spread rather than `?? null`: a manual re-ingest of a row that came
        // from MAYA must not erase which filing it is.
        ...(a.mayaReportId === undefined ? {} : { maya_report_id: a.mayaReportId }),
      },
      { onConflict: 'company_id,quarter,doc_type' }
    )
    .select('id')
    .single()
  if (doc.error || !doc.data) throw new Error(`document upsert failed: ${doc.error?.message}`)
  const documentId = doc.data.id as string

  // 5. replace pages (delete-then-insert keeps re-ingest clean; ours-only table)
  const del = await db.from('document_pages').delete().eq('document_id', documentId)
  if (del.error) throw new Error(`pages delete failed: ${del.error.message}`)
  const rows = pages.map((text, i) => ({ document_id: documentId, page_no: i + 1, text }))
  for (let i = 0; i < rows.length; i += 50) {
    const ins = await db.from('document_pages').insert(rows.slice(i, i + 50))
    if (ins.error) throw new Error(`pages insert failed: ${ins.error.message}`)
  }
  return { documentId, pageCount }
}
