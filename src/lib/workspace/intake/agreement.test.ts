import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBareAgreement, resolveSelection, agreedToStandingSet, narrowsSelection } from './agreement'

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
  assert.deepEqual(resolveSelection('clarifying', ['q1', 'q2', 'call'], []), ['q1', 'q2', 'call'])
})

test('a clarifying turn that returns its own set is taken as given, not merged', () => {
  // "actually, just the Q1 one" — unioning here would silently put back the two
  // files the analyst just asked to drop.
  assert.deepEqual(resolveSelection('clarifying', ['q1', 'q2', 'call'], ['q1']), ['q1'])
})

test('an explicit removal empties out of the standing set too', () => {
  assert.deepEqual(resolveSelection('clarifying', ['q1', 'q2'], [], ['q2']), ['q1'])
})

// ⚠ THIS TEST REPLACES ITS OWN OPPOSITE. It used to read "at ready, a proposal
// the model did not re-type still arrives in full" and pinned a UNION —
// resolveSelection('ready', ['q1','q2','call'], ['q1']) === all three. The cold
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
  assert.deepEqual(resolveSelection('ready', ['q1', 'q2', 'call'], ['q1']), ['q1'])
})

test('at ready, a newly added file joins whatever the model returned', () => {
  assert.deepEqual(resolveSelection('ready', ['q1'], ['q1', 'q3']), ['q1', 'q3'])
})

// The status argument no longer changes anything, and that is the fix: one rule
// instead of two identical payloads meaning opposite things.
test('the two statuses resolve identically, given the same payload', () => {
  for (const args of [
    [['q1', 'q2', 'call'], ['q1'], []],
    [['q1', 'q2'], [], ['q2']],
    [['q1'], ['q1', 'q3'], []],
    [[], ['q1', 'q2'], []],
    [['q1', 'q2'], [], []],
  ] as [string[], string[], string[]][]) {
    assert.deepEqual(
      resolveSelection('ready', ...args),
      resolveSelection('clarifying', ...args),
      `statuses diverged for ${JSON.stringify(args)}`
    )
  }
})

test('an explicit removal beats the selection it appears in, at both statuses', () => {
  assert.deepEqual(resolveSelection('ready', ['a', 'b'], ['a', 'b'], ['b']), ['a'])
  assert.deepEqual(resolveSelection('clarifying', ['a', 'b'], ['a', 'b'], ['b']), ['a'])
})

// `orderBySelection` maps over these ids without collapsing repeats, so one id
// twice would be one FILE twice — on the confirm list and then on the shelf.
// The union this replaced deduped as a side effect of merging; nothing else does.
test('duplicate ids collapse, and the returned order is kept', () => {
  assert.deepEqual(resolveSelection('ready', [], ['a', 'b', 'a']), ['a', 'b'])
  assert.deepEqual(resolveSelection('clarifying', ['b', 'b', 'a'], []), ['b', 'a'])
})

// ⚠ THE SAME BLOCKER THROUGH ITS OTHER DOOR, found while proving the first fix
// in the browser (2026-08-08). Proposal of three, analyst says "כן, רק את
// הראשון", model narrows IN PROSE ("so just the 2021 report?") and returns
// `selected: []`. The empty-selection fallback then restored all three —
// observed live as `resolvedCount: 3` under a reply naming exactly one file —
// the client stored them as the standing proposal, and the next bare "כן" is
// pulled VERBATIM by isBareAgreement without a model. Three unwanted filings.
test('after a narrowing, an empty selection does NOT restore the set that was cut down', () => {
  assert.deepEqual(resolveSelection('clarifying', ['q1', 'q2', 'call'], [], [], true), [])
  assert.deepEqual(resolveSelection('ready', ['q1', 'q2', 'call'], [], [], true), [])
})

test('a narrowing does not touch a selection the model DID return', () => {
  assert.deepEqual(resolveSelection('clarifying', ['q1', 'q2', 'call'], ['q1'], [], true), ['q1'])
})

// And the third door, seen live: the model's PROSE narrowed correctly ("so just
// the 2021 report?") while its ids came back as all three. The ids are the half
// that moves files, so a narrowing that did not narrow is a failed turn — never
// an agreement to everything.
test('a narrowing that returns the WHOLE set again is refused, not honoured', () => {
  const three = ['q1', 'q2', 'call']
  assert.deepEqual(resolveSelection('clarifying', three, three, [], true), [])
  // order and duplicates must not smuggle it past the comparison
  assert.deepEqual(resolveSelection('ready', three, ['call', 'q1', 'q2', 'q1'], [], true), [])
})

test('narrowing a ONE-file set to that file is confirmation, and still works', () => {
  assert.deepEqual(resolveSelection('clarifying', ['q1'], ['q1'], [], true), ['q1'])
})

// A first message can contain "רק" with nothing on the table yet — there is
// nothing to narrow from, so the flag must not blank a fresh selection.
test('a narrowing word in a FIRST message does not blank the model selection', () => {
  assert.deepEqual(resolveSelection('clarifying', [], ['q1', 'q2'], [], true), ['q1', 'q2'])
})

test('without a narrowing, the empty-selection fallback still stands', () => {
  assert.deepEqual(resolveSelection('clarifying', ['q1', 'q2'], [], [], false), ['q1', 'q2'])
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
  assert.deepEqual(resolveSelection('clarifying', [], ['q1', 'q2']), ['q1', 'q2'])
  assert.deepEqual(resolveSelection('ready', [], ['q1', 'q2']), ['q1', 'q2'])
  assert.deepEqual(resolveSelection('clarifying', [], []), [])
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

// The vocabulary is CLOSED, one step wider than the bare check: agreement,
// filler, or a QUANTITY word. Anything else means this is not a plain yes.
test('the vocabulary is closed — one unknown word is enough to refuse', () => {
  const standing = ['c1', 'c2']
  assert.equal(agreedToStandingSet('כן, תביא את שתיהן', 'clarifying', standing, standing), true)
  assert.equal(agreedToStandingSet('yes, both', 'clarifying', standing, standing), true)
  // "הדוחות" is a KIND of file, deliberately not filler — it re-shapes the ask
  assert.equal(agreedToStandingSet('כן, תביא את הדוחות', 'clarifying', standing, standing), false)
  assert.equal(agreedToStandingSet('כן, של תיגבור', 'clarifying', standing, standing), false)
  assert.equal(agreedToStandingSet('yes, the 2025 ones', 'clarifying', standing, standing), false)
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
// is. What stops a fresh request is that the REST of it is unknown words.
test('a fresh request containing a yes-word is refused by the VOCABULARY, at any set', () => {
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

// The bare path still owns the common case and must not have been widened.
test('the bare-agreement vocabulary was NOT loosened to fix this', () => {
  assert.equal(isBareAgreement('כן'), true)
  assert.equal(isBareAgreement('כן, תביא את שתיהן'), false, 'a quantity must still take the model path')
  assert.equal(isBareAgreement('yes, both'), false)
})
