'use client'

import { useLiveAudio } from '@/lib/live/LiveAudioProvider'
import { MediaPlayer } from '@/components/live/MediaPlayer'

// The docked LIVE bar, made global (Global Live Call). Mirrors GlobalPlayer for the recorded
// player: reads the shared live engine + playhead and renders the MediaPlayer (live variant) so
// the call's audio + controls persist across navigation. The app shell renders it only when a
// live call is active AND no LiveBroadcastView is currently showing it (the live page keeps its
// own in-column bar). onClose ends the live call entirely (the in-view ✕ only navigates home).
export function GlobalLiveBar() {
  const live = useLiveAudio()
  if (!live.active) return null
  return (
    <MediaPlayer
      logoUrl={live.logoUrl}
      title={live.companyName}
      subtitle={live.quarter}
      chapter={live.over ? undefined : 'Live session'}
      currentTime={live.playingRel}
      duration={live.broadcastEdge}
      playing={live.phase === 'playing' && !live.paused}
      isLive={!live.over}
      onGoLive={live.goLive}
      volume={live.volume}
      onPlayPause={live.playPause}
      onSeek={live.seek}
      onSkip={(d) => live.seek(live.playingRel + d)}
      onVolumeChange={live.setVolume}
      onClose={live.stop}
      chatNarrow={live.chatOpen}
    />
  )
}
