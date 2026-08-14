import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchRank, NO_TEXTUAL_MATCH } from './matchRank'

test('an exact match outranks a prefix, which outranks a mere containment', () => {
  assert.equal(matchRank('בזק', ['בזק']), 0)
  assert.equal(matchRank('בזק', ['בזק בינלאומי']), 1)
  assert.equal(matchRank('בזק', ['חברת בזק הישראלית']), 2)
})

test('the best of several names wins, whichever position it is in', () => {
  // A company is scored on ALL its names at once — display name, registered
  // name, English name, ticker and every alias that matched.
  assert.equal(matchRank('בזק', ['חברת בזק הישראלית', 'בזק', 'Bezeq']), 0)
  assert.equal(matchRank('בזק', ['Bezeq', 'חברת בזק הישראלית']), 2)
})

// THE DEFECT, pinned. A broad stem matches many aliases weakly; the company the
// user named exactly must still come first. Before this, alias hits were simply
// prepended and the exact name match could be sliced off the end entirely.
test('an exact NAME match beats a weak alias containment', () => {
  const exactByName = matchRank('בנק', ['בנק'])
  const weakByAlias = matchRank('בנק', ['בנק הפועלים בע"מ סניף מרכזי'])
  assert.ok(exactByName < weakByAlias, 'the exactly-named company must sort first')
})

test('an exact ALIAS match still beats a weak name containment', () => {
  // The mirror case — the fix must not simply invert the old bias. בז"א is an
  // alias, and typing it exactly should outrank a company that merely contains it.
  const exactByAlias = matchRank('בז"א', ['בית זיקוק אשדוד', 'בז"א'])
  const weakByName = matchRank('בז"א', ['משהו בז"א משהו אחר'])
  assert.ok(exactByAlias < weakByName)
})

test('matching is case-insensitive and ignores surrounding whitespace', () => {
  assert.equal(matchRank('bezeq', ['Bezeq']), 0)
  assert.equal(matchRank('  Bezeq  ', ['bezeq']), 0)
  assert.equal(matchRank('BEZ', ['Bezeq']), 1)
})

test('nulls and blanks in the candidate list are skipped, not counted as matches', () => {
  assert.equal(matchRank('בזק', [null, undefined, '', 'בזק']), 0)
  assert.equal(matchRank('בזק', [null, undefined]), NO_TEXTUAL_MATCH)
})

test('an empty term matches nothing rather than everything', () => {
  // `''.includes('')` is true, so a naive implementation ranks every company 0 on
  // a blank term — which would silently reorder the whole directory listing.
  assert.equal(matchRank('', ['בזק']), NO_TEXTUAL_MATCH)
  assert.equal(matchRank('   ', ['בזק']), NO_TEXTUAL_MATCH)
})

test('a row that matched in Postgres but not here sorts LAST rather than vanishing', () => {
  // `ilike` folds case by the database collation, which is not identical to JS
  // `toLowerCase`. Such a row is still a real hit and must keep its place at the
  // bottom — returning a rank rather than dropping it is what makes that true.
  assert.equal(matchRank('בזק', ['something else entirely']), NO_TEXTUAL_MATCH)
})
