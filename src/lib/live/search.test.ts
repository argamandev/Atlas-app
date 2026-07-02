import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findMatches } from './search'
import type { WordTimedTranscript } from './syncEngine'

const t: WordTimedTranscript = {
  durationSec: 10,
  hasWordTimings: true,
  segments: [
    {
      id: 'seg-0',
      speakerId: 's1',
      speakerName: 'A',
      role: null,
      start: 0,
      end: 5,
      words: [
        { text: 'רווח', start: 0, end: 1 },
        { text: 'גולמי', start: 1, end: 2 },
        { text: 'רווח', start: 2, end: 3 },
      ],
    },
    {
      id: 'seg-1',
      speakerId: 's2',
      speakerName: 'B',
      role: null,
      start: 5,
      end: 10,
      words: [{ text: 'הכנסות', start: 5, end: 6 }],
    },
  ],
}

test('findMatches: empty query → no matches', () => {
  assert.deepEqual(findMatches(t, ''), [])
  assert.deepEqual(findMatches(t, '   '), [])
})

test('findMatches: returns each matching global word index', () => {
  assert.deepEqual(findMatches(t, 'רווח'), [0, 2])
})

test('findMatches: case-insensitive substring', () => {
  assert.deepEqual(findMatches(t, 'הכנ'), [3])
})
