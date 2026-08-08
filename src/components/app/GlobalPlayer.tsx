'use client'

import { usePlayer, usePlayerTime } from '@/lib/player/PlayerProvider'
import { MediaPlayer } from '@/components/live/MediaPlayer'
import { useI18n } from '@/lib/i18n/LocaleProvider'

// The docked player bar, now global (Feature 4). Reads the shared player + playhead and
// renders the existing MediaPlayer UI unchanged. Rendered by the app shell so it persists
// across navigation; absent (returns null) when no recorded call is loaded.
export function GlobalPlayer() {
  const p = usePlayer()
  const { dict } = useI18n()
  const currentTime = usePlayerTime()
  // barHidden: the ✕ dismisses the BAR only — audio keeps playing (founder round 3);
  // the transcript view's bottom chip (or loading any call) brings it back.
  if (!p.call || p.barHidden) return null
  return (
    <MediaPlayer
      logoUrl={p.call.logoUrl}
      title={p.call.title}
      // A recording whose source 404s or expires never fires `canplay`, so the
      // bar would otherwise sit there looking loadable while every press of play
      // does nothing. The bar is the only surface that can say it.
      subtitle={p.loadFailed ? dict.live.playbackFailed : p.call.subtitle}
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
