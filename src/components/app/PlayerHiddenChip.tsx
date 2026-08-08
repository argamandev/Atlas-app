'use client'

import { usePlayer } from '@/lib/player/PlayerProvider'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { PlayIcon, CloseIcon } from '@/components/ds/icons'

// ─────────────────────────────────────────────────────────────────────────────
// THE BAR YOU CLOSED, AND THE WAY OUT OF IT.
//
// The docked player's ✕ hides the BAR and leaves the audio playing — a founder
// decision from round 3, and the right one: closing a bar should not stop a call
// you are listening to while you read. What it left behind was a call playing
// with NO control over it anywhere, unless you happened to be on that call's own
// transcript page, which carried the only "Open audio bar" chip in the app. It
// was filed as a FINDING on 2026-07-17 and hit for real on 2026-08-05, in a
// workspace: *"when I'm hearing an investor call and I'm looking at the
// transcript and I'm closing the play bar, there needs to be an open play bar
// back again so I can control it."*
//
// So the chip moves to the shell, where the bar it replaces already lives, and
// it carries BOTH answers to "the bar is gone":
//   ▶ bring it back      — showBar(), the state was only hidden
//   ✕ end it             — close(), *"then that's it, the audio cuts off"*
//
// Two glyphs, two outcomes, neither of them a second ✕ that means what the first
// one meant. It sits where the bar sat, so it reads as the bar collapsed rather
// than as a new thing that appeared.
// ─────────────────────────────────────────────────────────────────────────────
export function PlayerHiddenChip() {
  const { call, barHidden, showBar, close } = usePlayer()
  const { dict } = useI18n()
  // A live call has its own bar and its own chip; this is the recorded player's.
  if (!call || call.isLive || !barHidden) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center">
      <div className="pointer-events-auto flex items-center rounded-full bg-player text-player-ink shadow-player">
        <button
          type="button"
          onClick={showBar}
          className="flex items-center gap-2 rounded-full py-2 ps-4 pe-2.5 text-xs font-semibold transition-opacity hover:opacity-90"
        >
          <PlayIcon size={13} />
          {dict.live.openAudioBar}
          {/* WHICH call — the pill can outlive the page it was started from. */}
          <span className="max-w-[180px] truncate font-normal opacity-70">
            <bdi>{call.title}</bdi>
          </span>
        </button>
        <span className="h-4 w-px bg-white/25" aria-hidden />
        <button
          type="button"
          onClick={close}
          title={dict.live.stopPlayback}
          aria-label={dict.live.stopPlayback}
          className="flex h-8 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-90"
        >
          <CloseIcon size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
