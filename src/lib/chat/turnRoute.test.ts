import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseChatRoute, legacyLiveContext } from './turnRoute'
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
  // WORTH KNOWING, because the old route does NOT treat these alike: it reads
  // `liveContext || undefined`, so an empty string there becomes a company
  // lookup. This function does not paper over that — it hands the caller the
  // fact — and the case is only reachable on a legacy fallback (a snip attached)
  // during a call that has not spoken yet, where the snip is the real grounding.
  // Pinned so a `|| undefined` cannot creep in here and hide the distinction.
  assert.equal(legacyLiveContext({ kind: 'live', captions: '' }), '')
})
