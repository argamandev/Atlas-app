// ─────────────────────────────────────────────────────────────────────────────
// "YES" IS NOT A QUESTION FOR A MODEL.
//
// Founder, 2026-08-04, after using the conversational intake: *"i asked him to
// pull certain documents. he said just to be clear i need to pull this and this.
// and then i said yes. and then he kept on asking twice just to be clear. just
// to be clear. this is an awful user experience. + he only pulled 1 file while i
// asked for two files and we agreed on them."*
//
// Two complaints, ONE cause: the agreed set was never held anywhere. Every turn
// re-ran the model over the whole thread and asked it to re-derive the selection
// from its own prose. So the model could re-ask a question it had already asked,
// and it could quietly emit one id where it had named two — and nothing in the
// code could tell either from a legitimate answer.
//
// The previous attempt at a fix was a paragraph in the prompt telling the model
// not to do that. It did it anyway, which is the whole lesson: THE RULE THAT
// MATTERS IS THE ONE IN THE CODE. So a bare agreement is now recognised here,
// deterministically, and the proposal it agrees to is pulled verbatim without
// consulting a model at all. That makes the loop and the dropped file
// STRUCTURALLY impossible rather than discouraged — and, as a bonus on the turn
// where waiting is least tolerable, it costs zero network time.
//
// A CLOSED VOCABULARY, deliberately. Any word that is not a known agreement or
// filler word means this is not a bare "yes", and the message goes to the model
// as before. That is the safe direction: mistaking "yes, but add the Q3 call"
// for a bare yes would pull the wrong shelf, whereas failing to recognise an
// unusual "yes" merely costs one ordinary model turn.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Words that MEAN yes. At least one of these must be present — a message made
 * only of filler ("אותם", "please") is not agreement.
 */
const AGREE = [
  // Hebrew
  'כן',
  'אישור',
  'מאשר',
  'מאשרת',
  'אוקיי',
  'אוקי',
  'בסדר',
  'בטח',
  'קדימה',
  'יאללה',
  'תמשוך',
  'תמשכי',
  'למשוך',
  'משוך',
  'תביא',
  'הבא',
  'מושלם',
  'מדויק',
  'נכון',
  'בדיוק',
  'סבבה',
  'אחלה',
  'מעולה',
  'טוב',
  // English
  'yes',
  'yeah',
  'yep',
  'yup',
  'ok',
  'okay',
  'sure',
  'correct',
  'right',
  'exactly',
  'perfect',
  'great',
  'go',
  'pull',
  'do',
  'confirm',
  'confirmed',
  'proceed',
  'continue',
]

/**
 * Words that may ACCOMPANY a yes without changing it. Never sufficient alone.
 *
 * Kept short on purpose: every word added here is a word that can no longer
 * block a false positive, so nothing that could carry an instruction belongs.
 */
const FILLER = [
  // Hebrew
  'אותם',
  'אותן',
  'אותו',
  'את',
  'זה',
  'זהו',
  'הם',
  'אלה',
  'אלו',
  'בבקשה',
  'תודה',
  'הכל',
  'עכשיו',
  'לי',
  'נא',
  // "the files" generically — NOT a kind of file. "הדוחות" / "השיחות" stay out
  // on purpose: with a proposal on the table, "pull the REPORTS" is a change to
  // it, not an agreement to it.
  'קבצים',
  'הקבצים',
  // English
  'them',
  'those',
  'these',
  'it',
  'all',
  'ahead',
  'do',
  'please',
  'thanks',
  'thank',
  'you',
  'that',
  'thats',
  'is',
  'sounds',
  'good',
  'fine',
  'the',
  'files',
  'now',
  'lets',
  'let',
  'us',
]

const AGREE_SET = new Set(AGREE)
const FILLER_SET = new Set(FILLER)

/**
 * Everything that separates words, including the Hebrew punctuation (׳ ״) and
 * the quote characters a phone keyboard produces. Mirrors `findSources`'
 * tokenizer rather than sharing it: that one folds Hebrew final letter forms for
 * PREFIX matching, which would be wrong here — this is exact-word matching, and
 * folding would make "טוב" and "טוף" the same word.
 */
const SEPARATORS = /[\s\-–—_()[\]{}<>,.;:!?"'`׳״/\\|+*=&%#@~]+/

/** Long enough to hold an instruction, so not a bare yes however it reads. */
const MAX_AGREEMENT_CHARS = 60

/**
 * Is this message nothing but "yes"?
 *
 * TRUE only when every word is a known agreement or filler word AND at least one
 * of them actually means yes. Anything else — a company name, a quarter, "but",
 * "without", "instead", a word this file has never heard of — returns false and
 * the message takes the ordinary model path.
 */
export function isBareAgreement(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > MAX_AGREEMENT_CHARS) return false

  const words = trimmed.toLowerCase().split(SEPARATORS).filter(Boolean)
  if (words.length === 0) return false

  let sawAgreement = false
  for (const w of words) {
    if (AGREE_SET.has(w)) {
      sawAgreement = true
      continue
    }
    if (FILLER_SET.has(w)) continue
    // An unknown word. It might be a company, a quarter, a negation, or a whole
    // new instruction — we do not know, and guessing is exactly the failure this
    // module exists to prevent.
    return false
  }
  return sawAgreement
}

/**
 * Fold a proposal and a fresh selection into the set to pull.
 *
 * THE INVARIANT: OMISSION IS NOT REMOVAL. The founder agreed to two files and
 * one arrived, because the model simply did not re-type the second id. A file
 * that was named, agreed to, and then merely left out of the next JSON payload
 * has not been declined by anyone — so it stays, and the ONLY way a file leaves
 * an agreed set is the model explicitly saying it was removed.
 *
 * Order: the agreed proposal first, in the order it was confirmed, then anything
 * newly added — so the shelf reads in the order the conversation built it.
 */
/**
 * Words that make a message a CHANGE however many yes-words sit beside it.
 *
 * Only used by `agreedToStandingSet` below, which is already guarded by an exact
 * set comparison — this is the belt to that braces. "yes, but not the call" is
 * the shape it exists for.
 */
const NEGATION = new Set([
  'לא',
  'בלי',
  'חוץ',
  'במקום',
  'אבל',
  'רק',
  'no',
  'not',
  'without',
  'except',
  'instead',
  'but',
  'only',
  'just',
])

/**
 * Words that can only make a set SMALLER.
 *
 * A strict subset of NEGATION, and the exclusions are the point. `אבל` / `but`
 * are ambiguous — *"כן, אבל תוסיף גם את השיחה"* is an ADDITION, and treating it
 * as a narrowing would drop the standing set, which is the founder's 2026-08-04
 * complaint reintroduced. English `just` is worse: *"ok, just go ahead"* is
 * pure filler. Both stay in NEGATION, where they only ever block a promotion —
 * a safe thing to be wrong about — and out of here, where being wrong discards
 * an agreed set.
 */
const NARROWING = new Set([
  'רק',
  'בלי',
  'חוץ',
  'במקום',
  'לא',
  'only',
  'without',
  'except',
  'instead',
  'not',
  'no',
])

/**
 * Did the analyst just ask for LESS than what is on the table?
 *
 * Used for one decision: whether an EMPTY model selection may fall back to the
 * standing proposal. See `resolveSelection` for why that fallback is otherwise
 * correct, and why it is catastrophic here.
 */
export function narrowsSelection(text: string): boolean {
  return text
    .trim()
    .toLowerCase()
    .split(SEPARATORS)
    .filter(Boolean)
    .some((w) => NARROWING.has(w))
}

/**
 * Words that say HOW MANY of a set, without changing which set.
 *
 * The ONLY reason `agreedToStandingSet` exists rather than just calling
 * `isBareAgreement`: "כן, תביא את שתיהן" is an agreement whose extra word is a
 * quantity. These cannot go in FILLER, because with three files on the table
 * "both" is a NARROWING — but paired with the exact-set comparison below, where
 * a narrowing makes the model return a different set, they are safe here.
 *
 * As short as AGREE and FILLER, and for the same reason: every word here is a
 * word that can no longer block a false positive.
 */
const QUANTITY = new Set([
  'שתיהן',
  'שתיהם',
  'שניהם',
  'שניהן',
  'שלושתם',
  'שלושתן',
  'כולם',
  'כולן',
  'both',
  'either',
  'each',
])

/**
 * The analyst agreed, and the model asked them again anyway.
 *
 * FOUNDER, 2026-08-07: *"adding a document doesn't actually work"*. The full
 * chain, reproduced: they ask for a call, the model finds two with the same
 * title and asks which — a good question — and they answer *"כן, תביא את
 * שתיהן"*. That is an agreement, but not a BARE one: `שתיהן` ("both of them")
 * is not in the filler vocabulary and cannot safely be added to it, because the
 * same word is a NARROWING when three files are on the table. So the turn takes
 * the model path, and the model replied *"אז אני מביא לך את שתי השיחות…"* —
 * "so I'm bringing you both" — with `status: "clarifying"`. Nothing was pulled.
 * The analyst is told the files are coming, and waits for files that are not.
 *
 * The model's `selected` was RIGHT; only its status was wrong. So this does not
 * re-read the sentence. It asks a narrower question that has a certain answer:
 * did the analyst say a yes-word and nothing else of consequence, and did the
 * model come back with EXACTLY the set already on the table? If so there is
 * nothing left to confirm — the prompt's own "NEVER ASK THE SAME CONFIRMATION
 * TWICE" applies, and this is that rule moved into the code, where this file's
 * header says the rules that matter live.
 *
 * ⚠ THE FIRST VERSION OF THIS FUNCTION TOOK "ANY AGREE WORD ANYWHERE" IN AN
 * UNBOUNDED MESSAGE, and the cold review (2026-08-08) was right to call it: it
 * had neither of the two properties that make `isBareAgreement` safe. So
 * *"מה בדיוק ההבדל ביניהם?"* ("what exactly is the difference between them?")
 * passed on `בדיוק`, and *"the first one looks right"* passed on `right` —
 * QUESTIONS, both of them. The exact-set comparison was supposed to be the
 * backstop and is not one here: `selectSources.ts` tells the model to return the
 * standing set at BOTH statuses, so on a question about the standing set the
 * comparison MATCHES and the files get pulled. Two guards, one of which was
 * always going to pass.
 *
 * It now carries the same closed vocabulary and the same length bound as its
 * sibling, one step wider: every word must be a known agreement, filler or
 * QUANTITY word. An unknown word — a company, a quarter, "difference", "looks" —
 * means this is not a plain yes and the conversation carries on. A trailing "?"
 * disqualifies outright: whatever else a question is, it is not agreement.
 *
 * A change is still safe twice over: "כן, אבל בלי השיחה" is refused on `אבל`
 * before the vocabulary is even consulted, and would fail the set comparison
 * anyway.
 */
export function agreedToStandingSet(
  latestUserMessage: string,
  status: 'ready' | 'clarifying',
  proposal: string[],
  selected: string[]
): boolean {
  if (status === 'ready') return false
  if (proposal.length === 0) return false

  const trimmed = latestUserMessage.trim()
  // The same bound as `isBareAgreement`: long enough to hold an instruction, so
  // not a plain yes however it reads.
  if (!trimmed || trimmed.length > MAX_AGREEMENT_CHARS) return false
  if (trimmed.endsWith('?') || trimmed.endsWith('؟')) return false

  const words = trimmed.toLowerCase().split(SEPARATORS).filter(Boolean)
  if (words.length === 0) return false
  if (words.some((w) => NEGATION.has(w))) return false
  // CLOSED, like the bare check. An unknown word might be a company, a quarter,
  // a question or a whole new instruction — we do not know, and guessing is the
  // failure this module exists to prevent.
  if (!words.every((w) => AGREE_SET.has(w) || FILLER_SET.has(w) || QUANTITY.has(w))) return false
  if (!words.some((w) => AGREE_SET.has(w))) return false

  // EXACTLY the standing set — not a superset, not a subset. Anything else is
  // the model re-shaping the proposal, which is a thing the analyst still has
  // to see and agree to.
  // Arrays, not Set iteration: the tsconfig target predates downlevel iteration
  // over a Set, and that only surfaces at typecheck.
  const a = Array.from(new Set(proposal))
  const b = new Set(selected)
  if (a.length !== b.size) return false
  return a.every((id) => b.has(id))
}

// `reconcileSelection` STOOD HERE AND IS DELETED (2026-08-08). It merged the
// standing proposal with the model's selection, and merging is precisely the
// behaviour the cold review found attaching files the analyst had asked to leave
// out. Once `resolveSelection` stopped branching on status it had no caller left
// but its own tests — an exported, well-tested function that nothing runs, which
// is the same "backend with zero callers" shape this branch spent a day closing
// elsewhere. Removed rather than left for someone to reintroduce by calling it.

/**
 * The set on the table after one turn, at EITHER status.
 *
 * Why the clarifying half exists — it is the whole of the founder's 2026-08-04
 * report *"it still opened only 1 document even tho we agreed on 3"*, and the
 * previous fix missed it. The set was made durable across turns, but the model
 * was never asked to PRODUCE it before agreement: the prompt said to put ids in
 * `selected` "only when their latest message agrees". So Atlas named three files
 * in perfect Hebrew prose and returned `selected: []`, the client stored an empty
 * proposal, the bare-yes shortcut had nothing to fire on, and the next turn asked
 * a model to re-derive a set it had already decided — which is where files go
 * missing. Every guard downstream was working on an empty list.
 *
 * The prompt now demands `selected` at both statuses. THIS is the part that does
 * not depend on a model obeying it: a clarifying turn that names files while
 * returning none cannot be a deliberate emptying — nobody re-shapes a set to
 * nothing while still discussing it — so the standing proposal survives.
 *
 * A NON-EMPTY SELECTION IS AUTHORITATIVE AT BOTH STATUSES — one rule, not two.
 *
 * ⚠ THIS USED TO BRANCH ON STATUS, AND THAT BRANCH WAS THE WORST BUG ON THE
 * BRANCH (cold review, 2026-08-08). `ready` unioned the proposal with the
 * selection while `clarifying`, one line below, honoured the selection as given.
 * Identical payloads, opposite meanings, keyed on a status the route elsewhere
 * distrusts enough to override. The failure it produced:
 *
 *     proposal ["A","B","C"] · analyst "כן, רק את הראשון" ("yes, only the first")
 *     model    status:"ready", selected:["A"], removed:[]
 *     → union → ["A","B","C"]  ⇒ all three attached, all three FETCHED FROM MAYA
 *                                and written into the SHARED corpus.
 *
 * A narrowing the model reports by OMISSION was silently reverted, and Atlas did
 * more than the analyst agreed to — the founder's own intolerable class, and the
 * reason this held 62 otherwise-good commits.
 *
 * The union was defending the opposite mistake (founder, 2026-08-04: *"he only
 * pulled 1 file while i asked for two files and we agreed on them"*), so dropping
 * it is not free. It is right anyway, for two reasons:
 *
 *   1. THAT CASE NO LONGER REACHES HERE. A bare "כן" is recognised in code by
 *      `isBareAgreement` and pulls the standing proposal verbatim WITHOUT calling
 *      a model (see the route). What reaches this function at `ready` is a
 *      message that carried extra words — and extra words are exactly where a
 *      narrowing lives. Honouring the model's set is honouring the analyst's.
 *   2. THE TWO ERRORS ARE NOT SYMMETRICAL. Pulling too few is visible and
 *      recoverable in one sentence ("you missed one"). Pulling too many spends
 *      MAYA downloads, writes shared-corpus rows every member of the platform
 *      then reads, and puts files on a shelf nobody asked for.
 *
 * An EMPTY selection still falls back to the standing proposal, which is what
 * covers "go ahead" without a re-listing: nobody re-shapes a set to nothing while
 * still discussing it, so an empty list is an omission, never a deliberate
 * emptying. Taking one out is `removed`, which applies at both statuses.
 *
 * ⚠ EXCEPT AFTER A NARROWING, and this is the same blocker through its other
 * door — found while proving the first fix in the browser. Proposal of three,
 * analyst says *"כן, רק את הראשון"*, and the model narrows IN PROSE ("so just
 * the 2021 report?") while returning `selected: []`. The fallback then restores
 * all three, the client stores them as the standing proposal, and the analyst's
 * next bare "כן" — which `isBareAgreement` pulls VERBATIM without a model —
 * fetches every one of them. Observed: `resolvedCount: 3` under a reply naming
 * exactly one file.
 *
 * So when `narrowed` is set, an empty selection stays empty. The set on the
 * table is then nothing, which costs the analyst one more turn and cannot cost
 * them three unwanted filings in the shared corpus. The asymmetry is the same
 * one this whole function turns on: too few is a sentence, too many is a
 * download.
 *
 * DEDUPED HERE, and it has to be: `orderBySelection` maps over the ids it is
 * given without collapsing repeats, so one id twice is one FILE twice — on the
 * confirm list and then on the shelf. The union this replaced deduped as a side
 * effect of merging two lists; nothing downstream does.
 *
 * `status` is no longer read. It stays in the signature because callers pass it
 * and because its removal would make this look like a rename rather than what it
 * is — the deliberate end of two rules where there should always have been one.
 */
export function resolveSelection(
  _status: 'ready' | 'clarifying',
  proposal: string[],
  selected: string[],
  removed: string[] = [],
  /** the analyst's latest message asked for LESS — see `narrowsSelection` */
  narrowed = false
): string[] {
  const drop = new Set(removed)
  const source = selected.length > 0 ? selected : narrowed && proposal.length > 0 ? [] : proposal
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of source) {
    if (drop.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  // A NARROWING THAT DID NOT NARROW IS A FAILED TURN, not an agreement to
  // everything. Observed live on the fix above: asked for three, told "כן, רק
  // את הראשון", the model wrote *"so just the 2021 report?"* — correct prose —
  // and returned all THREE ids anyway. Honouring `selected` then carries the
  // full set forward as the standing proposal, and the next bare "כן" pulls it
  // verbatim without a model. The model's words and its ids disagreed, and the
  // ids are the half that moves files.
  //
  // `> 1` because narrowing a one-item set TO that item is confirmation, not a
  // cut: "כן, רק את זה" with one file on the table must still work.
  if (narrowed && proposal.length > 1 && sameSet(out, proposal)) return []
  return out
}

/** Set equality over id lists, order- and duplicate-insensitive. */
function sameSet(a: string[], b: string[]): boolean {
  const left = Array.from(new Set(a))
  const right = new Set(b)
  return left.length === right.size && left.every((id) => right.has(id))
}
