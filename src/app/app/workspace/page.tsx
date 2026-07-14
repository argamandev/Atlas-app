import { getWorkspaces } from '@/lib/workspace/data'
import { WorkspacePicker } from '@/components/workspace/WorkspacePicker'
import { AppPage } from '@/components/app/AppPage'

// Workspace picker — FRONTEND-ONLY stub. Exact design anatomy lives in
// WorkspacePicker (client: search filter); data flows through lib/workspace/data.ts
// so the real backend is a swap there.
export default async function WorkspacePage() {
  const workspaces = await getWorkspaces()
  return (
    <AppPage contentClassName="bg-shell">
      <WorkspacePicker workspaces={workspaces} />
    </AppPage>
  )
}
