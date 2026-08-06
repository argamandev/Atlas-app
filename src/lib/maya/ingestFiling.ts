import 'server-only'
import { downloadFiling } from './files'
import { describeFailure } from './types'
import type { RemoteSource } from './filings'
import { ingestDocument } from '@/lib/documents/ingest'

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
// FAILURES THROW, deliberately, and this is the boundary where the layer's
// result-type discipline ends. The caller is a route handling ONE file inside a
// loop over several, and the panel already renders a per-file `failures[]` of
// {title, error}; an exception with a readable message is exactly what that
// wants. Returning a MayaResult here would only be unwrapped into a throw.
// ─────────────────────────────────────────────────────────────────────────────

export type IngestFilingArgs = {
  source: RemoteSource
  companyId: string
  supabaseUrl: string
  serviceRoleKey: string
}

export async function ingestFiling(a: IngestFilingArgs): Promise<{ documentId: string; pageCount: number }> {
  const got = await downloadFiling(a.source.pdfUrl)
  if (!got.ok) {
    // The detail matters: "not a PDF (212 bytes)" tells whoever reads the log
    // that the WAF interstitial happened, rather than leaving them to guess at
    // a generic extraction failure.
    throw new Error(`could not fetch the filing from MAYA — ${describeFailure(got.failure)}`)
  }

  return ingestDocument({
    supabaseUrl: a.supabaseUrl,
    serviceRoleKey: a.serviceRoleKey,
    fileBytes: got.data,
    companyId: a.companyId,
    quarter: a.source.period,
    docType: a.source.docType,
    title: a.source.title,
    source: 'maya',
    mayaReportId: a.source.mayaReportId,
    // KEYED BY THE FILING, NOT BY THE PERIOD. Several filings can map to one
    // period and type, and the default path would have them overwrite each
    // other's bytes in storage even where the rows stay distinct.
    storagePath: `${a.companyId}/maya/${a.source.mayaReportId}.pdf`,
  })
}
