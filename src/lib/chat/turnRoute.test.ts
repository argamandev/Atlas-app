import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseChatRoute, clientCaptionPayload, legacyLiveContext } from './turnRoute'
import { LIVE_CAPTIONS_MAX_CHARS } from '@/lib/chat2/requestScope'
import { LIVE_BUDGET_CHARS } from '@/lib/chat2/liveInjection'
import { parseGrounding } from '@/lib/chat2/requestScope'
import type { Grounding } from '@/lib/chat2/requestScope'

const COMPANY: Grounding = { kind: 'company', companyId: 'a1b2c3d4-1111-2222-3333-444455556666' }
const LIVE: Grounding = { kind: 'live', captions: 'המנכ"ל: שלום' }

test('a plain grounded turn goes to v2', () => {
  for (const grounding of [COMPANY, LIVE]) {
    assert.equal(chooseChatRoute({ grounding, hasDocRef: false, hasSnips: false }), 'v2')
  }
})

test('a turn carrying a marked page or a snip goes to the route that can READ it', () => {
  // v2 has no image content blocks until 08c-3. Answering without the attachment
  // while its thumbnail sits in the user's own bubble is the defect; answering
  // WITH it, from the old route, is not.
  assert.equal(chooseChatRoute({ grounding: LIVE, hasDocRef: true, hasSnips: false }), 'legacy')
  assert.equal(chooseChatRoute({ grounding: LIVE, hasDocRef: false, hasSnips: true }), 'legacy')
  assert.equal(chooseChatRoute({ grounding: COMPANY, hasDocRef: true, hasSnips: true }), 'legacy')
})

test('NO grounding is legacy — never a silent blank v2 chat', () => {
  // The default falls this way on purpose: a surface that has not said what it is
  // grounded in must not be answered as a market-wide question.
  assert.equal(chooseChatRoute({ hasDocRef: false, hasSnips: false }), 'legacy')
  assert.equal(chooseChatRoute({ hasDocRef: true, hasSnips: true }), 'legacy')
})

test('the fallback reads the captions off the GROUNDING, so there is only one copy of them', () => {
  assert.equal(legacyLiveContext(LIVE), 'המנכ"ל: שלום')
  assert.equal(legacyLiveContext(COMPANY), undefined)
  assert.equal(legacyLiveContext(undefined), undefined)
})

test('empty captions survive the handoff as EMPTY, not as absent', () => {
  // THIS USED TO LEAK A DIFFERENT GROUNDING (cold review, 08c-2). The old route
  // read `body.liveContext || undefined`, so an empty string there became "no
  // live context" and fell through to a company lookup — the panel's caption
  // still promising the live call while the answer came from the company's
  // corpus. Both ends are fixed: that route now type-checks instead of
  // truthiness-checks, and this hands the caller `''` rather than hiding it.
  assert.equal(legacyLiveContext({ kind: 'live', captions: '' }), '')
})

// ─── THE CLIENT'S OWN BOUND (cold review, 08c-2) ─────────────────────────────

test('REGRESSION: a call long enough to exceed the request ceiling still sends', () => {
  // The defect: the live view held the entire caption stream and sent all of it,
  // so past the ceiling `parseGrounding` refused and EVERY question 400'd — on
  // exactly the long calls the server's truncation was written for. A unit test
  // that only ever fed it a short call could not see it.
  const huge = 'מילה '.repeat(120_000)
  assert.ok(huge.length > LIVE_CAPTIONS_MAX_CHARS, 'this case must actually be over the ceiling')
  const payload = clientCaptionPayload(huge, LIVE_CAPTIONS_MAX_CHARS)
  assert.ok(
    parseGrounding({ grounding: { kind: 'live', captions: payload } }) !== null,
    'the gate refused a payload the client had already bounded'
  )
})

test('the bound keeps the END, the same direction the server truncates', () => {
  const captions = 'FIRST ' + 'x'.repeat(200) + ' LAST'
  const payload = clientCaptionPayload(captions, 100)
  assert.ok(payload.endsWith('LAST'))
  assert.equal(payload.includes('FIRST'), false)
})

test('the client bound stays ABOVE the injection budget, or truncation stops being visible', () => {
  // If the client cut down to the budget, the server would never see more than it
  // can carry and would never emit `state: 'truncated'` — the notice would
  // disappear from the screen while the degradation behind it grew.
  assert.ok(LIVE_CAPTIONS_MAX_CHARS > LIVE_BUDGET_CHARS)
  const over = 'x'.repeat(LIVE_CAPTIONS_MAX_CHARS * 2)
  assert.ok(clientCaptionPayload(over, LIVE_CAPTIONS_MAX_CHARS).length > LIVE_BUDGET_CHARS)
})

test('a call under the ceiling is not touched', () => {
  assert.equal(clientCaptionPayload('שלום', LIVE_CAPTIONS_MAX_CHARS), 'שלום')
  assert.equal(clientCaptionPayload('', LIVE_CAPTIONS_MAX_CHARS), '')
})
