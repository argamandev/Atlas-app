// Pure timing helpers for the live broadcast view. Extracted + unit-tested because the live view's
// jitter/cutoff bugs lived in this math (see the live-view fixes, 2026-06-16). All times are
// recording-relative seconds; wall-clock args are ms.

/** Single source of truth for the live stream buffer — 5 min default; override via NEXT_PUBLIC_LIVE_BUFFER_SEC. */
export const LIVE_BUFFER_SEC = Number(process.env.NEXT_PUBLIC_LIVE_BUFFER_SEC) || 300

/**
 * Smoothly interpolate the live edge between polls. The engine's edge is polled ~every 1.5s but the
 * UI ticks every 100ms; advancing the edge by wall-clock elapsed (a live call runs at ~1x realtime)
 * stops "behind live" + the scrubber duration from stepping/sawtoothing each poll. Frozen once the
 * backend call has ended (the edge no longer advances). Never advances on a stale/future anchor.
 */
export function interpolatedEdge(
  rawEdge: number,
  anchorWallMs: number,
  nowMs: number,
  ended: boolean
): number {
  if (ended) return rawEdge
  return rawEdge + Math.max(0, (nowMs - anchorWallMs) / 1000)
}

/**
 * The viewer's call is "over" ONLY when their delayed playhead has caught up to the true end — not
 * when the backend reports the call ended (they may still have minutes of buffered audio to hear).
 */
export function viewerEnded(backendEnded: boolean, playhead: number, edge: number, epsilon = 1): boolean {
  return backendEnded && edge > 0 && playhead >= edge - epsilon
}

/**
 * The front edge of the playable buffer — where the LIVE button snaps to and where the live scrubber
 * ends. It's the point `bufferSec` behind the real-time broadcast. While the source is live this is
 * `liveEdge − bufferSec` (advances as liveEdge advances). After the source ENDS, the real-time clock
 * keeps running while liveEdge is frozen, so this keeps advancing at 1x from its freeze point toward
 * the true end over `bufferSec` more seconds — the buffer drains, the live UX (playhead pinned to the
 * right, no timeline jump) persists, and "Return to live" follows it instead of leaping to the end.
 * Capped at the true end. `endedAtWallMs` = wall-clock ms when the source ended, or null while live.
 */
export function delayedLiveEdge(
  liveEdge: number,
  bufferSec: number,
  endedAtWallMs: number | null,
  nowMs: number
): number {
  const frozen = Math.max(0, liveEdge - bufferSec)
  if (endedAtWallMs === null) return frozen
  const sinceEnd = Math.max(0, (nowMs - endedAtWallMs) / 1000)
  return Math.min(liveEdge, frozen + sinceEnd)
}

/**
 * Pre-roll gate: until `bufferSec` of audio has accumulated, show a countdown; then "ready". Once
 * the backend ended, stop waiting — whatever is buffered is all there is.
 */
/**
 * The hosted call is "over" for everyone once the delayed/draining edge has reached the true end —
 * there's no live edge left to chase. Monotonic (delayedLiveEdge is capped at liveEdge), so once true
 * it stays true: drives the switch to finished mode and removes the "return to live" affordance.
 */
export function hostedLiveOver(
  backendEnded: boolean,
  delayedEdge: number,
  liveEdge: number,
  epsilon = 1
): boolean {
  return backendEnded && liveEdge > 0 && delayedEdge >= liveEdge - epsilon
}

/**
 * Company-overview live display. From the engine `/api/live/state` + the finish status, decide:
 *  - `liveBanner` — show the "Live Now" banner (the call has started and the buffer hasn't fully drained), and
 *  - `endedInFlight` — the just-ended call should be surfaced as the (raw, still-being-polished) "Latest call":
 *    it has started AND the source ended, but the polished transcript isn't `completed` yet. This spans the
 *    whole window from source-end through the drain and the Gemini polish, so the latest-call slot reflects the
 *    new call immediately (linked to the live/raw view) instead of going blank until the finish lands. Pure.
 */
export function companyLiveDisplay(
  s: { audioStartRel: number | null; liveEdgeRel: number | null; liveEnded: boolean; endedAt: number | null },
  finishStatus: string,
  nowMs: number,
  bufferSec: number = LIVE_BUFFER_SEC
): { liveBanner: boolean; endedInFlight: boolean } {
  const started = s.audioStartRel !== null
  const edge = s.liveEdgeRel ?? 0
  const drained = delayedLiveEdge(edge, bufferSec, s.endedAt ?? null, nowMs)
  const over = hostedLiveOver(!!s.liveEnded, drained, edge)
  const completed = finishStatus === 'completed'
  return {
    liveBanner: started && !over,
    endedInFlight: started && !!s.liveEnded && !completed,
  }
}

export function bufferGate(
  audioStartRel: number | null,
  edge: number,
  bufferSec: number,
  backendEnded: boolean
): { phase: 'waiting' | 'buffering' | 'ready'; countdown: number } {
  if (audioStartRel === null) return { phase: 'waiting', countdown: bufferSec }
  const buffered = edge - audioStartRel
  if (buffered < bufferSec && !backendEnded) {
    return { phase: 'buffering', countdown: Math.max(0, Math.round(bufferSec - buffered)) }
  }
  return { phase: 'ready', countdown: 0 }
}
