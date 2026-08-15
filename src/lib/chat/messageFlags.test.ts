import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeCallTruncated, sanitizeTruncated, settledFacts, truncatedForPersist } from './messageState'

/**
 * The two halves of the round-three BLOCKER fix.
 *
 * The defect: a stream that broke partway left a message with REAL BUT PARTIAL
 * content and `errorKind: 'truncated'`. `errorKind` is view state, so the next
 * successful send persisted that partial text as an ordinary complete answer —
 * one reload and half an answer read as Atlas's whole reply, rendered through
 * Markdown mid-sentence.
 *
 * These functions were inline expressions in `ChatView` until a reviewer pointed
 * out that the identical class one field away (`sanitizeContextStatus`) had a
 * dedicated test file with 13 junk values while the BLOCKER fix had none — so a
 * later refactor to `!!m.truncated` would have failed nothing and quietly
 * restored the bug.
 */

test('a message that just broke is stored as truncated', () => {
  assert.equal(truncatedForPersist({ errorKind: 'truncated' }), true)
})

test('a message reopened from storage keeps the flag on the NEXT save', () => {
  // The round-trip case. Without this half, re-saving a thread that already
  // contains a truncated answer would silently clear the flag, so the defect
  // returns one exchange later instead of immediately.
  assert.equal(truncatedForPersist({ truncated: true }), true)
})

test('the other failure kinds are not truncation', () => {
  assert.equal(truncatedForPersist({ errorKind: 'save' }), false)
  assert.equal(truncatedForPersist({ errorKind: 'answer' }), false)
})

test('an ordinary complete answer is never marked truncated', () => {
  // The MIRROR failure: a false "this was cut off" on a good answer is its own
  // untrue-UI defect, not a safe default.
  assert.equal(truncatedForPersist({}), false)
  assert.equal(truncatedForPersist({ truncated: false }), false)
  assert.equal(truncatedForPersist({ truncated: null }), false)
})

test('only a literal true survives the read', () => {
  assert.equal(sanitizeTruncated(true), true)
})

test('a message written before the field existed is not truncated', () => {
  assert.equal(sanitizeTruncated(undefined), false)
  assert.equal(sanitizeTruncated(null), false)
})

test('nothing truthy-but-wrong reaches the render', () => {
  // The jsonb is stored verbatim by PATCH /api/conversations/[id] — proven by
  // round trip against the real route — so the blob can hold anything.
  for (const junk of ['true', 'truncated', 1, -1, {}, [], [true], 'yes', 0.5]) {
    assert.equal(
      sanitizeTruncated(junk),
      false,
      `${JSON.stringify(junk)} must not render a truncation notice`
    )
  }
})

// ─── The v2 door (ticket 07) ─────────────────────────────────────────────────
// The new backend reports a partial answer as an `incomplete` EVENT on a stream
// that then finishes normally — a successful HTTP response with no `errorKind`.
// Every signal the two original fields read therefore says "complete", so
// without this third source the round-three BLOCKER returns through the very
// machinery built to prevent it.

test('a v2 answer that ended incomplete is stored as truncated', () => {
  assert.equal(truncatedForPersist({ incomplete: 'length_limit' }), true)
  assert.equal(truncatedForPersist({ incomplete: 'round_trip_cap' }), true)
  assert.equal(truncatedForPersist({ incomplete: 'stream_ended' }), true)
})

test('a v2 answer that ended cleanly is not truncated', () => {
  // The mirror failure again: `done` turns carry no code, and marking them
  // partial would put a false "this was cut off" on a good answer.
  assert.equal(truncatedForPersist({ incomplete: null }), false)
  assert.equal(truncatedForPersist({ incomplete: undefined }), false)
})

// ─── THE INPUT-PARTIAL FLAG (ticket 08b) ─────────────────────────────────────
//
// `callTruncated` says the CALL this answer was grounded in was read only in
// part — a fact about the INPUT, where every flag above is about the ANSWER.
//
// It shipped its first draft session-only, so one refresh turned an answer
// written from two thirds of a call into one that looked whole: the same law as
// the block above, arriving one field over. Cold review called that a BLOCKER;
// round 2 then pointed out the fix was held by prose and a single manual reload
// while its identical sibling had five cases here. Same reasoning as the comment
// at the top of this file, one ticket later.

test('only a literal true survives the read, for the call flag too', () => {
  assert.equal(sanitizeCallTruncated(true), true)
})

test('a message written before the call flag existed is not call-truncated', () => {
  // Every message stored before 08b — the overwhelming majority of the table.
  // Absent must mean "the call was whole", never "unknown, so warn": a notice
  // painted onto every historic answer is its own false claim.
  assert.equal(sanitizeCallTruncated(undefined), false)
  assert.equal(sanitizeCallTruncated(null), false)
})

test('nothing truthy-but-wrong paints a call-truncation notice', () => {
  for (const junk of ['true', 'truncated', 1, -1, {}, [], [true], 'yes', 0.5]) {
    assert.equal(
      sanitizeCallTruncated(junk),
      false,
      `${JSON.stringify(junk)} must not render a call-truncation notice`
    )
  }
})

test('the two flags stay INDEPENDENT — one must never imply the other', () => {
  // The reason they are two fields and two readers. An answer can be complete,
  // whole and saved AND have been written from part of its call; a stream can
  // break on a call that was read whole. Collapsing either into the other tells
  // the user something untrue about the half it borrowed.
  //
  // `truncatedForPersist` must not consult the call flag: a partly-read call is
  // not a partial ANSWER, and storing it as one would make a complete answer
  // render "this answer was cut off before it finished".
  assert.equal(
    truncatedForPersist({ callTruncated: true } as Parameters<typeof truncatedForPersist>[0]),
    false
  )
  assert.equal(sanitizeCallTruncated(true), true)
})

// ─── BOTH PATHS SETTLE THE SAME FACTS (ticket 08c-1, cold review) ────────────
//
// THE DEFECT. `ChatView.send` settles its assistant message in TWO places — the
// success path and the `catch` — and the catch built its own object from
// `error`/`errorKind` alone. So a turn where the server had ALREADY said
// `projectContext:'failed'`, or had reported the call as partly read, and whose
// stream THEN broke, rendered its partial answer with no notice and persisted
// none. The facts existed; the second writer did not carry them.
//
// RECURRENCE against "degradation must be VISIBLE", so ADR-0002 wants a
// mechanism stronger than the comment that used to be the only guard. The
// mechanism is that there is now ONE function both paths call, and these cases
// pin what it must carry.
//
// WHAT THESE CASES DO AND DO NOT COVER — round 2 caught this note claiming the
// wrong one, so it is spelled out. They guard `settledFacts` against NARROWING:
// delete a field and they fail. They CANNOT see the shape that actually caused
// the defect — a SECOND WRITER adding a fact to one `setLastAssistant` call and
// not the other, which leaves this function intact and every case here green.
// That door is shut by the source scan at the foot of this file, not by these.

const FACTS = {
  source: {
    company: 'תיגבור',
    quarter: 'Q3 2025',
    transcriptId: 'PyuMxe88e8g',
  },
  projectContext: 'failed' as const,
  incomplete: 'length_limit',
  callTruncated: true,
}

test('every honesty fact survives settling — none is dropped', () => {
  assert.deepEqual(settledFacts(FACTS), FACTS)
})

test('THE HOLE: the failure path carries what the success path carries', () => {
  // Both call sites are modelled as they are written: the success path spreads
  // the result into a settled message, the catch spreads it alongside its own
  // error fields. The property is that the honesty half is IDENTICAL — the error
  // fields may differ, the facts about what the user is looking at may not.
  const success = {
    content: 'half an answ',
    ...settledFacts(FACTS),
    streaming: false,
  }
  const failure = {
    streaming: false,
    ...settledFacts(FACTS),
    error: new Error('connection reset'),
    errorKind: 'truncated' as const,
  }
  for (const key of Object.keys(FACTS) as (keyof typeof FACTS)[]) {
    assert.deepEqual(
      failure[key],
      success[key],
      `the failure path dropped "${key}" — a partial answer would render with no notice that it ` +
        'was written without that context, which is the exact defect this function exists to close'
    )
  }
})

test('the fact set is not silently narrowed — a dropped field fails here', () => {
  // GUARD THE GUARD. Without this, deleting a line from `settledFacts` would
  // still pass the two cases above for every field that remained, and the case
  // names would go on claiming "every honesty fact". The count is asserted
  // against the keys the function actually returns, so narrowing it is a failure
  // rather than a quieter pass.
  assert.deepEqual(Object.keys(settledFacts(FACTS)).sort(), [
    'callTruncated',
    'incomplete',
    'projectContext',
    'source',
  ])
})

test('an absent fact stays absent — settling invents nothing', () => {
  // The ordinary clean turn. `settledFacts` must not manufacture a notice where
  // the server sent none: a fabricated warning on a good answer is the same
  // class of lie as a missing one on a bad answer, pointed the other way.
  const clean = {
    source: null,
    projectContext: null,
    incomplete: null,
    callTruncated: false,
  }
  assert.deepEqual(settledFacts(clean), clean)
})

// ─── THE SECOND-WRITER SHAPE, SCANNED (round 2, ticket 08c-1) ────────────────
//
// WHY THIS EXISTS AND WHY THE CASES ABOVE ARE NOT ENOUGH. Round 2's review
// caught the previous comment here overclaiming: it said "a new honesty fact
// added to the settled message without being added here fails the sweep below",
// and that was not true. Those cases guard `settledFacts` against NARROWING —
// delete a field and they fail. They cannot see the shape that actually caused
// the defect, which is a SECOND WRITER: someone adding `projectContext` (or the
// next fact) directly to one `setLastAssistant({...})` call and not the other.
// That edit keeps `settledFacts` intact, keeps every case above green, and
// reintroduces exactly the hole — a partial answer rendered with no notice.
//
// So the guard is a SOURCE SCAN, the tier this repo already uses for
// "is this shape looked at" questions (`apiFetchDiscipline`,
// `supabaseWriteDiscipline`, `chat2/requestScope`). The property: in ChatView,
// no `setLastAssistant` call may name an honesty field directly — they arrive
// only by spreading `settledFacts`, so there is ONE writer and no second one to
// forget.
//
// STATED LIMIT (M1), because the sentence this replaces was wrong for want of
// one: this reads ONE file for ONE call shape. A new component that settles its
// own assistant message is outside it, and a fact written through some other
// setter is too. It proves the second-writer door in `ChatView` is shut; it does
// not prove the class is closed everywhere.

const HONESTY_FIELDS = ['source', 'projectContext', 'incomplete', 'callTruncated']

test('no setLastAssistant call names an honesty field directly — one writer only', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'components', 'chat', 'ChatView.tsx'), 'utf8')
    // Comments blanked first: this file DISCUSSES these field names at length, and
    // a plain search would hit the prose explaining the rule and report the rule
    // itself as a violation. app.md files that trap by name ("a grep hits prose").
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

  // Each `setLastAssistant({ … })` argument, brace-matched rather than regexed to
  // the first `}` — the settle calls span several lines and contain nested braces.
  const calls: string[] = []
  const needle = 'setLastAssistant({'
  for (let i = src.indexOf(needle); i !== -1; i = src.indexOf(needle, i + 1)) {
    let depth = 0
    let j = i + needle.length - 1
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}' && --depth === 0) break
    }
    calls.push(src.slice(i, j + 1))
  }
  assert.ok(calls.length >= 2, `expected at least 2 settle calls, found ${calls.length} — the scan is broken`)

  const offenders: string[] = []
  for (const call of calls) {
    for (const field of HONESTY_FIELDS) {
      // `field:` as a property key. A spread of `settledFacts(...)` contains the
      // function name, not the keys, so the compliant calls hold none of these.
      if (new RegExp(`\\b${field}\\s*:`).test(call)) {
        offenders.push(`${field} written directly in: ${call.replace(/\s+/g, ' ').slice(0, 90)}…`)
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'An honesty fact is being written straight into a settle call instead of through ' +
      '`settledFacts`. That is the SECOND-WRITER shape that caused the defect: the other ' +
      'settle path will not carry it, so a turn that fails after the server reported the ' +
      'degradation renders with no notice at all. Add the field to `settledFacts` and spread it.\n' +
      offenders.join('\n')
  )
})

test('the compliant calls really do go through settledFacts — the scan is not vacuous', () => {
  // GUARD THE GUARD. If `settledFacts` were deleted from ChatView entirely, the
  // case above would pass with flying colours: no honesty field named directly,
  // because none is carried at all. The absence of a violation and the absence of
  // the mechanism look identical to a scan that only looks for offenders.
  const src = readFileSync(join(process.cwd(), 'src', 'components', 'chat', 'ChatView.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  const spreads = (src.match(/\.\.\.settledFacts\(/g) ?? []).length
  assert.ok(
    spreads >= 2,
    `only ${spreads} call site(s) spread settledFacts — both the success path and the failure ` +
      'path must, or one of them is settling a message with no honesty facts at all'
  )
})
