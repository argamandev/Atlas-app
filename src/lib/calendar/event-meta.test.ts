import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventKind, kindLabel, EVENT_KIND_META, EVENT_KINDS } from './event-meta'

test('eventKind defaults to call for plain scheduled calls (no kind hint)', () => {
  assert.equal(eventKind({}), 'call')
  assert.equal(eventKind({ kind: null }), 'call')
  assert.equal(eventKind({ kind: 'nonsense' }), 'call')
})

test('eventKind honors explicit report/webinar hints', () => {
  assert.equal(eventKind({ kind: 'report' }), 'report')
  assert.equal(eventKind({ kind: 'webinar' }), 'webinar')
})

test('every kind carries the design accent + a dictionary label key', () => {
  // accents probed from the rendered design (calendar type chips/pill icons)
  assert.equal(EVENT_KIND_META.call.accent, '#3A3833')
  assert.equal(EVENT_KIND_META.report.accent, '#6E7B63')
  assert.equal(EVENT_KIND_META.webinar.accent, '#67788A')
  for (const k of EVENT_KINDS) {
    assert.ok(EVENT_KIND_META[k].labelKey.length > 0)
  }
})

// ── the shared singular label ────────────────────────────────────────────────
// This exists because Home hardcoded "investor call" for every upcoming row, so
// 99 report-publication dates each announced a call nobody had scheduled. Three
// surfaces render this string; the point of the function is that they cannot
// disagree, so the test names each kind rather than looping.

const D = { ctxKindCall: 'Investor call', ctxKindReport: 'Report', ctxKindWebinar: 'Webinar' }

test('a report is never labelled an investor call', () => {
  assert.equal(kindLabel('report', D), 'Report')
  assert.notEqual(kindLabel('report', D), D.ctxKindCall)
})

test('each kind gets its own name', () => {
  assert.equal(kindLabel('call', D), 'Investor call')
  assert.equal(kindLabel('webinar', D), 'Webinar')
})

test('every kind in the vocabulary has a label — no kind falls through to a default', () => {
  const seen = new Set(EVENT_KINDS.map((k) => kindLabel(k, D)))
  assert.equal(seen.size, EVENT_KINDS.length)
})
