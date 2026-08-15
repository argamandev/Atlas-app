// ─────────────────────────────────────────────────────────────────────────────
// THE IMPURE HALF OF REPORT-PAGE INJECTION — two Supabase reads, kept out of
// `documentInjection.ts` so the builder (and everything that tests it) stays
// pure. The same split `callSource.ts` / `callInjection.ts` makes, for the same
// reason: `@/lib/supabase` constructs a client at module load and throws without
// live env vars, so a static import would make the loop untestable.
//
// `supabaseAdmin` IS CORRECT HERE, stated rather than left to look like the usual
// shortcut. `company_documents` and `document_pages` are SHARED CORPUS —
// migration `20260714_012` grants `for select to authenticated` on both, with no
// owner column to filter by (docs/DATA-MODEL.md). This reads the same rows the
// retired `/api/chat` read through the same client (`lib/chat/context.ts`), and
// the caller is already authenticated: `/api/chat/v2` resolves a user before
// anything else runs.
//
// NO `import 'server-only'` — `server-only` resolves only inside Next's build, so
// a static import makes this unloadable from a plain node process, which is what
// `scripts/measure-chat-answer.mjs` is. `callSource.ts` carries the full story.
// ─────────────────────────────────────────────────────────────────────────────

import { getDocumentMeta, getPageText } from '@/lib/documents'
import type { DocumentMeta, DocumentPage } from './documentInjection'

export interface LoadedDocument {
  /** `null` when the row is gone — the pages may still have text. */
  meta: DocumentMeta | null
  /** The requested pages that actually have stored rows, in order. */
  pages: DocumentPage[]
}

/**
 * Load the meta and the page text for the pages riding one turn.
 *
 * THE TWO READS ARE INDEPENDENT AND BOTH ARE ALLOWED TO COME BACK EMPTY, which
 * is why this returns a shape rather than `null`. A document row with no
 * extracted pages (a scanned PDF) and a page set whose meta row was deleted are
 * different facts, and `buildDocumentBlock` says something different for each —
 * collapsing them here would decide on a proxy for the fact rather than the fact
 * (M3.2). A THROWN error is the third case: the read itself failed, and the loop
 * reports that as `failed` rather than as "this report has no text".
 */
export async function loadDocumentForInjection(documentId: string, pages: number[]): Promise<LoadedDocument> {
  // In parallel: neither read depends on the other, and this block sits in front
  // of the first model call on every snip-bearing turn.
  const [meta, texts] = await Promise.all([getDocumentMeta(documentId), getPageText(documentId, pages)])
  return {
    meta: meta ? { title: meta.title, quarter: meta.quarter } : null,
    pages: texts,
  }
}
