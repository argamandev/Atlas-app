// The shapes `content.ts` returns, split out because that module is
// `server-only` and the browser needs to name what it receives. Same reason
// `intake/types.ts` sits beside `intake/selectSources.ts`.

export type ContentLine = {
  /** the transcript's own line id, e.g. 'L0001' — the citation anchor */
  id: string
  speaker: string
  timestamp: string
  text: string
}

export type ContentSection = { id: string; title: string; lines: ContentLine[] }

/** Why a real row has nothing to show. Never a silent empty render. */
export type UnavailableReason = 'processing' | 'no-text' | 'source-gone'

export type ItemContent =
  | {
      kind: 'transcript'
      title: string
      company: string | null
      quarter: string | null
      date: string | null
      sections: ContentSection[]
    }
  | {
      kind: 'document'
      title: string
      docType: string | null
      quarter: string | null
      /** company_documents.id — what PdfViewer streams the real file by */
      documentId: string
      pageCount: number
      /** extracted per-page text. MAY BE EMPTY while the PDF still renders: the
       *  viewer reads the file, the chat reads these, and a PDF that was stored
       *  without extraction can be looked at even though it cannot be asked about. */
      pages: { pageNo: number; text: string }[]
    }
  | { kind: 'unavailable'; title: string; reason: UnavailableReason }
