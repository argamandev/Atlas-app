'use client'

import * as React from 'react'
import { usePlayer } from '@/lib/player/PlayerProvider'
import { GlobalPlayer } from './GlobalPlayer'
import { ReturnToTranscriptChip } from './ReturnToTranscriptChip'

// The app content area + the global player overlays (Feature 4). When a recorded call is
// loaded, the black pill floats over the bottom (no full-width reserved band — that band read
// as a white block clashing with the side panels). Pages keep their own bottom padding inside
// their scroll areas so the last lines clear the floating pill. The `relative` wrapper is the
// positioning context the docked bar anchors to.
export function ShellChrome({ children }: { children: React.ReactNode }) {
  const { call } = usePlayer()
  const dockOpen = !!call && !call.isLive

  return (
    <div data-dock={dockOpen ? 'open' : undefined} className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {children}
      {dockOpen && <GlobalPlayer />}
      <ReturnToTranscriptChip />
    </div>
  )
}
