import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideTerminal, CLEAN_STOPS, type TerminalFacts } from './terminal'

// ─────────────────────────────────────────────────────────────────────────────
// The decision is a pure function of six facts, so it can be ENUMERATED rather
// than trusted. That is the point: round 1 and round 2 between them found five
// separate holes in the inline `if` chain this replaced, every one of them a case
// nobody had thought to write down. An exhaustive sweep cannot be surprised the
// same way — a new branch either satisfies the invariant for every combination or
// it does not. (The case count is ASSERTED below rather than written here, because
// a number in a comment is the hand-carried count app.md files as a repeat defect.)
// ─────────────────────────────────────────────────────────────────────────────

const STOPS = ['end_turn', 'stop_sequence', 'max_tokens', 'refusal', 'pause_turn', 'weird', null]
const BOOLS = [true, false]

function* everyCombination(): Generator<TerminalFacts> {
  for (const stopReason of STOPS)
    for (const anyTextEmitted of BOOLS)
      for (const anySourceSurvived of BOOLS)
        for (const anyToolRan of BOOLS)
          for (const roundTripCapHit of BOOLS)
            for (const unverifiedQuotes of [0, 2])
              yield {
                stopReason,
                anyTextEmitted,
                unverifiedQuotes,
                anySourceSurvived,
                anyToolRan,
                roundTripCapHit,
              }
}

/** The whole law in one predicate: what must be true for a turn to be COMPLETE. */
const isGenuinelyClean = (f: TerminalFacts) =>
  !f.roundTripCapHit &&
  !(f.anyToolRan && !f.anySourceSurvived) &&
  f.unverifiedQuotes === 0 &&
  CLEAN_STOPS.has(f.stopReason ?? '') &&
  f.anyTextEmitted

test('EXHAUSTIVE: `done` is returned if and only if the turn is genuinely clean', () => {
  let seen = 0
  let done = 0
  for (const facts of everyCombination()) {
    seen++
    const verdict = decideTerminal(facts)
    if (verdict.type === 'done') done++
    assert.equal(
      verdict.type === 'done',
      isGenuinelyClean(facts),
      `wrong verdict for ${JSON.stringify(facts)} — got ${verdict.type}`
    )
  }
  // Guard the guard: if the generator ever silently stopped producing cases, the
  // assertion above would pass vacuously and prove nothing (M1).
  assert.equal(seen, STOPS.length * 2 * 2 * 2 * 2 * 2)
  assert.ok(done > 0, 'no combination produced `done` — the sweep proves nothing')
  assert.ok(done < seen, 'every combination produced `done` — the sweep proves nothing')
})

test('EXHAUSTIVE: an `incomplete` always carries a non-empty, human-readable reason', () => {
  for (const facts of everyCombination()) {
    const verdict = decideTerminal(facts)
    if (verdict.type === 'incomplete') {
      assert.ok(verdict.reason.length > 10, `thin reason for ${JSON.stringify(facts)}`)
      assert.doesNotMatch(verdict.reason, /undefined|null|\[object/)
    }
  }
})

const clean: TerminalFacts = {
  stopReason: 'end_turn',
  anyTextEmitted: true,
  unverifiedQuotes: 0,
  anySourceSurvived: true,
  anyToolRan: true,
  roundTripCapHit: false,
}

test('the baseline case really is done — the control for every negative below', () => {
  assert.deepEqual(decideTerminal(clean), { type: 'done' })
})

test('a clean stop with NO text is incomplete, not success-with-nothing', () => {
  // Round 2 measured the old chain returning `[{type:'done'}]` with zero deltas.
  const v = decideTerminal({ ...clean, anyTextEmitted: false })
  assert.equal(v.type, 'incomplete')
  assert.match((v as { reason: string }).reason, /no answer text/)
})

test('tools ran and ALL failed is incomplete — the case that also disabled quote checking', () => {
  // The subtle one: an empty source pool silently switched verification off, so this
  // is exactly when an invented quote was least likely to be caught, and the old
  // chain reported it as `done`.
  const v = decideTerminal({ ...clean, anyToolRan: true, anySourceSurvived: false })
  assert.equal(v.type, 'incomplete')
  assert.match((v as { reason: string }).reason, /every source lookup failed/)
})

test('NO tool ran is NOT the same case — an ungrounded answer still completes', () => {
  // Distinguishing these two is the whole reason `anyToolRan` is a separate fact
  // rather than being inferred from an empty pool.
  assert.deepEqual(decideTerminal({ ...clean, anyToolRan: false, anySourceSurvived: false }), {
    type: 'done',
  })
})

test('the round-trip cap outranks every other reason', () => {
  // Several can be true at once; the user must be told the worst true thing, not
  // whichever an if-chain reached first.
  const v = decideTerminal({
    ...clean,
    roundTripCapHit: true,
    unverifiedQuotes: 5,
    stopReason: 'max_tokens',
  })
  assert.match((v as { reason: string }).reason, /round-trip limit/)
})

test('each non-clean stop reason names itself rather than sharing one vague message', () => {
  for (const [stop, expected] of [
    ['max_tokens', /length limit/],
    ['refusal', /declined/],
    ['pause_turn', /paused/],
    [null, /no reason given/],
    ['some_future_value', /stopped unexpectedly/],
  ] as const) {
    const v = decideTerminal({ ...clean, stopReason: stop })
    assert.equal(v.type, 'incomplete')
    assert.match((v as { reason: string }).reason, expected)
  }
})

test('stop_sequence counts as a clean finish alongside end_turn', () => {
  assert.deepEqual(decideTerminal({ ...clean, stopReason: 'stop_sequence' }), { type: 'done' })
})

test('EXHAUSTIVE: every incomplete carries a known CODE — the locale-safe contract', () => {
  // `reason` is English developer prose. The surface renders from `code`, so a
  // Hebrew screen never has to string-match English to show a degradation — the
  // degradation law wants it visible in BOTH locales, and ticket 07 is Hebrew-first.
  const known = new Set([
    'round_trip_cap',
    'all_sources_failed',
    'unverified_quote',
    'stopped_early',
    'no_answer_text',
  ])
  const used = new Set<string>()
  for (const facts of everyCombination()) {
    const verdict = decideTerminal(facts)
    if (verdict.type === 'incomplete') {
      assert.ok(known.has(verdict.code), `unknown code ${verdict.code}`)
      used.add(verdict.code)
    }
  }
  // Every declared code must be REACHABLE, or ticket 07 carries a branch for a
  // state that cannot happen while some real state goes unhandled.
  assert.deepEqual([...used].sort(), [...known].sort())
})
