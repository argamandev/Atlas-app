import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventKind, EVENT_KIND_META, EVENT_KINDS } from './event-meta'

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
