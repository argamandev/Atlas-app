import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { activeWordIndex, activeSegmentIndex, flattenWords, type WordTimedTranscript } from './syncEngine'
import { loadRecallTranscript } from './recallAdapter'

const words = [{ start: 1 }, { start: 2.5 }, { start: 4 }, { start: 7 }]

test('activeWordIndex: before first word → -1', () => {
  assert.equal(activeWordIndex(words, 0), -1)
})
test('activeWordIndex: exactly at a word start → that word', () => {
  assert.equal(activeWordIndex(words, 2.5), 1)
})
test('activeWordIndex: between words → previous word', () => {
  assert.equal(activeWordIndex(words, 3), 1)
})
test('activeWordIndex: after last word → last word', () => {
  assert.equal(activeWordIndex(words, 100), 3)
})
test('activeWordIndex: empty → -1', () => {
  assert.equal(activeWordIndex([], 5), -1)
})

const fakeTranscript: WordTimedTranscript = {
  hasWordTimings: true,
  durationSec: 10,
  segments: [
    { id: 's0', speakerId: 'a', speakerName: 'A', words: [{ text: 'hi', start: 0, end: 1 }], start: 0, end: 1 },
    { id: 's1', speakerId: 'b', speakerName: 'B', words: [{ text: 'there', start: 5, end: 6 }], start: 5, end: 6 },
  ],
}
test('activeSegmentIndex: picks the last started segment', () => {
  assert.equal(activeSegmentIndex(fakeTranscript, 0), 0)
  assert.equal(activeSegmentIndex(fakeTranscript, 4.9), 0)
  assert.equal(activeSegmentIndex(fakeTranscript, 5), 1)
})

test('recall adapter: parses the real spike fixture with word timings', async () => {
  const fixture = path.join(process.cwd(), 'scripts', 'fixtures', 'recall-spike.transcript.json')
  const t = await loadRecallTranscript(fixture)
  assert.ok(t.segments.length > 0, 'has segments')
  assert.ok(t.hasWordTimings, 'has word timings')
  const flat = flattenWords(t)
  assert.ok(flat.length > 20, 'has a meaningful number of words')
  // every word is start-sorted globally enough for binary search within the transcript
  assert.ok(t.durationSec > 0, 'has a positive duration')
  // eslint-disable-next-line no-console
  console.log(`[recall fixture] segments=${t.segments.length} words=${flat.length} duration=${t.durationSec.toFixed(1)}s speakers=${[...new Set(t.segments.map((s) => s.speakerName))].join(', ')}`)
})
