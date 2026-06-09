export type TranscriptStatus = 'processing' | 'completed' | 'failed'

export type SpeakerRole = 'ceo' | 'cfo' | 'analyst' | 'moderator'

export interface Speaker {
  id: string
  name: string
  role: SpeakerRole
  title?: string
  affiliation?: string
}

export interface Highlight {
  start: number
  end: number
}

export interface TranscriptLine {
  id: string
  speakerId: string
  timestamp: string
  text: string
  highlights?: Highlight[]
  /** verify flags — uncertain words and numbers; UI shows a yellow "check the recording" badge */
  flags?: { text: string; reason: string }[]
}

/** Admin diagnostics: every correction the corrector applied (and flagged). */
export interface CorrectionDiag {
  original: string
  corrected?: string
  kind: 'name' | 'homophone' | 'number'
  certainty: 'confident' | 'uncertain'
  reason: string
}

export interface TranscriptSection {
  id: string
  title: string
  lines: TranscriptLine[]
}

export interface Transcript {
  id: string
  company: string
  ticker?: string
  quarter: string
  date: string
  duration: string
  youtubeUrl?: string
  status: TranscriptStatus
  createdAt: string
  /** transcription engine that produced this transcript (admin diagnostics) */
  engine?: string
  /** transcription model string sent to the engine (admin diagnostics) */
  model?: string
  /** wall-clock processing time in seconds (admin diagnostics) */
  processingSecs?: number
  /** corrections applied + flags raised by the Step 0 corrector (admin diagnostics) */
  corrections?: CorrectionDiag[]
  /** auto-generated per-company entity list used to ground name corrections (admin diagnostics) */
  entities?: string[]
  speakers: Speaker[]
  sections: TranscriptSection[]
}

export interface RecentTranscript {
  id: string
  company: string
  ticker?: string
  quarter: string
  date: string
  duration: string
  status: TranscriptStatus
  createdAt: string
}
