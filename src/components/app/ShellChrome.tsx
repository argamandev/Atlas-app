'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { usePlayer } from '@/lib/player/PlayerProvider'
import { GlobalPlayer } from './GlobalPlayer'
import { ReturnToTranscriptChip } from './ReturnToTranscriptChip'

// The app content area + the global player overlays (Feature 4). When a recorded call is
// loaded, the docked bar appears and the content reserves bottom space so nothing hides
// behind it. The `relative` wrapper is the positioning context the docked bar anchors to.
export function ShellChrome({ children }: { children: React.ReactNode }) {
  const { call } = usePlayer()
  const dockOpen = !!call && !call.isLive

  return (
    <div className={cn('relative flex min-w-0 flex-1 flex-col overflow-hidden', dockOpen && 'pb-[84px]')}>
      {children}
      {dockOpen && <GlobalPlayer />}
      <ReturnToTranscriptChip />
    </div>
  )
}
