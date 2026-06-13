import * as React from 'react'
import { Surface } from '@/components/ds/Surface'

// The macOS framing (brief §3.6.12): a floating white window with rounded corners and
// soft elevation, traffic-light controls, on the marble/stone desktop backdrop.
export function MacWindowFrame({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="desktop-backdrop flex h-screen w-full items-stretch justify-center p-2 sm:p-4 lg:p-6">
      <Surface
        tone="canvas"
        elevation="window"
        className="flex h-full w-full max-w-[1440px] flex-col overflow-hidden rounded-win"
      >
        {/* slim window title bar with macOS traffic lights (chrome colours, not tokens) */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline px-4">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        </div>

        <div className="flex min-h-0 flex-1">
          {nav}
          {children}
        </div>
      </Surface>
    </div>
  )
}
