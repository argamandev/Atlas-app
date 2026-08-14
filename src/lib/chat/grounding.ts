/**
 * What a chat answer is GROUNDED IN — the domain vocabulary, with no transport.
 *
 * These three types describe things the user is looking at: a call a citation
 * points back to, a marked passage in a report PDF, a snipped region of a page.
 * They are the same facts whichever backend answers the question.
 *
 * WHY THIS FILE EXISTS, and it is not tidying. All three were declared inside
 * `lib/api/chat.ts` — the client that speaks HTTP to the OLD `/api/chat` route
 * — and eleven modules imported them from there, most of which never call chat
 * at all (the PDF viewer, the workspace shelf, the live facet panes). Ticket 08
 * retires that route and its wire format, so a purely transport-level change was
 * going to drag eleven files with it and could not be reviewed as one thing.
 *
 * The seam belongs at the transport, not at the vocabulary: `lib/api/*` may be
 * replaced whenever the wire format changes; what a snip IS does not change with
 * it. Nothing in this file may import from `lib/api` — that direction is the
 * defect being removed.
 */

/**
 * The call a citation points back to. Rendered by `CitationPopover`, and carried
 * on the old route as a URI-encoded `x-chat-source` response header.
 */
export interface ChatSource {
  company: string
  quarter: string
  transcriptId: string
}

/** Multiview: marked-PDF passage grounding — a document and the pages in play. */
export interface DocumentRef {
  documentId: string
  pages: number[]
}

/** Pinge: one snipped region of the report PDF, captured client-side as a PNG data URL. */
export interface ChatSnip {
  dataUrl: string
  page: number
  documentId: string
}
