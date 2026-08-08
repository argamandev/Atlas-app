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
// A CLOSED VOCABULARY, deliberately — IN `isBareAgreement`, AND ONLY THERE. Any
// word that is not a known agreement or filler word means this is not a bare
// "yes", and the message goes to the model as before. That is the safe direction:
// mistaking "yes, but add the Q3 call" for a bare yes would pull the wrong shelf,
// whereas failing to recognise an unusual "yes" merely costs one ordinary model
// turn.
//
// ⚠ THAT PARAGRAPH USED TO BE UNQUALIFIED, AND THE MISSING QUALIFIER COST A
// REVIEW ROUND. `agreedToStandingSet` does NOT carry a closed vocabulary, and
// must not: it runs AFTER a model returned a set, where the obligation is
// different and copying this rule over began refusing plain agreements. The two
// functions look alike and stand on different ground — read each one's own header
// before changing either, and do not unify their word lists.
//
// THE SHAPE THIS FILE KEPT GETTING WRONG, filed once so the next session inherits
// it rather than rediscovering it: every guard here is a natural-language
// classifier over an OPEN vocabulary deciding how many files move, and no list
// will ever be complete. Two review rounds went into vocabulary and both were
// overtaken. What finally held is the property that being wrong FAILS VISIBLY —
// see `intake/respond.ts`. Reach for that before reaching for another word.
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

// ─────────────────────────────────────────────────────────────────────────────
// A QUESTION IS NOT AN AGREEMENT, AND PUNCTUATION IS NOT HOW YOU TELL.
//
// The first version of this file called a message a question when it ended in
// "?". The cold review (2026-08-08) pointed out that this guards a typing habit
// rather than a meaning, and it was right — but the finding was filed against
// `agreedToStandingSet` only, and measuring it found the WORSE half:
//
//   isBareAgreement("is that right")   === true    ← pulls with NO model call
//   isBareAgreement("you sure")        === true
//   isBareAgreement("ok is that all")  === true
//
// `right` and `sure` are agreement words and everything around them was filler,
// so an analyst checking Atlas's work triggered the shortcut that attaches the
// standing set verbatim. So this lives here, above both functions, and both
// consult it.
//
// It does NOT try to enumerate questions — that is the open-vocabulary trap the
// review warned about. It looks for the three marks a question leaves in the
// grammar itself, which are closed:
// ─────────────────────────────────────────────────────────────────────────────

/** ① Interrogatives. A word whose only job is to ask. */
const INTERROGATIVE = new Set([
  // Hebrew
  'מה',
  'מי',
  'מתי',
  'איפה',
  'היכן',
  'איך',
  'כיצד',
  'למה',
  'מדוע',
  'כמה',
  'האם',
  'איזה',
  'איזו',
  'אילו',
  'מאיפה',
  'לאן',
  // English
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'when',
  'where',
  'why',
  'how',
])

/**
 * ② English inverts the auxiliary before the subject to ask, and only to ask.
 *
 * "that is right" is a statement; "is that right" is a question, and the ONLY
 * difference is the order. So the bigram is the signal — which is why this
 * catches "ok is that all", where the interrogative-free question sits behind an
 * agreement word and a trailing-"?" test sees nothing.
 *
 * ⚠ `do` AND `have` ARE DELIBERATELY ABSENT, and a test caught their absence
 * being needed: an English IMPERATIVE uses the bare verb form, so *"do it"* — one
 * of this file's own examples of a plain yes — parses as `do` + `it` and was read
 * as a question. Only the inflected and modal auxiliaries mark inversion
 * unambiguously, because none of them can open an imperative. Nothing is lost:
 * *"do you want"* and *"have you got"* are caught by the second-person rule below.
 */
const AUXILIARY = new Set([
  'is',
  'are',
  'was',
  'were',
  'am',
  'does',
  'did',
  'can',
  'could',
  'should',
  'shall',
  'will',
  'would',
  'has',
  'had',
  'may',
  'might',
  'must',
])
const SUBJECT = new Set([
  'that',
  'this',
  'these',
  'those',
  'it',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'there',
  'all',
  'both',
  'everything',
])

/**
 * ③ The second person addresses ATLAS, and you do not address someone to agree
 * with them. "you sure" is an elided "are you sure" — no interrogative, no
 * inversion, no "?" — and it was passing as agreement on `sure`.
 *
 * `thank you` is the one ordinary exception and is spelled out rather than
 * generalised.
 */
const POLITE_BEFORE_YOU = new Set(['thank', 'thanks'])

/**
 * Is the analyst ASKING rather than agreeing?
 *
 * Deliberately over-inclusive: a false positive costs one ordinary model turn,
 * while a false negative attaches files to a shared corpus off a question. That
 * asymmetry is the same one every decision in this file turns on.
 */
export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.endsWith('?') || trimmed.endsWith('؟')) return true

  const words = trimmed.toLowerCase().split(SEPARATORS).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (INTERROGATIVE.has(w)) return true
    if (AUXILIARY.has(w) && i + 1 < words.length && SUBJECT.has(words[i + 1])) return true
    if (w === 'you' && !(i > 0 && POLITE_BEFORE_YOU.has(words[i - 1]))) return true
  }
  return false
}

/**
 * Words that pick an ELEMENT out of a list.
 *
 * An ordinal cannot agree to a set — it names a member of one. *"the first one
 * looks right"* was the cold review's round-1 counterexample and passes every
 * other test here: short, no negation, no question mark, and `right` is an
 * agreement word.
 */
const ORDINAL = new Set([
  'ראשון',
  'הראשון',
  'ראשונה',
  'הראשונה',
  'שני',
  'השני',
  'שנייה',
  'השנייה',
  'שלישי',
  'השלישי',
  'אחרון',
  'האחרון',
  'אחרונה',
  'האחרונה',
  'first',
  'second',
  'third',
  'fourth',
  'last',
  'latest',
])

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
  // A CHECK IS NOT A YES, and this shortcut skips the model entirely — so an
  // analyst asking "is that right" was attaching the standing set by asking
  // about it. Measured, not assumed: see `looksLikeQuestion`.
  if (looksLikeQuestion(trimmed)) return false

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

// ⚠ A DOCSTRING FOR `reconcileSelection` SURVIVED ITS DELETION AND STOOD HERE
// UNTIL 2026-08-08. It described the function's whole invariant — "a file merely
// left out has not been declined by anyone, so it stays" — which is the exact
// behaviour `resolveSelection` was changed to REVERSE, ~200 lines above the new
// header that says the opposite. The cold review found it, and its point was
// that this is round 1's own blocker class (a document asserting behaviour the
// code no longer has) reappearing inside the file that fixed it. Deleting a
// function means deleting what it promised, in the same commit.

/**
 * Words that make a message a CHANGE however many yes-words sit beside it.
 *
 * "yes, but not the call" is the shape it exists for. It used to be described
 * here as "the belt to the braces" of an exact set comparison — that claim is
 * withdrawn: see `agreedToStandingSet`, where the set comparison turned out to
 * catch CHANGES and be blind to QUESTIONS, so this list is a primary guard
 * rather than a redundant one.
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
  'בלבד',
  'מספיק',
  'דלג',
  'תוריד',
  'הורד',
  'תוציא',
  'only',
  'without',
  'except',
  'instead',
  'not',
  'no',
  'skip',
  'drop',
  'remove',
  'exclude',
])

/**
 * Did the analyst just ask for LESS than what is on the table?
 *
 * Used for ONE decision: whether an EMPTY model selection may fall back to the
 * standing proposal. See `resolveSelection` for why that fallback is otherwise
 * correct, and why it is catastrophic here.
 *
 * ⚠ THIS LIST IS INCOMPLETE IN BOTH DIRECTIONS, AND THAT IS NOW SURVIVABLE
 * RATHER THAN FIXED. The cold review (2026-08-08) demonstrated both halves by
 * running this source:
 *
 *   MISSES a real cut:   "מספיק הראשון", "just the first one", "skip the call"
 *   FIRES on a widening: "לא, את כולם" ("no — ALL of them"), "בטח, למה לא",
 *                        "no problem, go ahead"
 *
 * because `לא` / `no` open a widening as often as a cut. The words the review
 * named are added above (`just` deliberately excluded — *"ok, just go ahead"* is
 * filler) and ORDINALS below, but a longer list is not the remedy and no list
 * ever will be: Hebrew and English both have unbounded ways to say "only those
 * two". THE REMEDY IS THAT BEING WRONG NOW FAILS VISIBLY — a wrong `true` here
 * empties the selection, and an empty selection can no longer be reported as a
 * successful pull (`IntakeResponse.unresolved`, and the invariant in the route's
 * `respond`). Wrong costs the analyst one honest question instead of a sentence
 * announcing an attach that did not happen.
 */
export function narrowsSelection(text: string): boolean {
  return text
    .trim()
    .toLowerCase()
    .split(SEPARATORS)
    .filter(Boolean)
    .some((w) => NARROWING.has(w) || ORDINAL.has(w))
}

// A `QUANTITY` SET STOOD HERE FOR ONE DAY AND IS DELETED (2026-08-08). It held
// שתיהן / both / each so that the closed vocabulary below could accept them —
// and the closed vocabulary is itself gone, for the reason in that function's
// header. A word list kept alive only to widen another word list is two lists to
// maintain and one property to reason about; when the property turned out to be
// wrong, both went.

/**
 * A KIND of file. Naming one introduces a CATEGORY, which re-shapes the ask —
 * *"כן, תביא את הדוחות"* ("yes, bring the reports") is a different request from
 * "yes", even though every other word in it is inert.
 */
const KIND = new Set([
  'דוח',
  'הדוח',
  'דוחות',
  'הדוחות',
  'שיחה',
  'השיחה',
  'שיחות',
  'השיחות',
  'מצגת',
  'המצגת',
  'מצגות',
  'המצגות',
  'report',
  'reports',
  'call',
  'calls',
  'presentation',
  'presentations',
  'filing',
  'filings',
])

/**
 * A COUNTED reference — "both", "the two", "all three".
 *
 * WHY THIS EARNS A KIND WORD ITS WAY BACK IN. A bare definite plural opens a new
 * category ("the reports"); a COUNTED one points back at a set that was just
 * counted for the analyst ("the two calls", "the three reports"). Both of the
 * cold review's Hebrew counterexamples are the second shape — *"כן, תביא את שתי
 * השיחות"*, *"כן, את שלושת הדוחות"* — and refusing them dropped the analyst back
 * into the founder's re-confirmation loop.
 */
const COUNTED = new Set([
  'שתי',
  'שני',
  'שתיהן',
  'שתיהם',
  'שניהם',
  'שניהן',
  'שלוש',
  'שלושת',
  'שלושה',
  'שלושתם',
  'שלושתן',
  'ארבע',
  'ארבעת',
  'כולם',
  'כולן',
  'שניכם',
  'both',
  'either',
  'each',
  'two',
  'three',
  'four',
  'all',
])

/**
 * A PERIOD — a year, a quarter.
 *
 * The single most common way to re-shape a request for filings, and the only one
 * of these tests that is a pattern rather than a list: any 4-digit run, `q1`–`q4`,
 * or `רבעון`. *"תביא לי את הדוחות של 2025"* is a fresh request that happens to
 * open with an agreement word, and this is what keeps it out.
 */
const PERIOD = /\b(?:19|20)\d{2}\b|\bq[1-4]\b|רבעון/i

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
 * ⚠ THIS FUNCTION HAS NOW BEEN WRONG IN BOTH DIRECTIONS ON CONSECUTIVE DAYS,
 * and the second mistake is the instructive one.
 *
 * Round 1 (2026-08-08): it took "any agree word anywhere" in an unbounded
 * message, so *"מה בדיוק ההבדל ביניהם?"* passed on `בדיוק` and *"the first one
 * looks right"* passed on `right` — questions, both. The fix was to copy
 * `isBareAgreement`'s closed vocabulary wholesale.
 *
 * Round 2 (same day, second cold review): the copied vocabulary OVERSHOT and
 * began refusing plain agreements, dropping them back into the founder's
 * re-confirmation loop. Measured, all false: *"yes, both of them"* (failed on
 * the word **"of"**), *"yes, all three"*, *"go ahead with both"*, *"כן, תביא את
 * שתי השיחות"*, *"כן, את שלושת הדוחות"*.
 *
 * THE COPY WAS THE ERROR, because the two functions do not stand on the same
 * ground and a shared vocabulary pretended they did:
 *
 *   `isBareAgreement` runs INSTEAD OF a model. Nothing downstream re-checks it,
 *      so an unknown word could be anything and the vocabulary must be closed.
 *   THIS runs AFTER a model returned a set, and only promotes when that set is
 *      EXACTLY the one already named in prose and shown to the analyst.
 *
 * So the right question is not "is every word known?" but "does the message
 * still MEAN yes to the set on screen?" — and the division of labour falls out
 * of what the set comparison can and cannot see:
 *
 *   IT CATCHES CHANGES. "כן, ותוסיף גם את הדוח של טבע" makes the model return a
 *      different set, and the comparison fails. No vocabulary needed.
 *   IT IS BLIND TO QUESTIONS. `selectSources.ts` asks for the standing set at
 *      BOTH statuses, so a message ABOUT that set matches it. This was the cold
 *      review's own diagnosis in round 1 and it is exactly right: two guards,
 *      one of which was always going to pass.
 *
 * ⇒ the message-level guards no longer ask "is every word known?" but "does this
 * message RE-SHAPE the ask?" — five things that do, each of which the set
 * comparison could miss:
 *
 *   a QUESTION      `looksLikeQuestion`, grammar rather than punctuation
 *   an ORDINAL      picks an element out of a list instead of agreeing to it;
 *                   this is what keeps *"the first one looks right"* out
 *   a NEGATION      *"כן, אבל בלי השיחה"*
 *   a PERIOD        a year or quarter — *"yes, the 2025 ones"* is a new request
 *   a bare KIND     *"כן, תביא את הדוחות"* opens a category; the same word beside
 *                   a COUNTED reference points back at the standing set instead
 *
 * ⚠ WHAT REMAINS UNGUARDED, stated rather than glossed: a fresh request that
 * names no period, no kind and no ordinal — *"כן, של תיגבור"* — promotes if the
 * model answers it with the standing set. The set comparison is what stands
 * there, and its weakness is known. It is the residual of a real trade: the
 * error it allows spends one MAYA download on files the analyst can remove from
 * the shelf, and the error the closed vocabulary allowed was the
 * re-confirmation loop this module exists to end.
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
  if (looksLikeQuestion(trimmed)) return false
  if (PERIOD.test(trimmed)) return false

  const words = trimmed.toLowerCase().split(SEPARATORS).filter(Boolean)
  if (words.length === 0) return false
  if (words.some((w) => NEGATION.has(w) || ORDINAL.has(w))) return false
  // A KIND word opens a category unless something COUNTS it, in which case it is
  // pointing back at the set already on the table.
  if (words.some((w) => KIND.has(w)) && !words.some((w) => COUNTED.has(w))) return false
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
 * What one turn resolved to, and whether resolving it hit a contradiction.
 *
 * `conflict` exists so the caller CANNOT treat a detected disagreement as an
 * ordinary empty list — see `resolveSelection`'s header for the failure that
 * made it a field rather than a comment.
 */
export type Resolution = {
  /** the ids to pull, deduped, in the order the conversation built them */
  ids: string[]
  /**
   * The model's PROSE narrowed the set and its IDS did not. Nothing is pulled,
   * and the analyst is told which of the two Atlas could not reconcile — never
   * silently handed one of them.
   */
  conflict: boolean
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
 * `status` is no longer read, and the parameter is GONE (2026-08-08) rather than
 * kept as `_status`. A parameter every caller must pass and nothing consults is
 * a small untrue statement about what this function depends on, and this file
 * has spent two review rounds deleting those.
 *
 * ⚠ IT RETURNS A RESULT, NOT A LIST, AND THAT IS THE POINT. When this function
 * empties a set it is reporting a DISAGREEMENT it detected, and the first
 * version of the fix expressed that as a bare `[]` — indistinguishable from "the
 * analyst is owed nothing". The route then announced a successful pull of no
 * files. Handing back a shape the caller cannot read as ordinary emptiness is
 * what makes the honest branch in `respond` unavoidable rather than remembered.
 */
export function resolveSelection(
  proposal: string[],
  selected: string[],
  removed: string[] = [],
  /** the analyst's latest message asked for LESS — see `narrowsSelection` */
  narrowed = false
): Resolution {
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
  if (narrowed && proposal.length > 1 && sameSet(out, proposal)) return { ids: [], conflict: true }
  return { ids: out, conflict: false }
}

/** Set equality over id lists, order- and duplicate-insensitive. */
function sameSet(a: string[], b: string[]): boolean {
  const left = Array.from(new Set(a))
  const right = new Set(b)
  return left.length === right.size && left.every((id) => right.has(id))
}
