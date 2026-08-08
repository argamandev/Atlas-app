/**
 * WHEN THE WORDS FOLLOW THE AUDIO — AND WHEN THEY ARE JUST WORDS.
 *
 * Founder, 2026-08-05: *"if you're viewing a transcript but you're not playing
 * the recording, you'll see that the words in this transcript are a regular
 * black colour … and only once you click on play the recording, then you'll
 * have the words that are being said in sync with the audio."*
 *
 * Reading is the common case, and it must not look like a stalled player. With
 * karaoke on and no track loaded the active index is -1, so EVERY word renders
 * as "upcoming" — a whole call greyed out before anyone pressed anything, which
 * reads as broken and is genuinely harder to read. Sync is a mode the reader
 * opts INTO by pressing play.
 *
 * The follow chip belongs to the same mode: with nothing playing there is no
 * current word to go back to, so the chip was offering a destination that did
 * not exist.
 *
 * LOADED IS NOT STARTED, and that distinction is the whole reason `started`
 * exists: the call page loads the call into the player the moment the page
 * mounts, so the bar is docked and ready before anyone has pressed anything.
 * "Is this the player's track" is therefore true on arrival, and gating on it
 * alone would leave the page in exactly the state being fixed here.
 *
 * STARTED, NOT `playing`. Pausing does not end the sync — where the audio
 * stopped is still a fact about this transcript, and dropping the highlight on
 * every pause would blink the whole page. So a paused track counts as started
 * while the playhead is off zero. The mode ends when the call stops being the
 * player's track at all (the bar's ✕, or another call loaded).
 *
 * One rule in one place because two surfaces render the same transcript — the
 * call page and a workspace pane — and they must not drift.
 */
export type TranscriptSync = {
  /** spoken words solid, upcoming words faded, the active word highlighted */
  karaoke: boolean
  /** auto-scroll, plus the arrow chip that returns to the current word */
  follow: boolean
}

export function transcriptSync(opts: {
  /** the transcript carries per-word timings — a line-level one can never sync */
  hasWordTimings: boolean
  /** THIS call is the track loaded in the global player */
  isActiveTrack: boolean
  /** the recording has been started: playing now, or paused off zero */
  started: boolean
}): TranscriptSync {
  const on = opts.hasWordTimings && opts.isActiveTrack && opts.started
  return { karaoke: on, follow: on }
}

/**
 * The one expression both surfaces use for `started`, so neither invents its
 * own. `positionSec > 0` is what keeps a pause (and a seek made while paused)
 * inside the mode.
 */
export function playbackStarted(opts: { playing: boolean; positionSec: number }): boolean {
  return opts.playing || opts.positionSec > 0
}
