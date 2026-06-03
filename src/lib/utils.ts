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

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
