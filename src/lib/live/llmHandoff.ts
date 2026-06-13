import type { WordTimedTranscript } from './syncEngine'

export interface LlmTarget {
  key: 'chatgpt' | 'claude' | 'gemini'
  label: string
  url: string
}

export const LLM_TARGETS: LlmTarget[] = [
  { key: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { key: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { key: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
]

export function buildLlmPrompt(company: string, quarter: string, transcriptText: string): string {
  return (
    `Here is the ${company} ${quarter} investor-call transcript. ` +
    `Help me analyze it — summarize the key points, guidance, and risks, and answer my questions about it.\n\n` +
    `=== TRANSCRIPT ===\n${transcriptText}`
  )
}

// Flatten a word-timed transcript into readable "Speaker: words" paragraphs.
export function transcriptToText(t: WordTimedTranscript): string {
  return t.segments.map((s) => `${s.speakerName}: ${s.words.map((w) => w.text).join(' ')}`).join('\n\n')
}
