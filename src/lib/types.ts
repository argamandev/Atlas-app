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
