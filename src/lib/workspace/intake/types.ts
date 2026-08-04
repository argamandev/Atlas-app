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
export type FindReason = 'ok' | 'company-has-nothing-in-period' | 'nothing-matched' | 'empty-corpus'

/**
 * One turn of the intake conversation.
 *
 * `proposed` is THE AGREED SET MADE DURABLE, and it is the fix for two founder
 * complaints that turned out to be one bug (2026-08-04: "he kept on asking twice
 * just to be clear" and "he only pulled 1 file while i asked for two"). Before
 * it, the set Atlas had named existed only inside its own Hebrew prose, so every
 * turn re-derived it from scratch — which let it re-ask a settled question and
 * let it quietly emit one id where it had named two.
 *
 * Now an assistant turn that proposes files carries their ids, the client sends
 * them back, and the server treats them as the thing the user agreed to. Ids are
 * re-validated against the corpus on arrival: this is untrusted input like any
 * other body field, and it never widens what a user may reach — a stranger's id
 * is not in the corpus their own client loads.
 */
export type IntakeTurn = { role: 'user' | 'assistant'; content: string; proposed?: string[] }

/**
 * Whether Atlas is still talking or has been told to go.
 *
 * `ready` may ONLY be reached because the user agreed in their own words —
 * founder, 2026-08-04: *"once the user says, yeah, pull those files, then he…
 * then only then Atlas goes, okay, I'm pulling them."* Nothing is attached to a
 * shelf while the status is `clarifying`.
 */
export type IntakeStatus = 'clarifying' | 'ready'

/**
 * The reasoning step's answer: what Atlas says next, and — once the user has
 * agreed — the files it will pull.
 *
 * `selectedIds` is already filtered to ids that EXIST in the corpus it was shown
 * — see parseSelection. `dropped` records anything the model returned that did
 * not, which should always be empty and is kept so that a model starting to
 * invent ids is visible rather than silent.
 */
export type IntakeSelection = {
  reply: string
  status: IntakeStatus
  selectedIds: string[]
  /**
   * Ids the model says the user asked to TAKE OUT of the agreed set.
   *
   * Explicit because OMISSION IS NOT REMOVAL — see `reconcileSelection`. A file
   * that was agreed to and then merely left out of the next payload has not been
   * declined by anyone, so only a removal stated here can drop it.
   */
  removedIds: string[]
  dropped: string[]
}

export type FindResult = {
  request: SourceRequest
  /** the resolved company name, exactly as the corpus row spells it */
  company: string | null
  matched: AttachableSource[]
  /** material for the resolved company that fell OUTSIDE the asked-for window */
  otherForCompany: AttachableSource[]
  reason: FindReason
}

/**
 * What the intake route answers with.
 *
 * TWO SHAPES IN ONE, and which one arrived is decided by `reply`:
 *  - `reply` is a string → Atlas understood and chose. `selected` is pre-ticked,
 *    `others` is the rest of the corpus, offered untouched.
 *  - `reply` is null → the model was unavailable or unusable. `fallback` carries
 *    the deterministic keyword result, and the panel MUST say so rather than
 *    presenting it as comprehension.
 */
export type IntakeResponse = {
  reply: string | null
  status: IntakeStatus
  /** the files Atlas will pull — only acted on when `status` is `ready` */
  selected: AttachableSource[]
  fallback: FindResult | null
}
