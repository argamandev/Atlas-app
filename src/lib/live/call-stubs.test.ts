import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slideStubs, reportStub } from './call-stubs'

test('slide stubs: multiple slides, Hebrew titles and non-empty bodies', () => {
  const slides = slideStubs()
  assert.ok(slides.length >= 3)
  for (const s of slides) {
    assert.ok(/[֐-׿]/.test(s.title))
    assert.ok(s.body.length > 10)
  }
})

test('report stub: title, date line, at least one paragraph and a hint', () => {
  const r = reportStub()
  assert.ok(/[֐-׿]/.test(r.title))
  assert.ok(r.dateLine.length > 0)
  assert.ok(r.paragraphs.length >= 1 && r.paragraphs[0].length > 20)
  assert.ok(r.hint.length > 0)
})
