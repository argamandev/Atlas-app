import { MacWindowFrame } from '@/components/app/MacWindowFrame'
import { NavRail } from '@/components/app/NavRail'
import { PlayerProvider } from '@/lib/player/PlayerProvider'
import { LiveAudioProvider } from '@/lib/live/LiveAudioProvider'
import { ShellChrome } from '@/components/app/ShellChrome'

// The persistent V1 product shell: macOS window frame + the three-layer sidebar's
// nav rail. Each page supplies its own ExpandedPanel + main content via <AppPage>.
// LocaleProvider is already provided by the root layout. PlayerProvider (recorded audio)
// and LiveAudioProvider (live audio) live here (not in a page) so both global players
// survive navigation between /app/* routes — recorded = Feature 4, live = Global Live Call.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <MacWindowFrame nav={<NavRail />}>
      <PlayerProvider>
        <LiveAudioProvider>
          <ShellChrome>{children}</ShellChrome>
        </LiveAudioProvider>
      </PlayerProvider>
    </MacWindowFrame>
  )
}
