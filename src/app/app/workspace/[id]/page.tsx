import { AppPage } from '@/components/app/AppPage'
import { WorkspaceRoute } from '@/components/workspace/WorkspaceRoute'

// A single workspace. Resolution happens client-side against the session demo
// state, because a workspace the user just created exists only there.
export default function WorkspaceByIdRoute({ params }: { params: { id: string } }) {
  return (
    <AppPage contentClassName="bg-shell">
      <WorkspaceRoute workspaceId={params.id} />
    </AppPage>
  )
}
