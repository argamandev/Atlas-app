// Post-IVRIT correction: GPT proposes a DIFF, we deterministically apply confident
// word fixes and FLAG everything uncertain (and all numbers). Never rewrites text.

export type CorrectionKind = 'name' | 'homophone' | 'number'
export type Certainty = 'confident' | 'uncertain'

export interface CorrectionItem {
  original: string
  corrected?: string
  kind: CorrectionKind
  certainty: Certainty
  reason: string
}

export interface Flag { text: string; reason: string }

export interface CorrectionResult {
  text: string
  applied: CorrectionItem[]
  flags: Flag[]
}

export interface Profile {
  company: string
  business: string
  quarter: string
  speakers: string   // "זוהר רדי (ceo), שירן (moderator)"
}

export type GptChunkFn = (prompt: string) => Promise<string>

const KINDS: CorrectionKind[] = ['name', 'homophone', 'number']

export function chunkByWords(text: string, wordsPerChunk = 400): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '))
  }
  return chunks
}

export function parseCorrectionItems(raw: string): CorrectionItem[] {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  const items = (parsed as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  const out: CorrectionItem[] = []
  for (const it of items) {
    const o = it as Record<string, unknown>
    if (typeof o.original !== 'string' || !o.original.trim()) continue
    const kind = (KINDS as string[]).includes(o.kind as string) ? (o.kind as CorrectionKind) : 'homophone'
    const certainty: Certainty = o.certainty === 'confident' ? 'confident' : 'uncertain'
    out.push({
      original: o.original,
      corrected: typeof o.corrected === 'string' ? o.corrected : undefined,
      kind,
      certainty,
      reason: typeof o.reason === 'string' ? o.reason : '',
    })
  }
  return out
}

/** Block risky changes that would rewrite rather than fix an ASR error. */
export function isSafeCorrection(wrong: string, correct: string): boolean {
  if (!wrong || !correct || wrong === correct) return false
  if (wrong.length > 35 || correct.length > 35) return false
  const w = wrong.trim().split(/\s+/).length
  const c = correct.trim().split(/\s+/).length
  const maxIncrease = w === 1 ? 1 : 0   // one word may split into two; no balloon growth
  if (c > w + maxIncrease) return false
  if (c < w - 1) return false
  return true
}

/** Confident, non-number, safe items get applied (longest original first). */
function applyConfident(text: string, items: CorrectionItem[]): { text: string; applied: CorrectionItem[] } {
  const appliable = items
    .filter(i => i.certainty === 'confident' && i.kind !== 'number' && i.corrected && isSafeCorrection(i.original, i.corrected))
    .sort((a, b) => b.original.length - a.original.length)
  let result = text
  const applied: CorrectionItem[] = []
  for (const i of appliable) {
    if (!result.includes(i.original)) continue
    result = result.split(i.original).join(i.corrected as string)
    applied.push(i)
  }
  return { text: result, applied }
}

/** Route every item: confident word fixes applied; uncertain (any kind) + every number flagged. */
export function routeItems(text: string, items: CorrectionItem[]): CorrectionResult {
  const r = applyConfident(text, items)
  const appliedSet = new Set(r.applied)
  const flags: Flag[] = items
    .filter(i => !appliedSet.has(i) && (i.kind === 'number' || i.certainty === 'uncertain'))
    .map(i => ({ text: i.original, reason: i.reason }))
  return { text: r.text, applied: r.applied, flags }
}
