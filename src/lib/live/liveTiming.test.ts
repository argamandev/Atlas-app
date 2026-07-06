import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  interpolatedEdge,
  viewerEnded,
  delayedLiveEdge,
  bufferGate,
  hostedLiveOver,
  companyLiveDisplay,
  liveSessionChanged,
  LIVE_BUFFER_SEC,
} from './liveTiming'

test('interpolatedEdge advances by wall-clock while live', () => {
  assert.equal(interpolatedEdge(100, 1000, 1000, false), 100)
  assert.equal(interpolatedEdge(100, 1000, 2500, false), 101.5) // +1.5s elapsed
})

test('interpolatedEdge is frozen once the call ended', () => {
  assert.equal(interpolatedEdge(100, 1000, 9999, true), 100)
})

test('interpolatedEdge never advances on a stale/future anchor', () => {
  assert.equal(interpolatedEdge(100, 2000, 1000, false), 100) // now < anchor → +0
})

test('viewerEnded is true only once the playhead caught up to the edge', () => {
  assert.equal(viewerEnded(false, 100, 100), false) // backend still live
  assert.equal(viewerEnded(true, 80, 100), false) // ended, but 20s of buffer left
  assert.equal(viewerEnded(true, 99.5, 100), true) // within epsilon → done
  assert.equal(viewerEnded(true, 0, 0), false) // ended with no audio captured → not "ended"
})

test('delayedLiveEdge tracks liveEdge − buffer while the source is live', () => {
  assert.equal(delayedLiveEdge(400, 300, null, 999), 100)
  assert.equal(delayedLiveEdge(50, 300, null, 999), 0) // clamped at 0
})

test('delayedLiveEdge keeps draining at 1x after the source ends, capped at the true end', () => {
  const endWall = 1000 // source ended; edge frozen at 463 (7:43), buffer 300 → freeze point 163
  assert.equal(delayedLiveEdge(463, 300, endWall, 1000), 163) // at end: 463 − 300
  assert.equal(delayedLiveEdge(463, 300, endWall, 1000 + 100_000), 263) // +100s → 263 (no jump)
  assert.equal(delayedLiveEdge(463, 300, endWall, 1000 + 300_000), 463) // +300s → reaches the true end
  assert.equal(delayedLiveEdge(463, 300, endWall, 1000 + 999_000), 463) // never exceeds the true end
  assert.equal(delayedLiveEdge(463, 300, endWall, 1000 + 1e12), 463) // huge overshoot still capped
})

test('bufferGate counts down until the buffer fills, then ready', () => {
  assert.deepEqual(bufferGate(0, 60, 300, false), { phase: 'buffering', countdown: 240 })
  assert.deepEqual(bufferGate(0, 300, 300, false), { phase: 'ready', countdown: 0 })
  assert.deepEqual(bufferGate(null, 0, 300, false), { phase: 'waiting', countdown: 300 })
})

test('bufferGate is ready immediately once the call ended (no more waiting)', () => {
  assert.deepEqual(bufferGate(0, 60, 300, true), { phase: 'ready', countdown: 0 })
})

test('LIVE_BUFFER_SEC is the 5-minute policy', () => {
  assert.equal(LIVE_BUFFER_SEC, 300)
})

test('hostedLiveOver: false while live, false mid-drain, true once the buffer reached the true end', () => {
  assert.equal(hostedLiveOver(false, 100, 463), false) // source still live
  assert.equal(hostedLiveOver(true, 200, 463), false) // ended, buffer still draining
  assert.equal(hostedLiveOver(true, 462.5, 463), true) // drained to within epsilon → over
  assert.equal(hostedLiveOver(true, 463, 463), true)
  assert.equal(hostedLiveOver(true, 0, 0), false) // ended with no audio → not over
})

test('companyLiveDisplay: live banner while airing/draining; in-flight latest from end until polished', () => {
  const buffer = 180
  const endedAt = 1_000_000

  // no call has started → neither the banner nor an in-flight latest
  assert.deepEqual(
    companyLiveDisplay(
      { audioStartRel: null, liveEdgeRel: null, liveEnded: false, endedAt: null },
      'none',
      0,
      buffer
    ),
    { liveBanner: false, endedInFlight: false }
  )

  // airing live (not ended) → banner on, no in-flight latest yet
  assert.deepEqual(
    companyLiveDisplay(
      { audioStartRel: 0, liveEdgeRel: 200, liveEnded: false, endedAt: null },
      'none',
      0,
      buffer
    ),
    { liveBanner: true, endedInFlight: false }
  )

  // ended, mid-drain, polishing → banner still on (buffer not drained) AND surfaced as in-flight latest
  assert.deepEqual(
    companyLiveDisplay(
      { audioStartRel: 0, liveEdgeRel: 600, liveEnded: true, endedAt },
      'processing',
      endedAt + 60_000,
      buffer
    ),
    { liveBanner: true, endedInFlight: true }
  )

  // drain finished but polished transcript not ready → banner gone, still in-flight latest (the tail)
  assert.deepEqual(
    companyLiveDisplay(
      { audioStartRel: 0, liveEdgeRel: 600, liveEnded: true, endedAt },
      'processing',
      endedAt + 180_000,
      buffer
    ),
    { liveBanner: false, endedInFlight: true }
  )

  // polished transcript completed → no in-flight latest (show the canonical finished row instead)
  assert.deepEqual(
    companyLiveDisplay(
      { audioStartRel: 0, liveEdgeRel: 600, liveEnded: true, endedAt },
      'completed',
      endedAt + 180_000,
      buffer
    ),
    { liveBanner: false, endedInFlight: false }
  )
})

test('live → drains for bufferSec after end → over (compose delayedLiveEdge + hostedLiveOver)', () => {
  const buffer = 180
  const liveEdge = 600 // frozen at end
  const endedAt = 1_000_000

  // while live (endedAt null): edge held bufferSec behind, not over
  const liveNow = delayedLiveEdge(liveEdge, buffer, null, endedAt)
  assert.equal(liveNow, liveEdge - buffer)
  assert.equal(hostedLiveOver(true, liveNow, liveEdge), false)

  // 1 min into the drain: edge advanced ~60s, still not over
  const mid = delayedLiveEdge(liveEdge, buffer, endedAt, endedAt + 60_000)
  assert.equal(Math.round(mid), liveEdge - buffer + 60)
  assert.equal(hostedLiveOver(true, mid, liveEdge), false)

  // bufferSec after end: edge reached the true end → over
  const end = delayedLiveEdge(liveEdge, buffer, endedAt, endedAt + buffer * 1000)
  assert.equal(end, liveEdge)
  assert.equal(hostedLiveOver(true, end, liveEdge), true)
})

test('liveSessionChanged: a new engine session under an open page must reset the viewer', () => {
  // first poll ever (no previous session known) → not a change
  assert.equal(liveSessionChanged(null, 12345, 0, 0), false)
  // same session, lines grow normally → no reset
  assert.equal(liveSessionChanged(12345, 12345, 5, 8), false)
  // engine restarted with a new sessionId → reset even if line counts look plausible
  assert.equal(liveSessionChanged(12345, 67890, 5, 8), true)
  // engine restarted, no sessionId available (old engine) → line count SHRANK exposes it
  assert.equal(liveSessionChanged(null, null, 20, 3), true)
  // no sessionId, lines only grow → no reset (normal old-engine session)
  assert.equal(liveSessionChanged(null, null, 5, 8), false)
  // 2026-07-04 real-Zoom bug repro: stale tab held seenLines=20 from yesterday's replay;
  // fresh engine served the founder's new call (3 lines) → MUST reset, not swallow lines
  assert.equal(liveSessionChanged(null, 1783121000000, 20, 3), true)
})
