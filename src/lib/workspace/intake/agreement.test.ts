import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBareAgreement, reconcileSelection, resolveSelection, agreedToStandingSet } from './agreement'

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

// ── the reconciliation ───────────────────────────────────────────────────────
// THE OTHER HALF OF THE SAME BUG: two files agreed, one pulled.

test('a file the model simply forgot to re-type is NOT dropped', () => {
  // The observed failure: the proposal held two, the ready payload held one.
  assert.deepEqual(reconcileSelection(['a', 'b'], ['a']), ['a', 'b'])
})

test('an addition in the same breath is kept, after the agreed ones', () => {
  assert.deepEqual(reconcileSelection(['a', 'b'], ['a', 'b', 'c']), ['a', 'b', 'c'])
})

test('a file is removed ONLY when the removal is explicit', () => {
  assert.deepEqual(reconcileSelection(['a', 'b'], ['a'], ['b']), ['a'])
  // and an explicit removal beats its presence in the selection
  assert.deepEqual(reconcileSelection(['a', 'b'], ['a', 'b'], ['b']), ['a'])
})

test('the agreed order survives, and duplicates collapse', () => {
  assert.deepEqual(reconcileSelection(['b', 'a'], ['a', 'b']), ['b', 'a'])
  assert.deepEqual(reconcileSelection(['a'], ['a', 'a']), ['a'])
})

test('with no proposal it is just the selection', () => {
  assert.deepEqual(reconcileSelection([], ['a', 'b']), ['a', 'b'])
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

test('at ready, a proposal the model did not re-type still arrives in full', () => {
  assert.deepEqual(resolveSelection('ready', ['q1', 'q2', 'call'], ['q1']), ['q1', 'q2', 'call'])
})

test('at ready, a newly added file joins the agreed ones', () => {
  assert.deepEqual(resolveSelection('ready', ['q1'], ['q1', 'q3']), ['q1', 'q3'])
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

test('a message with no yes-word at all is not agreement', () => {
  assert.equal(agreedToStandingSet('מה יש לך על תיגבור?', 'clarifying', ['c1'], ['c1']), false)
  assert.equal(agreedToStandingSet('', 'clarifying', ['c1'], ['c1']), false)
})

// `תביא` ("bring") is in the agreement vocabulary, because "כן, תביא" is the
// commonest yes there is. That makes a FRESH REQUEST like "תביא לי את הדוחות של
// 2025" pass the word check — and the set comparison is what stops it, not the
// vocabulary. Worth a test of its own, since the guard is the whole safety
// argument for accepting a non-bare message at all.
test('a fresh request containing a yes-word is stopped by the set comparison, not the words', () => {
  const askAgain = 'תביא לי את הדוחות של 2025'
  // the model answers it with different files — no promotion
  assert.equal(agreedToStandingSet(askAgain, 'clarifying', ['c1', 'c2'], ['r1', 'r2']), false)
  // and if the model comes back with EXACTLY what was already on the table,
  // pulling it is what the sentence asked for anyway
  assert.equal(agreedToStandingSet(askAgain, 'clarifying', ['r1'], ['r1']), true)
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
