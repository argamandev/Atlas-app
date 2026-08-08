import type { WordTimedTranscript } from '@/lib/live/syncEngine'

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
      /**
       * THE RECORDING, when there is one.
       *
       * Founder, 2026-08-05: *"when we're pulling a transcript, we also need to
       * pull the audio from it and the same functionality of viewing that live
       * transcript with the audio sync."*
       *
       * Both fields are null for most of the archive and that is a fact about
       * the corpus, not a bug: only calls that went through the IVRIT pipeline
       * carry stored audio and per-word timings — 4 of 56 completed transcripts
       * on 2026-08-05. The pane shows the player ONLY when both are present,
       * because a play button over silence is worse than no play button.
       */
      audioUrl: string | null
      /** per-word timings for karaoke; null when the call was never word-timed */
      wordTimed: WordTimedTranscript | null
      /** the CORPUS id, not the shelf item's. The global player keys the active
       *  track by it, so the same call opened from the call page and from a
       *  workspace pane is one track and not two competing ones. */
      transcriptId: string
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
