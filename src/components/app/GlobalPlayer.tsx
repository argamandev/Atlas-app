'use client'

import { usePlayer, usePlayerTime } from '@/lib/player/PlayerProvider'
import { MediaPlayer } from '@/components/live/MediaPlayer'

// The docked player bar, now global (Feature 4). Reads the shared player + playhead and
// renders the existing MediaPlayer UI unchanged. Rendered by the app shell so it persists
// across navigation; absent (returns null) when no recorded call is loaded.
export function GlobalPlayer() {
  const p = usePlayer()
  const currentTime = usePlayerTime()
  // barHidden: the ✕ dismisses the BAR only — audio keeps playing (founder round 3);
  // the transcript view's bottom chip (or loading any call) brings it back.
  if (!p.call || p.barHidden) return null
  return (
    <MediaPlayer
      logoUrl={p.call.logoUrl}
      title={p.call.title}
      subtitle={p.call.subtitle}
      currentTime={currentTime}
      duration={p.duration}
      playing={p.playing}
      isLive={p.call.isLive}
      volume={p.volume}
      onPlayPause={p.toggle}
      onSeek={p.seek}
      onSkip={p.skip}
      onVolumeChange={p.setVolume}
      onClose={p.hideBar}
      chatNarrow={p.chatOpen}
    />
  )
}
