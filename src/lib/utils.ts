import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isValidYouTubeUrl(url: string): boolean {
  const trimmed = url.trim()
  return [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}/,
    /^https?:\/\/youtu\.be\/[\w-]{11}/,
    /^https?:\/\/(www\.)?youtube\.com\/live\/[\w-]{11}/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]{11}/,
  ].some(p => p.test(trimmed))
}

export function isValidVimeoUrl(url: string): boolean {
  const trimmed = url.trim()
  return [
    /^https?:\/\/(www\.)?vimeo\.com\/\d+/,
    /^https?:\/\/player\.vimeo\.com\/video\/\d+/,
    /^https?:\/\/(www\.)?vimeo\.com\/channels\/[\w-]+\/\d+/,
  ].some(p => p.test(trimmed))
}

export function isValidVideoUrl(url: string): boolean {
  return isValidYouTubeUrl(url) || isValidVimeoUrl(url)
}

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/live\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export function extractVimeoId(url: string): string | null {
  const patterns = [
    /vimeo\.com\/video\/(\d+)/,
    /vimeo\.com\/channels\/[\w-]+\/(\d+)/,
    /vimeo\.com\/(\d+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return `vimeo-${m[1]}`
  }
  return null
}

export function extractVideoId(url: string): string | null {
  return extractYouTubeId(url) ?? extractVimeoId(url)
}

export function generateTranscriptId(url: string): string {
  const id = extractVideoId(url)
  return id ?? Math.random().toString(36).slice(2, 11)
}

// Parse a quarter label like "Q1 2026" (or "רבעון 1 2026") into a sortable
// number: year*10 + quarter. Higher = newer. Returns 0 when unparseable.
export function quarterSortKey(quarter: string | undefined | null): number {
  if (!quarter) return 0
  const m = quarter.match(/(?:Q|רבעון)\s*([1-4]).*?(\d{4})/i) ?? quarter.match(/(\d{4}).*?(?:Q|רבעון)\s*([1-4])/i)
  if (!m) {
    const yearOnly = quarter.match(/(\d{4})/)
    return yearOnly ? parseInt(yearOnly[1], 10) * 10 : 0
  }
  // Normalize: first capture group order differs between the two patterns
  const a = parseInt(m[1], 10)
  const b = parseInt(m[2], 10)
  const year = a > 100 ? a : b
  const q = a > 100 ? b : a
  return year * 10 + q
}

// Pick text direction from content rather than the unreliable `dir="auto"` (which only
// inspects the first strong character — so a Hebrew reply that opens with a number, ticker,
// or English word wrongly renders LTR, and its tables flip the wrong way). We count Hebrew
// vs Latin letters: Hebrew-dominant → rtl, no Hebrew at all → ltr. Used by the chat output
// (assistant markdown, reference blocks) so Hebrew reads right-to-left and English stays LTR.
export function detectDir(text: string | null | undefined): 'rtl' | 'ltr' {
  if (!text) return 'rtl' // the product is Hebrew-native; default RTL when there's nothing to weigh
  const hebrew = (text.match(/[֐-׿]/g) || []).length
  if (hebrew === 0) return 'ltr'
  const latin = (text.match(/[A-Za-z]/g) || []).length
  return hebrew >= latin ? 'rtl' : 'ltr'
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
