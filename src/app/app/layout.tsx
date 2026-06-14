import { MacWindowFrame } from '@/components/app/MacWindowFrame'
import { NavRail } from '@/components/app/NavRail'
import { PlayerProvider } from '@/lib/player/PlayerProvider'
import { ShellChrome } from '@/components/app/ShellChrome'

// The persistent V1 product shell: macOS window frame + the three-layer sidebar's
// nav rail. Each page supplies its own ExpandedPanel + main content via <AppPage>.
// LocaleProvider is already provided by the root layout. PlayerProvider lives here (not in
// a page) so the global audio player survives navigation between /app/* routes (Feature 4).
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <MacWindowFrame nav={<NavRail />}>
      <PlayerProvider>
        <ShellChrome>{children}</ShellChrome>
      </PlayerProvider>
    </MacWindowFrame>
  )
}
