import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groundingForCall } from './askGrounding'
import { TRANSCRIPT_ID_RE } from '@/lib/chat2/requestScope'

// ─────────────────────────────────────────────────────────────────────────────
// FOUNDER-REPORTED, 2026-08-16: open a report and a slide deck for a quarter with
// no transcript, ask Ask Atlas anything, and every question came back
// "Atlas could not answer — this grounding cannot be honoured".
//
// The screen was offering the chat route a call it does not have. These cases
// pin the property in the founder's terms: a screen may only claim what it has.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD_PAGE_ID = 'period:3e238e6c-ff3d-4cd4-81be-e4c7e12a6a06:Q1 2026'

test('a screen with a stored transcript is grounded in that call', () => {
  assert.deepEqual(
    groundingForCall({ storedTranscriptId: 'PyuMxe88e8g', companyId: 'c-1' }),
    { kind: 'call', transcriptId: 'PyuMxe88e8g' },
    'the call still wins when there is one — this fix must not disable call grounding'
  )
})

test('a screen with NO transcript falls to the company, never to a call', () => {
  const g = groundingForCall({ storedTranscriptId: null, companyId: 'c-1' })
  assert.deepEqual(g, { kind: 'company', companyId: 'c-1' })
  assert.notEqual(g.kind, 'call')
})

test('a screen with neither says so out loud', () => {
  // `none` is a real recipe — blank chat, searching the market — not a fallback.
  assert.deepEqual(groundingForCall({ storedTranscriptId: null, companyId: null }), { kind: 'none' })
})

test('the fabricated period id is not a transcript id, and is never offered as one', () => {
  // This is the exact string `/app/company/[id]/period/[period]` builds. It has
  // two colons and a space, so it fails the chat route's shape gate before any
  // lookup happens — which is why the 400 was total rather than "the call was
  // ignored". Pinned here so the id scheme cannot drift back into a grounding.
  assert.equal(TRANSCRIPT_ID_RE.test(PERIOD_PAGE_ID), false)

  // And the screen that owns that id asks for the company instead.
  assert.deepEqual(groundingForCall({ storedTranscriptId: null, companyId: 'danel' }), {
    kind: 'company',
    companyId: 'danel',
  })
})

test('every call grounding this function produces is one the chat route can honour', () => {
  // THE CLIENT'S CLAIM AND THE SERVER'S GATE, CHECKED AGAINST EACH OTHER. The
  // defect was not a bad id; it was the two sides disagreeing about what may be
  // sent, with only the server able to tell. Any id reaching `{kind:'call'}` must
  // pass the same test the route applies.
  const ids = ['PyuMxe88e8g', 'live-finish-demo-tamis-2026-06-14', '3e238e6c-ff3d-4cd4-81be-e4c7e12a6a06']
  for (const id of ids) {
    const g = groundingForCall({ storedTranscriptId: id, companyId: 'c-1' })
    assert.equal(g.kind, 'call')
    if (g.kind === 'call') assert.ok(TRANSCRIPT_ID_RE.test(g.transcriptId), `route would refuse ${id}`)
  }
})
