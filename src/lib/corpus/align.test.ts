import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alignLineTimestamps, flattenTimedWords, formatClock, normalizeWord, UNTIMED } from './align'

// ─────────────────────────────────────────────────────────────────────────────
// The standard's owed mechanism: "a new transcript has non-zero line times when
// word timings exist" — plus the honest sentinel when they don't.
// ─────────────────────────────────────────────────────────────────────────────

const fdOf = (lines: Array<[string, string]>) => ({
  sections: [
    {
      lines: lines.map(([id, text]) => ({ id, speakerId: 'sp1', timestamp: UNTIMED, text })),
    },
  ],
})

test('lines get real, non-zero times when word timings exist', () => {
  const fd = fdOf([
    ['L0001', 'שלום לכולם וברוכים הבאים'],
    ['L0002', 'ההכנסות צמחו עשרים אחוז'],
  ])
  const words = [
    ...'שלום לכולם וברוכים הבאים'.split(' ').map((w, i) => ({ word: w, start: 10 + i })),
    ...'ההכנסות צמחו עשרים אחוז'.split(' ').map((w, i) => ({ word: w, start: 130 + i })),
  ]
  const segments = [{ text: '', start: 10, words }]
  const { fd: out, timedLines, totalLines } = alignLineTimestamps(fd, segments)
  const lines = out.sections![0].lines!
  assert.equal(timedLines, 2)
  assert.equal(totalLines, 2)
  assert.equal(lines[0].timestamp, '00:00:10')
  // The exact-match refinement lands the second line on its true word, not a
  // proportional guess: ההכנסות starts at 130s → 00:02:10.
  assert.equal(lines[1].timestamp, '00:02:10')
})

test('no word timings → timestamps stay the visible UNTIMED sentinel', () => {
  const fd = fdOf([['L0001', 'שורה ללא תזמון']])
  const { fd: out, timedLines } = alignLineTimestamps(fd, null)
  assert.equal(timedLines, 0)
  assert.equal(out.sections![0].lines![0].timestamp, UNTIMED)
})

test('input fd is not mutated — the aligner returns a copy', () => {
  const fd = fdOf([['L0001', 'שלום עולם']])
  const segments = [
    {
      text: '',
      start: 42,
      words: [
        { word: 'שלום', start: 42 },
        { word: 'עולם', start: 43 },
      ],
    },
  ]
  alignLineTimestamps(fd, segments)
  assert.equal(fd.sections![0].lines![0].timestamp, UNTIMED)
})

test('timestamps are monotonic even when the text match would jump backwards', () => {
  // Two lines opening with the SAME word — the refinement window may find the
  // first occurrence for both; monotonicity must keep line 2 >= line 1.
  const fd = fdOf([
    ['L0001', 'תודה רבה לכולם'],
    ['L0002', 'תודה גם למשקיעים'],
  ])
  const words = [
    { word: 'תודה', start: 5 },
    { word: 'רבה', start: 6 },
    { word: 'לכולם', start: 7 },
    { word: 'תודה', start: 50 },
    { word: 'גם', start: 51 },
    { word: 'למשקיעים', start: 52 },
  ]
  const { fd: out } = alignLineTimestamps(fd, [{ text: '', start: 5, words }])
  const [l1, l2] = out.sections![0].lines!
  assert.equal(l1.timestamp, '00:00:05')
  assert.ok(l2.timestamp >= l1.timestamp)
})

test('segments without per-word timings fall back to the segment start (coarse, honest)', () => {
  const flat = flattenTimedWords([{ text: 'שתי מילים', start: 99 }])
  assert.deepEqual(flat, [
    { word: 'שתי', start: 99 },
    { word: 'מילים', start: 99 },
  ])
})

test('formatClock renders HH:MM:SS', () => {
  assert.equal(formatClock(0), '00:00:00')
  assert.equal(formatClock(62), '00:01:02')
  assert.equal(formatClock(3723.9), '01:02:03')
})

test('normalizeWord strips punctuation, quotes and niqqud', () => {
  assert.equal(normalizeWord('בָּרוּךְ,'), 'ברוך')
  assert.equal(normalizeWord('"שלום"'), 'שלום')
  assert.equal(normalizeWord('Q1!'), 'q1')
})
