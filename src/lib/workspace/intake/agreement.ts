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
export function reconcileSelection(proposal: string[], selected: string[], removed: string[] = []): string[] {
  const drop = new Set(removed)
  const out: string[] = []
  const seen = new Set<string>()

  for (const id of [...proposal, ...selected]) {
    if (drop.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

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
 * A NON-EMPTY clarifying selection is taken as given, not merged. That is the
 * difference from `ready`: while still talking, the model is entitled to re-shape
 * the set ("actually, just the Q1 one"), and unioning would silently re-add what
 * the analyst just asked to drop.
 */
export function resolveSelection(
  status: 'ready' | 'clarifying',
  proposal: string[],
  selected: string[],
  removed: string[] = []
): string[] {
  if (status === 'ready') return reconcileSelection(proposal, selected, removed)
  if (selected.length > 0) return selected
  const drop = new Set(removed)
  return proposal.filter((id) => !drop.has(id))
}
