import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dragToPageRect, scaleRect, snipRenderScale, appendSnip, SNIP_MAX, SNIP_MIN_DRAG_PX } from './snip'

const page = { left: 100, top: 200, width: 600, height: 800 }

test('dragToPageRect: basic drag → rect relative to page, any corner order', () => {
  const r = dragToPageRect({ x: 150, y: 250 }, { x: 350, y: 400 }, page)
  assert.deepEqual(r, { x: 50, y: 50, width: 200, height: 150 })
  // reversed corners give the same rect
  const r2 = dragToPageRect({ x: 350, y: 400 }, { x: 150, y: 250 }, page)
  assert.deepEqual(r2, r)
})

test('dragToPageRect: clamps to page bounds (drag escaping the page)', () => {
  const r = dragToPageRect({ x: 50, y: 150 }, { x: 800, y: 1100 }, page)
  assert.deepEqual(r, { x: 0, y: 0, width: 600, height: 800 })
})

test('dragToPageRect: sub-threshold drag is null (accidental click)', () => {
  const tiny = SNIP_MIN_DRAG_PX - 1
  assert.equal(dragToPageRect({ x: 150, y: 250 }, { x: 150 + tiny, y: 400 }, page), null)
  assert.equal(dragToPageRect({ x: 150, y: 250 }, { x: 400, y: 250 + tiny }, page), null)
})

test('scaleRect scales every field', () => {
  assert.deepEqual(scaleRect({ x: 10, y: 20, width: 30, height: 40 }, 2), {
    x: 20,
    y: 40,
    width: 60,
    height: 80,
  })
})

test('snipRenderScale: small crop gets the full 2x, huge crop is capped to maxSide', () => {
  assert.equal(snipRenderScale({ x: 0, y: 0, width: 300, height: 100 }), 2)
  // 1600/800 = 2 exactly at the boundary
  assert.equal(snipRenderScale({ x: 0, y: 0, width: 800, height: 100 }), 2)
  // long side 3200 → scale 0.5 so output stays ≤1600
  assert.equal(snipRenderScale({ x: 0, y: 0, width: 3200, height: 100 }), 0.5)
})

test('appendSnip: appends below cap, drops at cap', () => {
  const below = appendSnip([1, 2, 3], 4)
  assert.deepEqual(below, { list: [1, 2, 3, 4], dropped: false })
  const at = appendSnip([1, 2, 3, 4], 5)
  assert.deepEqual(at, { list: [1, 2, 3, 4], dropped: true })
  assert.equal(SNIP_MAX, 4)
})
