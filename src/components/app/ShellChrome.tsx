'use client'

import * as React from 'react'
import { usePlayer } from '@/lib/player/PlayerProvider'
import { useLiveAudio } from '@/lib/live/LiveAudioProvider'
import { GlobalPlayer } from './GlobalPlayer'
import { GlobalLiveBar } from './GlobalLiveBar'
import { ReturnToTranscriptChip } from './ReturnToTranscriptChip'
import { ReturnToLiveChip } from './ReturnToLiveChip'

// The app content area + the global player overlays. Two global bars can float over the bottom:
// the recorded player (Feature 4) and the LIVE bar (Global Live Call). The live bar shows only
// when a live call is active AND you've navigated away from the live page (which keeps its own
// in-column bar). Pages keep their own bottom padding inside their scroll areas so the last lines
// clear the floating pill. The `relative` wrapper is the positioning context the docked bars anchor to.
export function ShellChrome({ children }: { children: React.ReactNode }) {
  const { call } = usePlayer()
  const live = useLiveAudio()
  const dockOpen = !!call && !call.isLive
  const liveDockOpen = live.active && !live.viewing // live bar takes over once you leave the live page

  return (
    <div
      data-dock={dockOpen || liveDockOpen ? 'open' : undefined}
      className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
    >
      {children}
      {dockOpen && <GlobalPlayer />}
      {liveDockOpen && <GlobalLiveBar />}
      <ReturnToTranscriptChip />
      <ReturnToLiveChip />
    </div>
  )
}
