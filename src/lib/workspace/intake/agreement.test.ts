import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isBareAgreement,
  resolveSelection,
  agreedToStandingSet,
  narrowsSelection,
  looksLikeQuestion,
} from './agreement'

/**
 * The ids only, for the many cases where the conflict flag is not the subject.
 *
 * `resolveSelection` returns `{ ids, conflict }` rather than a list precisely so
 * a caller cannot read a detected contradiction as ordinary emptiness — the
 * tests that ARE about that flag assert on it directly, below.
 */
const ids = (...args: Parameters<typeof resolveSelection>) => resolveSelection(...args).ids

// ── the yes ──────────────────────────────────────────────────────────────────
// THE EXACT MESSAGE THAT LOOPED. Founder, 2026-08-04: he answered a confirmation
// with "כן" and Atlas asked the same question again. With this recognised in
// code, that turn no longer reaches a model at all, so it cannot re-ask.

test('a bare Hebrew yes is agreement', () => {
  for (const s of ['כן', 'כן!', ' כן ', 'כן.', 'אישור', 'אוקיי', 'בדיוק', 'מושלם', 'קדימה']) {
    assert.equal(isBareAgreement(s), true, s)
  }
})

test('a yes with harmless words around it is still agreement', () => {
  for (const s of [
    'כן, תמשוך אותם',
    'כן תמשוך אותם בבקשה',
    'כן בבקשה',
    'תמשוך את הקבצים',
    'כן, זה בדיוק',
    'אוקיי קדימה',
  ]) {
    assert.equal(isBareAgreement(s), true, s)
  }
})

test('a bare English yes is agreement', () => {
  for (const s of ['yes', 'Yes!', 'ok', 'yeah', 'go ahead', 'pull them', 'do it', 'yes please', 'perfect']) {
    assert.equal(isBareAgreement(s), true, s)
  }
})

// ── everything that is NOT a yes ─────────────────────────────────────────────
// The vocabulary is CLOSED, so these pass by containing a word the module has
// never heard of. That is the safe direction: an unrecognised yes costs one
// model turn, a misrecognised instruction pulls the wrong files.

test('agreement plus an addition is NOT bare agreement', () => {
  // The founder's own second turn. If this were read as a bare yes, the file he
  // asked to add would be silently dropped — the very bug being fixed.
  for (const s of [
    'כן, אבל תוסיף גם את השיחה של רבעון רביעי 2025',
    'כן ותוסיף את הדוח של Q2',
    'yes but also add the Q3 call',
    'yes, and the annual report too',
  ]) {
    assert.equal(isBareAgreement(s), false, s)
  }
})

test('agreement minus something is NOT bare agreement', () => {
  for (const s of ['כן אבל בלי הדוח של Q1', 'כן, תוריד את השיחה', 'yes, without the transcript']) {
    assert.equal(isBareAgreement(s), false, s)
  }
})

test('a refusal is not agreement', () => {
  for (const s of ['לא', 'לא, לא את זה', 'no', 'not those', "no that's wrong"]) {
    assert.equal(isBareAgreement(s), false, s)
  }
})

test('an actual request is not agreement', () => {
  for (const s of [
    'תביא לי את הדוח של תיגבור',
    'pull the Q1 report',
    'תמשוך את שתי השיחות של 2026',
    'הבא את הדוח השנתי',
  ]) {
    assert.equal(isBareAgreement(s), false, s)
  }
})

test('filler alone is not agreement — something must actually mean yes', () => {
  for (const s of ['אותם', 'them', 'please', 'the files', '']) {
    assert.equal(isBareAgreement(s), false, s)
  }
})

test('a long message is never a bare yes, however it reads', () => {
  // Length alone cannot make a yes ambiguous, but a message this long is far
  // more likely to be carrying an instruction the vocabulary happens to miss.
  const long = 'כן '.repeat(30)
  assert.equal(isBareAgreement(long), false)
})

test('punctuation and emphasis do not defeat it', () => {
  for (const s of ['כן!!!', 'yes.', 'ok, go', 'כן — תמשוך']) {
    assert.equal(isBareAgreement(s), true, s)
  }
})

// ── the set on the table, turn by turn ───────────────────────────────────────
// THE SECOND HALF of "he agreed to three and one arrived". The first fix made
// the agreed set durable; these are the cases proving it is also PRODUCED.

test('a clarifying turn that names files but returns none keeps the standing set', () => {
  // Atlas said "just to confirm — the Q1 report, the Q2 report and the last
  // call?" and returned selected: []. Nobody emptied anything; the payload was
  // simply not filled in. Three stay three.
  assert.deepEqual(ids(['q1', 'q2', 'call'], []), ['q1', 'q2', 'call'])
})

test('a clarifying turn that returns its own set is taken as given, not merged', () => {
  // "actually, just the Q1 one" — unioning here would silently put back the two
  // files the analyst just asked to drop.
  assert.deepEqual(ids(['q1', 'q2', 'call'], ['q1']), ['q1'])
})

test('an explicit removal empties out of the standing set too', () => {
  assert.deepEqual(ids(['q1', 'q2'], [], ['q2']), ['q1'])
})

// ⚠ THIS TEST REPLACES ITS OWN OPPOSITE. It used to read "at ready, a proposal
// the model did not re-type still arrives in full" and pinned a UNION —
// ids(['q1','q2','call'], ['q1']) === all three. The cold
// review (2026-08-08) found what that meant in the browser: the analyst says
// "כן, רק את הראשון" ("yes, only the first"), the model reports the narrowing by
// OMISSION, and all three are attached, FETCHED FROM MAYA and written into the
// shared corpus. Atlas doing more than was agreed to.
//
// The union was defending "he only pulled 1 file while i asked for two" — but a
// bare "כן" never reaches here (isBareAgreement pulls the proposal without a
// model), so what arrives at `ready` carried extra words, and extra words are
// where a narrowing lives. Pulling too few is one sentence to correct; pulling
// too many spends downloads and writes rows every member of the platform reads.
test('at ready, a narrowing the model reports by omission is HONOURED, not reverted', () => {
  assert.deepEqual(ids(['q1', 'q2', 'call'], ['q1']), ['q1'])
})

test('at ready, a newly added file joins whatever the model returned', () => {
  assert.deepEqual(ids(['q1'], ['q1', 'q3']), ['q1', 'q3'])
})

// A TEST STOOD HERE ASSERTING THAT THE TWO STATUSES RESOLVE IDENTICALLY. It is
// deleted because the COMPILER now proves it: the `status` parameter is GONE
// (2026-08-08), so no payload's meaning can depend on it. Rewriting it for the
// new signature turned it into `assert(f(x) === f(x))` — a test of nothing — and
// keeping it would have meant keeping a dead argument for it to inspect. The
// original earned its place: it pinned the fix that ended two rules where there
// should always have been one. Once that fix became a type, the test was done.

test('an explicit removal beats the selection it appears in', () => {
  assert.deepEqual(ids(['a', 'b'], ['a', 'b'], ['b']), ['a'])
})

// `orderBySelection` maps over these ids without collapsing repeats, so one id
// twice would be one FILE twice — on the confirm list and then on the shelf.
// The union this replaced deduped as a side effect of merging; nothing else does.
test('duplicate ids collapse, and the returned order is kept', () => {
  assert.deepEqual(ids([], ['a', 'b', 'a']), ['a', 'b'])
  assert.deepEqual(ids(['b', 'b', 'a'], []), ['b', 'a'])
})

// ⚠ THE SAME BLOCKER THROUGH ITS OTHER DOOR, found while proving the first fix
// in the browser (2026-08-08). Proposal of three, analyst says "כן, רק את
// הראשון", model narrows IN PROSE ("so just the 2021 report?") and returns
// `selected: []`. The empty-selection fallback then restored all three —
// observed live as `resolvedCount: 3` under a reply naming exactly one file —
// the client stored them as the standing proposal, and the next bare "כן" is
// pulled VERBATIM by isBareAgreement without a model. Three unwanted filings.
test('after a narrowing, an empty selection does NOT restore the set that was cut down', () => {
  assert.deepEqual(ids(['q1', 'q2', 'call'], [], [], true), [])
  // …and it is NOT reported as a conflict. Nothing contradicted anything here —
  // the model simply returned no ids — so the route must say "nothing ended up
  // selected", never "your words and my ids disagreed".
  assert.equal(resolveSelection(['q1', 'q2', 'call'], [], [], true).conflict, false)
})

test('a narrowing does not touch a selection the model DID return', () => {
  assert.deepEqual(ids(['q1', 'q2', 'call'], ['q1'], [], true), ['q1'])
})

// And the third door, seen live: the model's PROSE narrowed correctly ("so just
// the 2021 report?") while its ids came back as all three. The ids are the half
// that moves files, so a narrowing that did not narrow is a failed turn — never
// an agreement to everything.
test('a narrowing that returns the WHOLE set again is refused, not honoured', () => {
  const three = ['q1', 'q2', 'call']
  assert.deepEqual(ids(three, three, [], true), [])
  // order and duplicates must not smuggle it past the comparison
  assert.deepEqual(ids(three, ['call', 'q1', 'q2', 'q1'], [], true), [])
})

// ⚠ THE ROUND-2 BLOCKER, AND IT WAS OPENED BY THE ROUND-1 FIX. Refusing was
// right; refusing SILENTLY was not. `resolveSelection` handed back a bare `[]`,
// the route left the status at `ready` because the model had said so, and
// `selectSources.ts` requires a `ready` reply to announce that the files are
// being pulled — so the analyst read "great, I'm pulling them in now" above no
// file, no spinner and no notice.
//
// The flag is why that is now unrepresentable rather than merely fixed: an
// emptied set arrives carrying WHY, and the route's `respond` cannot ship
// `ready` with nothing selected.
test('a refused narrowing reports the disagreement, it does not just return empty', () => {
  const three = ['q1', 'q2', 'call']
  const r = resolveSelection(three, three, [], true)
  assert.deepEqual(r.ids, [])
  assert.equal(r.conflict, true, 'the model narrowed in prose and not in ids — the analyst must be told')
})

test('an ordinary resolution never claims a conflict', () => {
  for (const args of [
    [['q1', 'q2'], ['q1']],
    [['q1', 'q2'], []],
    [[], ['q1']],
    [['q1'], ['q1'], [], true],
  ] as Parameters<typeof resolveSelection>[]) {
    assert.equal(resolveSelection(...args).conflict, false, JSON.stringify(args))
  }
})

test('narrowing a ONE-file set to that file is confirmation, and still works', () => {
  assert.deepEqual(ids(['q1'], ['q1'], [], true), ['q1'])
})

// A first message can contain "רק" with nothing on the table yet — there is
// nothing to narrow from, so the flag must not blank a fresh selection.
test('a narrowing word in a FIRST message does not blank the model selection', () => {
  assert.deepEqual(ids([], ['q1', 'q2'], [], true), ['q1', 'q2'])
})

test('without a narrowing, the empty-selection fallback still stands', () => {
  assert.deepEqual(ids(['q1', 'q2'], [], [], false), ['q1', 'q2'])
})

test('narrowsSelection sees a cut, and does not see an addition or filler', () => {
  for (const s of ['כן, רק את הראשון', 'כן אבל בלי השיחה', 'yes, only the first', 'no, not that one']) {
    assert.equal(narrowsSelection(s), true, s)
  }
  // AN ADDITION IS NOT A NARROWING — treating "but" as one would drop the agreed
  // set, which is the founder's 2026-08-04 complaint reintroduced. And English
  // "just" is filler far more often than it is a cut.
  for (const s of ['כן, אבל תוסיף גם את השיחה', 'yes but also add the Q3 call', 'ok, just go ahead', 'כן']) {
    assert.equal(narrowsSelection(s), false, s)
  }
})

test('with no standing proposal, resolveSelection is just the model selection', () => {
  assert.deepEqual(ids([], ['q1', 'q2']), ['q1', 'q2'])
  assert.deepEqual(ids([], ['q1', 'q2']), ['q1', 'q2'])
  assert.deepEqual(ids([], []), [])
})

// ── the yes that was not BARE ────────────────────────────────────────────────
// FOUNDER, 2026-08-07: "adding a document doesn't actually work". Reproduced end
// to end. Two calls share a title, the model asks which, the analyst answers
// "כן, תביא את שתיהן" — an agreement, but `שתיהן` ("both of them") is a quantity
// and quantities cannot join the filler vocabulary: the same word NARROWS when
// three files are on the table. So the turn went to the model, which replied
// "אז אני מביא לך את שתי השיחות…" at status `clarifying`. Nothing was pulled and
// the analyst was told the files were coming.
//
// The model's SET was right; only its status was wrong. Hence a narrower
// question with a certain answer, asked in code.

test('a yes-word plus the model re-proposing the SAME set means the analyst already agreed', () => {
  assert.equal(agreedToStandingSet('כן, תביא את שתיהן', 'clarifying', ['c1', 'c2'], ['c1', 'c2']), true)
  // order must not matter, and neither must duplicates in the proposal
  assert.equal(agreedToStandingSet('yes, both', 'clarifying', ['c1', 'c2', 'c1'], ['c2', 'c1']), true)
})

test('a change is never promoted, because the model returns a different set', () => {
  // "yes, but drop the call" — the model reflects it in `selected`
  assert.equal(agreedToStandingSet('כן, תביא את שתיהן', 'clarifying', ['c1', 'c2'], ['c1']), false)
  // a superset is a re-shape the analyst has not seen agreed either
  assert.equal(agreedToStandingSet('yes', 'clarifying', ['c1'], ['c1', 'c2']), false)
})

test('an explicit negative blocks promotion even when the sets happen to match', () => {
  for (const msg of ['לא, תביא רק את הראשונה', 'yes but not that one', 'כן אבל בלי השיחה', 'no']) {
    assert.equal(
      agreedToStandingSet(msg, 'clarifying', ['c1', 'c2'], ['c1', 'c2']),
      false,
      `"${msg}" must not be read as agreement`
    )
  }
})

// ⚠ THE COLD REVIEW'S OWN COUNTEREXAMPLES (2026-08-08). The first version of
// this function accepted ANY agree-word anywhere in an UNBOUNDED message, with
// neither of the two properties that make `isBareAgreement` safe. The exact-set
// comparison was supposed to be the backstop and is not one: selectSources tells
// the model to return the standing set at BOTH statuses, so on a question ABOUT
// the standing set the comparison matches and the files get pulled. Two guards,
// one of which was always going to pass.
test('a QUESTION containing an agreement word is not agreement', () => {
  const standing = ['c1', 'c2']
  for (const q of [
    'מה בדיוק ההבדל ביניהם?', //  בדיוק ("exactly") is in AGREE
    'the first one looks right', //  "right" is in AGREE
    'האם זה בדיוק אותו דוח?',
    'is that the correct one',
  ]) {
    assert.equal(
      agreedToStandingSet(q, 'clarifying', standing, standing),
      false,
      `"${q}" must not be read as agreement`
    )
  }
})

test('an unbounded message is refused however it ends, like its sibling', () => {
  const standing = ['c1']
  const long = 'כן ' + 'בסדר '.repeat(30)
  assert.ok(long.length > 60)
  assert.equal(agreedToStandingSet(long, 'clarifying', standing, standing), false)
})

test('a trailing question mark disqualifies outright', () => {
  const standing = ['c1']
  assert.equal(agreedToStandingSet('כן?', 'clarifying', standing, standing), false)
  assert.equal(agreedToStandingSet('ok?', 'clarifying', standing, standing), false)
  // …while the same words without it still pass
  assert.equal(agreedToStandingSet('כן', 'clarifying', standing, standing), true)
})

// ⚠ ROUND 2 REVERSED THE ROUND-1 FIX HERE, and both rounds were mine. Round 1
// copied `isBareAgreement`'s CLOSED vocabulary into this function. The second
// cold review measured what that cost and every one of these was refused — all
// of them plain agreements, all of them dropped into the founder's
// re-confirmation loop. *"yes, both of them"* failed on the word **"of"**.
//
// The copy was the error: the two functions do not stand on the same ground. A
// closed vocabulary is right where nothing downstream re-checks the answer, and
// this function runs AFTER a model returned a set that must EXACTLY equal the one
// already named in prose. So the question is not "is every word known?" but
// "does this message re-shape the ask?".
test('a plain agreement with a quantity is promoted, whatever words carry it', () => {
  const standing = ['c1', 'c2']
  for (const s of [
    'כן, תביא את שתיהן',
    'yes, both',
    'yes, both of them', //  the "of" that broke it
    'yes, all three',
    'go ahead with both',
    'כן, תביא את שתי השיחות', //  a KIND word, COUNTED — points back at the set
    'כן, את שלושת הדוחות',
  ]) {
    assert.equal(
      agreedToStandingSet(s, 'clarifying', standing, standing),
      true,
      `"${s}" is a plain agreement`
    )
  }
})

// The five things that DO re-shape the ask, each one the set comparison could
// miss: a question, an ordinal, a negation, a period, and a KIND word with
// nothing counting it.
test('a message that re-shapes the ask is refused, even when the sets match', () => {
  const standing = ['c1', 'c2']
  for (const s of [
    'כן, תביא את הדוחות', //  bare KIND — opens a category
    'yes, the 2025 ones', //  a PERIOD
    'כן, תביא את הדוח של Q1', //  a quarter
    'the first one looks right', //  an ORDINAL
    'כן אבל בלי השיחה', //  a NEGATION
  ]) {
    assert.equal(agreedToStandingSet(s, 'clarifying', standing, standing), false, `"${s}" re-shapes the ask`)
  }
})

// A KIND word beside a COUNTED reference is the difference between "the reports"
// (a new category) and "the three reports" (the set just counted for you). This
// pins the pair, because it is the one judgement in the rewrite that a future
// session is most likely to flatten back into a single list.
test('a KIND word is refused bare and allowed when something COUNTS it', () => {
  const two = ['c1', 'c2']
  assert.equal(agreedToStandingSet('כן, תביא את השיחות', 'clarifying', two, two), false)
  assert.equal(agreedToStandingSet('כן, תביא את שתי השיחות', 'clarifying', two, two), true)
  assert.equal(agreedToStandingSet('yes, the reports', 'clarifying', two, two), false)
  assert.equal(agreedToStandingSet('yes, both reports', 'clarifying', two, two), true)
})

test('a message with no yes-word at all is not agreement', () => {
  assert.equal(agreedToStandingSet('מה יש לך על תיגבור?', 'clarifying', ['c1'], ['c1']), false)
  assert.equal(agreedToStandingSet('', 'clarifying', ['c1'], ['c1']), false)
})

// ⚠ THIS TEST ALSO REPLACES ITS OWN OPPOSITE, and the version it replaces was
// mine. It asserted that a fresh request like "תביא לי את הדוחות של 2025" is
// "stopped by the SET COMPARISON, not the vocabulary" — and that when the model
// happened to return the standing set, promoting was fine "because pulling it is
// what the sentence asked for anyway".
//
// That reasoning was wrong in the way the cold review named: the set comparison
// is not an independent guard. `selectSources.ts` instructs the model to return
// the standing set at BOTH statuses, so for any message ABOUT the standing set —
// a request, a question, a musing — the comparison MATCHES. Leaning on it left
// one real guard, and the vocabulary check I had skipped was that guard.
//
// `תביא` ("bring") stays in AGREE, because "כן, תביא" is the commonest yes there
// is. What stops a fresh request is the PERIOD in it and the uncounted KIND word
// — after round 2 the mechanism changed, but this case must not.
test('a fresh request containing a yes-word is refused at any set', () => {
  const askAgain = 'תביא לי את הדוחות של 2025'
  // different files — refused
  assert.equal(agreedToStandingSet(askAgain, 'clarifying', ['c1', 'c2'], ['r1', 'r2']), false)
  // and refused EVEN WHEN the sets match exactly, which is the whole point:
  // matching sets are the normal case, not evidence of agreement
  assert.equal(agreedToStandingSet(askAgain, 'clarifying', ['r1'], ['r1']), false)
})

test('nothing is promoted when there was no standing proposal, or it is already ready', () => {
  assert.equal(agreedToStandingSet('כן', 'clarifying', [], []), false)
  assert.equal(agreedToStandingSet('כן', 'ready', ['c1'], ['c1']), false)
})

// ── a question is not an agreement, and "?" is not how you tell ───────────────
// ⚠ THE COLD REVIEW FILED THIS AGAINST `agreedToStandingSet` ONLY. Measuring it
// found the WORSE half, which nothing had looked at: every one of these was also
// a BARE agreement, and that path attaches the standing set with NO model call
// and no set comparison behind it. An analyst checking Atlas's work was
// triggering the pull by asking about it.
//
//     isBareAgreement('is that right')  === true   ← before this fix
//     isBareAgreement('you sure')       === true
//     isBareAgreement('ok is that all') === true
//
// `right` and `sure` are agreement words and everything around them was filler.

test('a question is not agreement — on EITHER path, punctuation or not', () => {
  const standing = ['c1', 'c2']
  for (const q of [
    'is that right',
    'is that correct',
    'you sure',
    'ok is that all',
    'are these all of them',
  ]) {
    assert.equal(looksLikeQuestion(q), true, `"${q}" is a question`)
    assert.equal(isBareAgreement(q), false, `"${q}" must not fire the no-model shortcut`)
    assert.equal(agreedToStandingSet(q, 'clarifying', standing, standing), false, `"${q}" must not promote`)
  }
})

test('the three marks a question leaves, and none of them is a word list', () => {
  // ① an interrogative
  for (const q of ['מה יש לך', 'איזה דוח זה', 'כמה יש', 'which one', 'how many are there']) {
    assert.equal(looksLikeQuestion(q), true, q)
  }
  // ② English subject-auxiliary INVERSION. "that is right" is a statement and
  //    "is that right" is a question; the only difference is the order, which is
  //    why this catches the interrogative-free "ok is that all".
  assert.equal(looksLikeQuestion('is that right'), true)
  assert.equal(looksLikeQuestion('yes, that is right'), false, 'un-inverted is a statement')
  // ③ the second person addresses ATLAS, and you do not address someone to agree
  //    with them — "you sure" is an elided "are you sure"
  assert.equal(looksLikeQuestion('you sure'), true)
  assert.equal(looksLikeQuestion('go ahead, thank you'), false, '"thank you" is the one ordinary exception')
})

test('an ordinary agreement is never mistaken for a question', () => {
  for (const s of [
    'כן',
    'yes',
    'ok',
    'בסדר',
    'כן, בבקשה',
    'go ahead',
    'yes thank you',
    'כן, תביא את שתיהן',
  ]) {
    assert.equal(looksLikeQuestion(s), false, s)
    assert.equal(isBareAgreement(s) || agreedToStandingSet(s, 'clarifying', ['c1'], ['c1']), true, s)
  }
})

// The bare path still owns the common case and must not have been widened.
test('the bare-agreement vocabulary was NOT loosened to fix this', () => {
  assert.equal(isBareAgreement('כן'), true)
  assert.equal(isBareAgreement('כן, תביא את שתיהן'), false, 'a quantity must still take the model path')
  assert.equal(isBareAgreement('yes, both'), false)
})
