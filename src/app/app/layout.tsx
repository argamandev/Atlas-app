import { MacWindowFrame } from '@/components/app/MacWindowFrame'
import { NavRail } from '@/components/app/NavRail'

// The persistent V1 product shell: macOS window frame + the three-layer sidebar's
// nav rail. Each page supplies its own ExpandedPanel + main content via <AppPage>.
// LocaleProvider is already provided by the root layout.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return <MacWindowFrame nav={<NavRail />}>{children}</MacWindowFrame>
}
