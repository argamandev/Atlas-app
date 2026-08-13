// NO `server-only`, DELIBERATELY, and it used to be here. The real constraint on
// this file is the one `documents/ingest.ts` states about itself — it reaches
// pdfjs, so it may run in scripts (tsx) and in Next server code, and nowhere
// else. `server-only` asserts something stricter and wrong: it makes the module
// unimportable from a script, and slice A5's backfill is a script that MUST come
// through this door rather than re-implement the birth sequence beside it.
//
// Removing it costs nothing real — a client bundle reaches pdfjs, node crypto and
// a service-role key one import further down and fails there — and this repo has
// twice recorded `server-only` as the reason a defect stayed invisible
// (`company/logo.ts`, `db/companies.ts`: "no test could reach it").
import { createClient } from '@supabase/supabase-js'
import { downloadFiling } from './files'
import { describeFailure } from './types'
import type { RemoteSource } from './filings'
import { downloadXbrl, parseFilingFacts, persistFilingFacts } from './xbrl'
import { ingestDocument, type IngestResult } from '@/lib/documents/ingest'

// ─────────────────────────────────────────────────────────────────────────────
// FETCH A MAYA FILING AND MAKE IT A REAL ATLAS DOCUMENT.
//
// This is the one file in `lib/maya` that is allowed to know about the rest of
// Atlas, which is why it sits at the edge and imports downward only. The
// `layering.test.ts` guard excludes nothing — it forbids `@/lib/workspace`,
// `@/lib/db`, components and app routes, none of which appear here. Documents
// are not workspace-specific: the chat and the calendar will want the same
// ingest.
//
// FAILURES THROW for the DOCUMENT (the caller renders per-file failures[]) —
// but NOT for the structured facts: a filing whose PDF ingested fine and whose
// XBRL fetch failed is a real document with `facts_status = 'failed'`, visibly
// (ingestion standard §6). The three states:
//   'facts'  — the ת930 instance parsed, filing_facts rows written
//   'none'   — no .xbrl attachment (ICL-shaped foreign-track, or not a
//              financial statement), or an instance with no numeric fact set
//   'failed' — the attachment exists but could not be fetched/parsed (retryable)
// Never zeros, never silence.
//
// publication_date rides in from `publishedISO` — MAYA sends it on every row;
// until slice A3 it was dropped at this door (a schema gap, research/14 §2).
// ─────────────────────────────────────────────────────────────────────────────

export type IngestFilingArgs = {
  source: RemoteSource
  companyId: string
  supabaseUrl: string
  serviceRoleKey: string
}

export async function ingestFiling(a: IngestFilingArgs): Promise<IngestResult> {
  const got = await downloadFiling(a.source.pdfUrl)
  if (!got.ok) {
    // The detail matters: "not a PDF (212 bytes)" tells whoever reads the log
    // that the WAF interstitial happened, rather than leaving them to guess at
    // a generic extraction failure.
    throw new Error(`could not fetch the filing from MAYA — ${describeFailure(got.failure)}`)
  }

  const result = await ingestDocument({
    supabaseUrl: a.supabaseUrl,
    serviceRoleKey: a.serviceRoleKey,
    fileBytes: got.data,
    companyId: a.companyId,
    quarter: a.source.period,
    docType: a.source.docType,
    title: a.source.title,
    source: 'maya',
    mayaReportId: a.source.mayaReportId,
    publicationDate: a.source.publishedISO,
    // KEYED BY THE FILING, NOT BY THE PERIOD. Several filings can map to one
    // period and type, and the default path would have them overwrite each
    // other's bytes in storage even where the rows stay distinct.
    storagePath: `${a.companyId}/maya/${a.source.mayaReportId}.pdf`,
  })

  // Structured facts (standard §6) — after the document exists, status on it.
  const db = createClient(a.supabaseUrl, a.serviceRoleKey)
  let factsStatus: 'facts' | 'none' | 'failed' = 'none'
  if (a.source.xbrlUrl) {
    const xml = await downloadXbrl(a.source.xbrlUrl)
    if (!xml.ok) {
      console.error(
        `[ingestFiling] xbrl fetch failed for ${a.source.mayaReportId}: ${describeFailure(xml.failure)}`
      )
      factsStatus = 'failed'
    } else {
      try {
        const parsed = parseFilingFacts(xml.data)
        if (parsed.numericCount > 0) {
          await persistFilingFacts(db, {
            mayaReportId: a.source.mayaReportId,
            companyId: a.companyId,
            facts: parsed.facts,
          })
          factsStatus = 'facts'
        } else {
          // An instance with no numeric fact set is "no structured facts" —
          // NEVER zeros (research/14's guard).
          factsStatus = 'none'
        }
      } catch (e) {
        console.error(`[ingestFiling] xbrl parse/persist failed for ${a.source.mayaReportId}:`, e)
        factsStatus = 'failed'
      }
    }
  }
  const { error: fsErr } = await db
    .from('company_documents')
    .update({ facts_status: factsStatus })
    .eq('id', result.documentId)
  if (fsErr) console.error(`[ingestFiling] facts_status update failed: ${fsErr.message}`)

  return result
}
