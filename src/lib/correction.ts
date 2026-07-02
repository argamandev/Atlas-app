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

export interface Flag {
  text: string
  reason: string
}

export interface CorrectionResult {
  text: string
  applied: CorrectionItem[]
  flags: Flag[]
}

export interface Profile {
  company: string
  business: string
  quarter: string
  speakers: string // "זוהר רדי (ceo), שירן (moderator)"
}

export type GptChunkFn = (prompt: string) => Promise<string>

const KINDS: CorrectionKind[] = ['name', 'homophone', 'number']

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** Run async `fn` over items with bounded concurrency (keeps order). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Split into word windows. `overlap` repeats words across boundaries so a word near a
 *  segment edge still has neighbours for context (duplicate proposals are de-duped later). */
export function chunkByWords(text: string, wordsPerChunk = 400, overlap = 0): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const step = Math.max(1, wordsPerChunk - overlap)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += step) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '))
    if (i + wordsPerChunk >= words.length) break
  }
  return chunks
}

export function parseCorrectionItems(raw: string): CorrectionItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
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
  const maxIncrease = w === 1 ? 1 : 0 // one word may split into two; no balloon growth
  if (c > w + maxIncrease) return false
  if (c < w - 1) return false
  return true
}

/** Confident, non-number, safe items get applied (longest original first).
 *  Hard guard: a `name` correction is applied ONLY if its target is a provided entity —
 *  so without a list, names are never guessed (they fall through to flags). */
function applyConfident(
  text: string,
  items: CorrectionItem[],
  entities: string[]
): { text: string; applied: CorrectionItem[] } {
  const entitySet = new Set(entities)
  const appliable = items
    .filter(
      (i) =>
        i.certainty === 'confident' &&
        i.kind !== 'number' &&
        i.corrected &&
        isSafeCorrection(i.original, i.corrected) &&
        // names: only to a known entity, and never by DROPPING a word (no "ראול סרוגו"->"סרוגו")
        (i.kind !== 'name' || (entitySet.has(i.corrected) && wordCount(i.corrected) >= wordCount(i.original)))
    )
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

/** Route every item: confident word fixes applied; uncertain (any kind), every number,
 *  and every name not matched to the entity list are flagged (never guessed). */
export function routeItems(text: string, items: CorrectionItem[], entities: string[] = []): CorrectionResult {
  const r = applyConfident(text, items, entities)
  const appliedSet = new Set(r.applied)
  const flags: Flag[] = items
    .filter(
      (i) => !appliedSet.has(i) && (i.kind === 'number' || i.certainty === 'uncertain' || i.kind === 'name')
    )
    // keep flags precise: a flag spanning a whole clause isn't actionable as a yellow highlight
    .filter((i) => wordCount(i.original) <= 8)
    .map((i) => ({ text: i.original, reason: i.reason }))
  return { text: r.text, applied: r.applied, flags }
}

export function buildCorrectionPrompt(profile: Profile, entities: string[], chunk: string): string {
  const entityBlock = entities.length
    ? `\nרשימת שמות נכונים של החברה (השתמש בה לתיקון שמות בלבד, בהקשר):\n${entities.map((e) => `- ${e}`).join('\n')}\n`
    : ''
  return `אתה מתקן שגיאות תמלול אוטומטי (ASR) של שיחת משקיעים בעברית. תמלול גולמי, ללא הקשר חיצוני.

חברה: ${profile.company || 'לא ידוע'} | תחום: ${profile.business || 'לא ידוע'} | רבעון: ${profile.quarter || 'לא ידוע'}
דוברים: ${profile.speakers || 'לא ידוע'}${entityBlock}

החזר אך ורק JSON בפורמט:
{"items":[{"original":"<הטקסט המדויק כפי שמופיע>","corrected":"<התיקון, אם בטוח>","kind":"name|homophone|number","certainty":"confident|uncertain","reason":"<קצר>"}]}

חוקים מחייבים:
1. החזר רק רשימת שינויים נקודתיים. אל תשכתב, אל תנסח מחדש, אל תשנה פיסוק או סגנון.
2. הומופונים (kind="homophone"): תקן (confident) רק כשהמילה הנכונה כפויה מההקשר וחד-משמעית — בדרך כלל צירוף קבוע. דוגמאות בטוחות: "אישר משקיעים"->"קשרי משקיעים", "קישור התפוסה"->"שיעור התפוסה", "האגף"->"האג\"ח", "המניינו"->"היינו". אם אתה בוחר בין כמה מילים אפשריות, או שזה מונח מקצועי/שם שאתה מנחש — סמן "uncertain" ואל תשנה (למשל "שיעור רבעון": אל תנחש מהו המונח, סמן בלבד).
3. שמות (אנשים/חברות/מקומות/בניינים, kind="name"): תקן רק אם השם תואם בבירור לערך ברשימת השמות שסופקה. אם אין רשימה או אין התאמה ברורה — סמן "uncertain". לעולם אל תנחש ואל תמציא שם (למשל אל תהפוך "שייקס רובר" ל"שייקספיר", ואל תהפוך שם מקום ל"בתל אביב").
4. אם המילה הנכונה אינה ברורה מעבר לספק — סמן "uncertain", אל תשנה.
4ב. חובה: כל מילה בעברית שאינה מילה תקנית או נשמעת כג'יבריש בהקשר (למשל "אקשותכם", "היזלמי") — החזר אותה תמיד כפריט: תקן אם ברור, אחרת סמן "uncertain". אל תתעלם ממנה. (אל תתייחס למונחי אנגלית, ראשי תיבות או מספרים כג'יבריש.)
4ג. חשוב מאוד — קוהרנטיות הקשר: גם צירוף תקין דקדוקית אך חסר היגיון בהקשר הפיננסי/עסקי של השיחה — סמן "uncertain". הקריטריון אינו "האם זו מילה אמיתית" אלא "האם המשמעות מתאימה כאן". למשל "שיעור הריבון" (שיעור של ריבון/מלך) חסר משמעות בדיון נדל\"ן — חובה לסמן. כך גם כל ביטוי שקורא מבין היה תמה עליו.
5. אל תשנה איות רק כי וריאציה אחרת קיימת; תקן אך ורק את המופע השגוי המדויק (אל תיגע ב"אמפה טאואר"). שמור על מספר המילים — אל תשמיט/תוסיף מילים (אל תשמיט "ראול" מ"ראול סרוגו").
6. אם מילה תקינה והגיונית בהקשר — אל תיגע בה.
7. לעולם אל תשנה ספרה. מספר חשוד -> kind="number", סמן בלבד (למשל ערך לא הגיוני כמו מעל 100% מההכנסות).
8. "original" חייב להופיע מילה במילה בטקסט שלמטה, ולהיות המילה או הצירוף הספציפי החשוד (עד כ-4 מילים) — לעולם לא משפט שלם.

הטקסט:
${chunk}`
}

export async function correctTranscript(
  rawText: string,
  profile: Profile,
  entities: string[],
  gpt: GptChunkFn,
  wordsPerChunk = 400,
  overlap = 0
): Promise<CorrectionResult> {
  const chunks = chunkByWords(rawText, wordsPerChunk, overlap)
  const perChunk = await mapLimit(chunks, 6, async (chunk) => {
    try {
      return parseCorrectionItems(await gpt(buildCorrectionPrompt(profile, entities, chunk)))
    } catch (err) {
      console.warn('[correction] chunk skipped:', (err as Error).message)
      return [] as CorrectionItem[]
    }
  })
  const all = perChunk.flat()
  // De-dupe identical originals (keep the first), then apply to the full text.
  const seen = new Set<string>()
  const deduped = all.filter((i) => (seen.has(i.original) ? false : (seen.add(i.original), true)))
  return routeItems(rawText, deduped, entities)
}

/** STAGE 1 (V2): read the whole transcript + use world knowledge of the company to produce the
 *  canonical correct spellings of its entities (subsidiaries, buildings, people, products).
 *  Conservative: omit a name when unsure of its correct spelling rather than invent one. */
export async function generateEntities(
  rawText: string,
  profile: Profile,
  gpt: GptChunkFn
): Promise<string[]> {
  const sample = rawText.split(/\s+/).slice(0, 4000).join(' ')
  const prompt = `אתה מומחה לחברה הציבורית הישראלית "${profile.company}" (תחום: ${profile.business || 'לא ידוע'}).
לפניך תמלול גולמי (מ-ASR, עם שגיאות תעתיק) של שיחת משקיעים שלה — הוא נועד רק כדי לדעת אילו ישויות מוזכרות.

המשימה: החזר את האיות הרשמי והנכון של הישויות הקשורות לחברה — חברות-בנות וחברות קשורות, מותגים, נכסים/בניינים/פרויקטים ידועים, מנהלים בכירים, ומוצרים.

חוקים קריטיים:
- את **האיות** קח מהידע שלך (training), לא מהתמלול. התמלול שגוי — אל תעתיק ממנו שמות. אם בתמלול כתוב "תוהר" ואתה יודע שהבניין הוא "ToHa" — החזר "ToHa"; "מיטאום"->"מיטאון"; "אמפתי"->"אמפא".
- כלול שם רק אם אתה מכיר בוודאות את האיות הרשמי הנכון שלו. אם אינך בטוח — השמט אותו (עדיף להחסיר מאשר להחזיר איות שגוי).
- אל תכלול מילים גנריות, מונחים פיננסיים, מקומות גיאוגרפיים כלליים (תל אביב, חיפה), מספרים או ראשי תיבות.

החזר JSON בלבד: {"entities":["שם רשמי נכון 1","שם רשמי נכון 2"]}

התמלול (להקשר בלבד):
${sample}`
  try {
    const parsed = JSON.parse(await gpt(prompt)) as { entities?: unknown }
    const ents = Array.isArray(parsed.entities)
      ? parsed.entities.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
      : []
    return Array.from(new Set(ents.map((e) => e.trim())))
  } catch (err) {
    console.warn('[entities] generation failed:', (err as Error).message)
    return []
  }
}

/** STAGE 0 (report-grounded V2): extract canonical entity names from the company's official
 *  quarterly report (authoritative written Hebrew — includes the niche names GPT's memory lacks). */
export async function generateEntitiesFromReport(
  reportText: string,
  profile: Profile,
  gpt: GptChunkFn
): Promise<string[]> {
  const sample = reportText.slice(0, 55000) // entity-dense first half; also fits a 30k TPM cap
  const prompt = `הטקסט שלהלן הוא דוח רבעוני רשמי של החברה הציבורית "${profile.company}" (תחום: ${profile.business || 'לא ידוע'}).

המטרה: רשימה ממוקדת של שמות שסביר שיוזכרו בעל-פה בשיחת משקיעים — חברת האם, חברות-בנות עיקריות, בניינים/פרויקטים מרכזיים, ומנהלים בכירים.

חוקים (חשוב מאוד):
- החזר את הצורה ה**מדוברת/המקובלת** של השם — כפי שאומרים אותו בשיחה — ולא את השם המשפטי המלא. הסר סיומות משפטיות: "בע"מ", "(חברה כלולה)", "בע\"מ", וכו'. דוגמאות: "אמצור בע"מ" → "בית אמצור"; "אמפא קפיטל בע"מ" → "אמפא קפיטל"; אם בניין ממותג כ-"ToHa" החזר "ToHa".
- כלול רק ישויות **מרכזיות** המוזכרות בגוף הדוח (תיאור הפעילות/המגזרים/ההחזקות) — לא כל SPV או פרויקט נקודתי, לא רואי חשבון, לא נאמנים, לא יועצים.
- בלי מילים גנריות, מונחים פיננסיים, מקומות גיאוגרפיים כלליים (תל אביב/חיפה), או מספרים.
- הגבל ל-25 השמות החשובים ביותר.

החזר JSON בלבד: {"entities":["שם מדובר 1","שם מדובר 2"]}

הדוח:
${sample}`
  try {
    const parsed = JSON.parse(await gpt(prompt)) as { entities?: unknown }
    const ents = Array.isArray(parsed.entities)
      ? parsed.entities.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
      : []
    return Array.from(new Set(ents.map((e) => e.trim())))
  } catch (err) {
    console.warn('[entities/report] generation failed:', (err as Error).message)
    return []
  }
}

/** Attach each flag to the first line whose text contains the flag's span. */
export function attachFlags(lines: { text: string; flags?: Flag[] }[], flags: Flag[]): void {
  for (const flag of flags) {
    const line = lines.find((l) => l.text.includes(flag.text))
    if (line) (line.flags ??= []).push(flag)
  }
}
