import type { AttachableSource } from '../data'

// ─────────────────────────────────────────────────────────────────────────────
// The intake's shapes. Kept apart from `../data.ts` (which holds row shapes and
// the surviving demo constants) because these describe a REQUEST and its ANSWER,
// not anything the database stores.
// ─────────────────────────────────────────────────────────────────────────────

/** What the user asked for, structured. Every field is optional intent. */
export type SourceRequest = {
  /** the user's own words, always kept — the fallback search and the UI both use them */
  text: string
  /** a company NAME as the user said it; resolution against real rows happens in findSources */
  company: string | null
  fromYear: number | null
  toYear: number | null
  /** null means "no preference stated", NOT "none" — an empty array would match nothing */
  kinds: Array<'transcript' | 'document'> | null
  /**
   * FALSE when the model's answer could not be read. The UI must SAY so rather
   * than present a keyword search as a considered interpretation — an
   * uninterpreted request still searches, but it searches differently and the
   * user is entitled to know which one they got.
   */
  interpreted: boolean
}

/**
 * Why a search returned what it returned. This drives the panel's wording, and
 * it is the reason the intake can be honest: "I have nothing for that company in
 * that period" and "I do not have that company at all" are different sentences,
 * and neither may be rendered as an ordinary empty list.
 */
export type FindReason = 'ok' | 'company-has-nothing-in-period' | 'no-such-company' | 'empty-corpus'

export type FindResult = {
  request: SourceRequest
  /** the resolved company name, exactly as the corpus row spells it */
  company: string | null
  matched: AttachableSource[]
  /** material for the resolved company that fell OUTSIDE the asked-for window */
  otherForCompany: AttachableSource[]
  reason: FindReason
}
