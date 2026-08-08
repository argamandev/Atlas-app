import type { AttachableSource, RemoteRef } from '../data'

/**
 * A proposed MAYA filing as it travels through the browser and back.
 *
 * `title` rides along for DISPLAY ONLY — so the panel can name the file in a
 * failure line — and is never written anywhere. The attach route ignores it and
 * asks MAYA for the real one, which is what keeps a browser from naming a
 * document for every member of a shared corpus.
 */
export type ProposedRemote = RemoteRef & { title: string }

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
export type IntakeTurn = {
  role: 'user' | 'assistant'
  content: string
  proposed?: string[]
  /**
   * The MAYA filings among `proposed`, echoed back in full.
   *
   * WHY IDS ALONE ARE NOT ENOUGH HERE. A local id is re-validated against the
   * corpus, which the server can load. A `maya:<id>` names a filing that lives
   * on TASE's servers, so the server cannot resolve it back into a file without
   * knowing whose filing it is — and on the agreement turn ("כן") there is
   * deliberately no model call to re-derive the company from. Without this the
   * shortcut silently dropped every remote id and the user's yes pulled nothing.
   *
   * SAFE TO ECHO BECAUSE IT IS ONLY EVER A POINTER. The attach endpoint takes
   * `mayaReportId` + `issuerId` from here and then asks MAYA itself for the
   * title, the issuer name and the file URL. Nothing a client writes in this
   * field becomes content in Atlas; a forged entry can at most name a filing
   * that does not exist, which fails.
   */
  proposedRemote?: ProposedRemote[]
}

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
   * ⚠ THIS USED TO CITE `reconcileSelection` FOR THE RULE "OMISSION IS NOT
   * REMOVAL", and both the function and the rule are gone (2026-08-08): merging
   * an omitted file back in is what silently restored filings the analyst had
   * narrowed away. A shorter set from the model is now honoured AS a decision —
   * see `resolveSelection`. This field survives because an EXPLICIT removal is
   * still worth stating separately from a re-listing, and it applies at both
   * statuses.
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
  /**
   * MAYA COULD NOT BE REACHED, so the candidate list is Atlas's own library
   * only.
   *
   * DETERMINISTIC, AND NOT LEFT TO THE MODEL, because the failure mode here is
   * a fluent sentence that misrepresents coverage. Handed a local-only list the
   * model would answer "I don't have that" with total confidence — the exact
   * untrue sentence fixed on 2026-08-06, arriving through a different door. The
   * panel states this itself, in the user's language.
   */
  sourceError?: 'maya_unreachable' | 'request_not_understood' | null
  /**
   * A company was named and could not be resolved to a TASE issuer. Said
   * plainly, rather than presenting local results as though the search
   * succeeded. The directory covers only companies that announced a reporting
   * date, so this is a real and expected outcome, not only a typo.
   */
  unknownCompany?: string | null
  /**
   * ATLAS COULD NOT WORK OUT WHICH FILES, SO IT ATTACHED NONE — and says which
   * of the two ways it failed.
   *
   * THE INVARIANT THIS EXISTS TO EXPRESS: `status: 'ready'` with an empty
   * `selected` is a lie, and the route can no longer emit one (see `respond`).
   * It emitted one for a day. `selectSources.ts` requires the model's `ready`
   * sentence to say it is pulling the files in, so the panel printed *"great,
   * I'm pulling them in now"* above no file, no spinner and no notice — the
   * fourth occurrence on this branch of the standing law in `rules/app.md` that
   * degradation must be VISIBLE.
   *
   * `nothing_selected` — resolution came out empty. Nothing is claimed about
   *   WHY; the panel asks the analyst to name the files, which is the only
   *   honest next step. It is deliberately NOT the "model did not answer"
   *   wording: the model answered.
   * `narrowing_conflict` — the model's prose narrowed the set and its ids did
   *   not. The disagreement is INFORMATION, and it goes to the analyst rather
   *   than being resolved internally by picking whichever half is easier.
   */
  unresolved?: 'nothing_selected' | 'narrowing_conflict' | null
}
