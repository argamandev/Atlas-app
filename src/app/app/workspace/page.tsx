import { AppPage } from '@/components/app/AppPage'
import { WorkspacePicker } from '@/components/workspace/WorkspacePicker'

// Workspace picker — FRONTEND-ONLY. Anatomy lives in WorkspacePicker (design
// lines 1263-1333); workspaces come from the session demo state, which the /app
// layout seeded from lib/workspace/data.ts, so a workspace created here shows up
// immediately and resets on reload.
export default function WorkspaceRoute() {
  return (
    <AppPage contentClassName="bg-shell">
      <WorkspacePicker />
    </AppPage>
  )
}
