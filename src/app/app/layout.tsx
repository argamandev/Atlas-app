import Script from 'next/script'
import { MacWindowFrame } from '@/components/app/MacWindowFrame'
import { NavRail } from '@/components/app/NavRail'
import { PlayerProvider } from '@/lib/player/PlayerProvider'
import { LiveAudioProvider } from '@/lib/live/LiveAudioProvider'
import { ShellChrome } from '@/components/app/ShellChrome'
import { DemoStateProvider } from '@/lib/demo/DemoStateProvider'
import { getAgentsPageData } from '@/lib/agents/data'
import { getWorkspaces } from '@/lib/workspace/data'

// The persistent V1 product shell: macOS window frame + the three-layer sidebar's
// nav rail. Each page supplies its own ExpandedPanel + main content via <AppPage>.
// LocaleProvider is already provided by the root layout. PlayerProvider (recorded audio)
// and LiveAudioProvider (live audio) live here (not in a page) so both global players
// survive navigation between /app/* routes — recorded = Feature 4, live = Global Live Call.
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  // Seed for the session-only demo state (Workspace / Agents). Read here so the
  // stub modules stay the single data door; DemoStateProvider lives at this level
  // — not in a page — so a created agent or a typed document survives navigation
  // between /app/* routes and resets only on reload.
  //
  // Projects are NOT seeded here any more (2026-08-02): they are real rows behind
  // RLS, fetched per-account through /api/projects by the components themselves.
  const [agentsData, workspaces] = await Promise.all([getAgentsPageData(), getWorkspaces()])

  return (
    <MacWindowFrame nav={<NavRail />}>
      {/* V2 canvas animation engine (design-import port) — loads once for all /app/* pages */}
      <Script src="/atlas-anim.js" strategy="lazyOnload" />
      <PlayerProvider>
        <LiveAudioProvider>
          <DemoStateProvider seed={{ agents: agentsData.agents, workspaces, docHtml: {} }}>
            <ShellChrome>{children}</ShellChrome>
          </DemoStateProvider>
        </LiveAudioProvider>
      </PlayerProvider>
    </MacWindowFrame>
  )
}
