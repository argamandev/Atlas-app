import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transcriptSync, playbackStarted } from './syncMode'

const PLAIN = { karaoke: false, follow: false }
const SYNCED = { karaoke: true, follow: true }

test('nothing loaded: the transcript is plain text, and there is nothing to follow', () => {
  assert.deepEqual(transcriptSync({ hasWordTimings: true, isActiveTrack: false, started: false }), PLAIN)
})

test('LOADED BUT NEVER STARTED IS STILL PLAIN TEXT', () => {
  // The call page loads the call into the player on mount so the bar is docked
  // and ready. If "is the player's track" were the whole rule, arriving at the
  // page would fade the entire transcript before the reader touched anything —
  // which is the bug this module exists to fix, and it read as a stalled player.
  assert.deepEqual(transcriptSync({ hasWordTimings: true, isActiveTrack: true, started: false }), PLAIN)
})

test('started: the words sync and the chip is available', () => {
  assert.deepEqual(transcriptSync({ hasWordTimings: true, isActiveTrack: true, started: true }), SYNCED)
})

test('no word timings: even a started track reads as plain text', () => {
  // A line-level transcript has no per-word clock, so a highlight would sit on
  // the first word forever. It is a read view whatever the player is doing.
  assert.deepEqual(transcriptSync({ hasWordTimings: false, isActiveTrack: true, started: true }), PLAIN)
})

test('the chip never outlives the highlight it points at', () => {
  // The founder asked for the chip "only when the user is actually playing the
  // recording". Tying both to one value is what makes that true by construction:
  // there is no input where a follow chip exists without an active word.
  for (const hasWordTimings of [true, false]) {
    for (const isActiveTrack of [true, false]) {
      for (const started of [true, false]) {
        const s = transcriptSync({ hasWordTimings, isActiveTrack, started })
        assert.equal(
          s.follow,
          s.karaoke,
          `follow diverged from karaoke at ${hasWordTimings}/${isActiveTrack}/${started}`
        )
      }
    }
  }
})

test('playing is started', () => {
  assert.equal(playbackStarted({ playing: true, positionSec: 0 }), true)
})

test('PAUSED MID-CALL IS STILL STARTED — a pause must not blink the page back to plain', () => {
  assert.equal(playbackStarted({ playing: false, positionSec: 312.5 }), true)
})

test('paused at zero is not started', () => {
  // Fresh arrival, and the one case where a scrub back to the very start while
  // paused drops out of sync mode. That is honest: nothing has been said yet.
  assert.equal(playbackStarted({ playing: false, positionSec: 0 }), false)
})
