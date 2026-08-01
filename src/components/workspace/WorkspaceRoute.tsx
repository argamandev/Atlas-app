'use client'

import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { useDemoState } from '@/lib/demo/DemoStateProvider'
import { DemoBanner } from '@/components/ds/DemoBanner'
import { WorkspaceIntake } from './WorkspaceIntake'
import { WorkspaceShell } from './WorkspaceShell'

// Resolves a workspace from the SESSION state (not the server), because a
// workspace the user just created exists only there. An empty workspace lands in
// intake (design 1339); a populated one gets the control layout (design 1433).
export function WorkspaceRoute({ workspaceId }: { workspaceId: string }) {
  const { dict } = useI18n()
  const router = useRouter()
  const { workspaces } = useDemoState()
  const workspace = workspaces.find((w) => w.id === workspaceId)

  // Never a silent blank — a stale link or a reload-cleared workspace says so.
  if (!workspace) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <DemoBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
          <p className="text-[15px] text-ink">{dict.workspace.notFound}</p>
          <p className="max-w-[420px] text-[13px] leading-[1.6] text-ink-muted">
            {dict.workspace.notFoundHint}
          </p>
          <button
            type="button"
            onClick={() => router.push('/app/workspace')}
            className="mt-1 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-paper"
          >
            {dict.workspace.backToWorkspaces}
          </button>
        </div>
      </div>
    )
  }

  if (workspace.files.length === 0) return <WorkspaceIntake workspaceName={workspace.name} />
  return <WorkspaceShell workspace={workspace} />
}
