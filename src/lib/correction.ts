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

export function buildCorrectionPrompt(profile: Profile, entities: string[], chunk: string): string {
  const entityBlock = entities.length
    ? `\nרשימת שמות נכונים של החברה (השתמש בה לתיקון שמות בלבד, בהקשר):\n${entities.map(e => `- ${e}`).join('\n')}\n`
    : ''
  return `אתה מתקן שגיאות תמלול אוטומטי (ASR) של שיחת משקיעים בעברית. תמלול גולמי, ללא הקשר חיצוני.

חברה: ${profile.company || 'לא ידוע'} | תחום: ${profile.business || 'לא ידוע'} | רבעון: ${profile.quarter || 'לא ידוע'}
דוברים: ${profile.speakers || 'לא ידוע'}${entityBlock}

החזר אך ורק JSON בפורמט:
{"items":[{"original":"<הטקסט המדויק כפי שמופיע>","corrected":"<התיקון, אם בטוח>","kind":"name|homophone|number","certainty":"confident|uncertain","reason":"<קצר>"}]}

חוקים מחייבים:
1. החזר רק רשימת שינויים נקודתיים. אל תשכתב, אל תנסח מחדש, אל תשנה פיסוק או סגנון.
2. תקן רק שגיאות ASR ברורות: מילים חסרות-משמעות, מילים שלא ייתכנו בהקשר, ושמות שתואמים לרשימה. אל תיגע בניסוח ש"נשמע טוב יותר".
3. סמן certainty לכל פריט: אם אתה בטוח במילה הנכונה -> "confident" (תיושם). אם משהו ברור שגוי אך אינך בטוח מה הנכון -> "uncertain" (יסומן למשתמש, לא ישונה). אם שום דבר לא שגוי — אל תכלול אותו.
4. לעולם אל תשנה ספרה. מספר יכול להיות לכל היותר "uncertain" עם kind="number" (למשל ערך לא הגיוני כמו מעל 100% מההכנסות) — סמן, אל תתקן.
5. "original" חייב להופיע מילה במילה בטקסט שלמטה.

הטקסט:
${chunk}`
}

export async function correctTranscript(
  rawText: string,
  profile: Profile,
  entities: string[],
  gpt: GptChunkFn,
  wordsPerChunk = 400,
): Promise<CorrectionResult> {
  const chunks = chunkByWords(rawText, wordsPerChunk)
  const all: CorrectionItem[] = []
  for (const chunk of chunks) {
    try {
      const raw = await gpt(buildCorrectionPrompt(profile, entities, chunk))
      all.push(...parseCorrectionItems(raw))
    } catch (err) {
      console.warn('[correction] chunk skipped:', (err as Error).message)
    }
  }
  // De-dupe identical originals (keep the first), then apply to the full text.
  const seen = new Set<string>()
  const deduped = all.filter(i => (seen.has(i.original) ? false : (seen.add(i.original), true)))
  return routeItems(rawText, deduped)
}

/** Attach each flag to the first line whose text contains the flag's span. */
export function attachFlags(lines: { text: string; flags?: Flag[] }[], flags: Flag[]): void {
  for (const flag of flags) {
    const line = lines.find(l => l.text.includes(flag.text))
    if (line) (line.flags ??= []).push(flag)
  }
}
