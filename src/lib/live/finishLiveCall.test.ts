import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeFeedWords, synthesizeWordEnds, buildWordSegments, feedDurationSec, pcmByteLength,
  type FeedWord,
} from './finishLiveCall'

test('normalizeFeedWords passes a monotonic stream through unchanged', () => {
  const w: FeedWord[] = [{ text: 'a', start: 1 }, { text: 'b', start: 2 }, { text: 'c', start: 5 }]
  assert.equal(normalizeFeedWords(w).length, 3)
})

test('normalizeFeedWords cuts at a session reset (big backward jump)', () => {
  const w: FeedWord[] = [{ text: 'a', start: 100 }, { text: 'b', start: 200 }, { text: 'x', start: 0.25 }]
  assert.deepEqual(normalizeFeedWords(w).map(x => x.text), ['a', 'b'])
})

test('normalizeFeedWords tolerates small non-monotonic jitter (< reset threshold)', () => {
  const w: FeedWord[] = [{ text: 'a', start: 10 }, { text: 'b', start: 9.7 }, { text: 'c', start: 11 }]
  assert.equal(normalizeFeedWords(w).length, 3)
})

test('normalizeFeedWords handles empty', () => {
  assert.deepEqual(normalizeFeedWords([]), [])
})

test('synthesizeWordEnds fills end from next start, last from tailPad', () => {
  const w: FeedWord[] = [{ text: 'a', start: 1 }, { text: 'b', start: 3 }]
  const out = synthesizeWordEnds(w, 0.5)
  assert.deepEqual(out, [{ word: 'a', start: 1, end: 3 }, { word: 'b', start: 3, end: 3.5 }])
})

test('synthesizeWordEnds respects a provided end', () => {
  const out = synthesizeWordEnds([{ text: 'a', start: 1, end: 2 }], 0.5)
  assert.equal(out[0].end, 2)
})

test('buildWordSegments makes one null-speaker segment with joined text', () => {
  const segs = buildWordSegments([{ text: 'שלום', start: 1 }, { text: 'עולם', start: 2 }], 0.5)
  assert.equal(segs.length, 1)
  assert.equal(segs[0].speaker, null)
  assert.equal(segs[0].words.length, 2)
  assert.equal(segs[0].text, 'שלום עולם')
  assert.equal(segs[0].start, 1)
})

test('buildWordSegments stable-sorts words by start (karaoke binary-search invariant)', () => {
  const segs = buildWordSegments([{ text: 'b', start: 5 }, { text: 'a', start: 1 }], 0.5)
  assert.deepEqual(segs[0].words.map((w) => w.word), ['a', 'b'])
  assert.equal(segs[0].text, 'a b')
  assert.equal(segs[0].start, 1)
})

test('feedDurationSec returns the max end (order-independent)', () => {
  assert.equal(feedDurationSec([{ text: 'a', start: 1 }, { text: 'b', start: 4 }], 0.5), 4.5)
  assert.equal(feedDurationSec([{ text: 'b', start: 4 }, { text: 'a', start: 1 }], 0.5), 4.5)
})

test('pcmByteLength is sample-aligned bytes for S16LE mono', () => {
  assert.equal(pcmByteLength(1, 16000, 2), 32000)
  assert.equal(pcmByteLength(0, 16000, 2), 0)
})
