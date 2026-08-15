import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientCaptionPayload } from './captionPayload'
import { LIVE_CAPTIONS_MAX_CHARS, parseGrounding } from '@/lib/chat2/requestScope'
import { LIVE_BUDGET_CHARS } from '@/lib/chat2/liveInjection'

// WAS `turnRoute.test.ts`. The cases for `chooseChatRoute` and
// `legacyLiveContext` are deleted rather than moved: 08c-3 gave the loop image
// content blocks and deleted `/api/chat`, so there is no route to choose between
// and no legacy caller to read the captions back out for. Keeping tests for
// deleted behaviour is how a suite starts certifying a premise that is no longer
// true (M2).

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
