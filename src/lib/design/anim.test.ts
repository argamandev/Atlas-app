import { test } from 'node:test'
import assert from 'node:assert/strict'
import { animCanvasAttrs, BEAM_RING_DELAYS, BEAM_RING_ANIMATION, BEAM_DOT_ANIMATION } from './anim'

test('buffer mode maps to data-anim with secs/ink/fill', () => {
  const attrs = animCanvasAttrs({ mode: 'buffer', secs: 285, ink: 'dark', fill: true })
  assert.equal(attrs['data-anim'], 'buffer')
  assert.equal(attrs['data-secs'], '285')
  assert.equal(attrs['data-ink'], 'dark')
  assert.equal(attrs['data-fill'], '')
  assert.ok(!('data-field' in attrs))
})

test('globe mode maps to data-field/data-mode and passes engine opts through', () => {
  const attrs = animCanvasAttrs({ mode: 'globe', opts: { labels: 1, count: 66, spin: 0.0018 } })
  assert.equal(attrs['data-field'], '')
  assert.equal(attrs['data-mode'], 'globe')
  assert.equal(attrs['data-labels'], '1')
  assert.equal(attrs['data-count'], '66')
  assert.equal(attrs['data-spin'], '0.0018')
  assert.ok(!('data-anim' in attrs))
  assert.ok(!('data-fill' in attrs))
})

test('beam timing constants match the design reference (live-beam.html)', () => {
  assert.deepEqual(BEAM_RING_DELAYS, ['0s', '1.8s', '3.6s'])
  assert.equal(BEAM_RING_ANIMATION, 'radar-pulse 5.4s cubic-bezier(0.2,0.6,0.4,1) infinite')
  assert.equal(BEAM_DOT_ANIMATION, 'dot-blink 2.6s ease-in-out infinite')
})
