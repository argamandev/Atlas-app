// src/lib/live/ivritStitcher.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stitchChunk, lastWordStart, captionOnTime } from './ivritStitcher'
import { parseIvritSegments } from './ivritParse'
import type { IvritSegment } from './syncEngine'

const seg = (text: string, words: [string, number, number][]): IvritSegment => ({
  text,
  start: words[0][1],
  end: words[words.length - 1][2],
  speaker: null,
  words: words.map(([word, start, end]) => ({ word, start, end })),
})

test('offsets chunk-relative word times to stream time', () => {
  const line = stitchChunk(
    1,
    [
      seg('שלום עולם', [
        ['שלום', 0.5, 0.9],
        ['עולם', 1.0, 1.4],
      ]),
    ],
    { startSec: 100, endSec: 130 },
    0
  )
  assert.deepEqual(
    line.words.map((w) => w.start),
    [100.5, 101.0]
  )
  assert.equal(line.raw, 'שלום עולם')
  assert.equal(line.fallbackTiming, undefined)
})

test('clamps to non-decreasing across chunk boundary and within a chunk', () => {
  // prev chunk ended with a word at 131.2 (IVRIT overshoot); this chunk starts at 130
  const line = stitchChunk(
    2,
    [
      seg('א ב ג', [
        ['א', 0.4, 0.6],
        ['ב', 0.2, 0.5],
        ['ג', 0.9, 1.1],
      ]),
    ],
    { startSec: 130, endSec: 160 },
    131.2
  )
  assert.deepEqual(
    line.words.map((w) => w.start),
    [131.2, 131.2, 131.2]
  ) // 130.4→131.2, 130.2→131.2, 130.9→131.2
})

test('caps word times at chunk end (IVRIT overshoot)', () => {
  const line = stitchChunk(3, [seg('א', [['א', 35.0, 35.4]])], { startSec: 0, endSec: 30 }, 0)
  assert.deepEqual(
    line.words.map((w) => w.start),
    [30]
  )
})

test('text without word timings falls back to even distribution, flagged', () => {
  const line = stitchChunk(
    4,
    [{ text: 'אחת שתיים שלוש ארבע', start: 0, end: 0, speaker: null, words: [] }],
    { startSec: 200, endSec: 220 },
    0
  )
  assert.equal(line.fallbackTiming, true)
  assert.equal(line.words.length, 4)
  assert.deepEqual(
    line.words.map((w) => w.start),
    [200, 205, 210, 215]
  ) // 20s / 4 words
})

test('empty segments produce an empty (gap) line', () => {
  const line = stitchChunk(5, [], { startSec: 300, endSec: 330 }, 0)
  assert.equal(line.raw, '')
  assert.deepEqual(line.words, [])
})

test('lastWordStart advances the running monotonic cursor', () => {
  const line = stitchChunk(6, [seg('א', [['א', 1, 2]])], { startSec: 10, endSec: 40 }, 0)
  assert.equal(lastWordStart(line, 0), 11)
  const gap = stitchChunk(7, [], { startSec: 40, endSec: 70 }, 11)
  assert.equal(lastWordStart(gap, 11), 11) // gap keeps the cursor
})

test('captionOnTime enforces the buffer budget with margin', () => {
  assert.equal(captionOnTime(0, 65, 300), true) // ready 65s ≤ 0+300−60
  assert.equal(captionOnTime(0, 250, 300), false) // too late
  assert.equal(captionOnTime(100, 330, 300), true) // 330 ≤ 100+300−60
})

test('REAL FIXTURE: spike response stitches to non-decreasing words covering the chunk', () => {
  const raw = JSON.parse(fs.readFileSync('scripts/fixtures/ivrit-live-spike.json', 'utf8'))
  const segments = parseIvritSegments(raw)
  assert.ok(segments.length > 0, 'fixture parses to segments')
  const line = stitchChunk(1, segments, { startSec: 60, endSec: 95 }, 0)
  assert.ok(line.words.length >= 20, `real 35s chunk should have many words, got ${line.words.length}`)
  for (let i = 1; i < line.words.length; i++)
    assert.ok(line.words[i].start >= line.words[i - 1].start, `word ${i} goes backwards`)
  assert.ok(line.words[0].start >= 60 && line.words[line.words.length - 1].start <= 95)
  // coverage: words span most of the speech chunk
  const span = line.words[line.words.length - 1].start - line.words[0].start
  assert.ok(span >= 0.6 * 35, `words span ${span}s of a 35s chunk`)
})
