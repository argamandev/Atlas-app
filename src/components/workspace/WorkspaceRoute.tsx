'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { WorkspaceShell } from './WorkspaceShell'
import { WorkspaceIntake } from './WorkspaceIntake'
import { presentWorkspace } from '@/lib/workspace/present'
import type { WorkspaceRow, WorkspaceItemRow } from '@/lib/workspace/data'

// Resolves a workspace from REAL rows read on the server (migration 016). It
// used to resolve against session demo state, which is exactly why a reload
// used to lose everything the user had done.
//
// An empty workspace lands in intake (design 1339); a populated one gets the
// control layout (design 1433).
export function WorkspaceRoute({
  workspace,
  items,
  companies,
  loadError,
  nowIso,
}: {
  workspace: WorkspaceRow | null
  items: WorkspaceItemRow[]
  /** itemId -> company name; the workspace's company is derived from these */
  companies: Record<string, string>
  loadError: string | null
  /** the server's clock, so hydration cannot mismatch on a relative label */
  nowIso: string
}) {
  const { dict, locale } = useI18n()
  const router = useRouter()

  const presented = useMemo(
    () =>
      workspace
        ? presentWorkspace(
            workspace,
            items,
            items.map((i) => companies[i.id]).filter(Boolean),
            new Date(nowIso),
            locale,
            dict
          )
        : null,
    [workspace, items, companies, nowIso, locale, dict]
  )

  // What is already on the shelf, in CORPUS ids rather than item ids — the
  // picker compares against these so an attached source shows as added instead
  // of offering an Add that the unique index would refuse.
  const attachedSourceIds = useMemo(
    () => items.map((i) => i.transcript_id ?? i.document_id).filter((v): v is string => !!v),
    [items]
  )

  const backButton = (
    <button
      type="button"
      onClick={() => router.push('/app/workspace')}
      className="mt-1 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-paper"
    >
      {dict.workspace.backToWorkspaces}
    </button>
  )

  // A FAILED LOAD IS NOT A MISSING WORKSPACE, and must not borrow its wording.
  // Saying "no longer here" over a broken query tells the user their work is
  // gone when the truth is that we could not ask — the same class of lie as an
  // empty state rendered over a 500.
  if (loadError !== null) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-10 text-center">
        <div
          role="alert"
          className="max-w-[520px] rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-start text-[13px] text-ink"
        >
          <ErrorLine
            template={dict.workspace.openFailed}
            error={loadError}
            auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
          />
        </div>
        {backButton}
      </div>
    )
  }

  // Never a silent blank. RLS makes another account's workspace NOT THERE
  // rather than forbidden, so this one branch covers both "never existed" and
  // "not yours" — which is the correct answer to both.
  if (!presented) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-10 text-center">
        <p className="text-[15px] text-ink">{dict.workspace.notFound}</p>
        <p className="max-w-[420px] text-[13px] leading-[1.6] text-ink-muted">
          {dict.workspace.notFoundHint}
        </p>
        {backButton}
      </div>
    )
  }

  // An EMPTY workspace shows THE DESIGNED INTAKE PANEL — the front door.
  //
  // For one day it showed the source picker instead, because this file argued
  // that a panel promising files nothing could gather was dishonest. The founder
  // overruled that on 2026-08-04, and was right: the honesty rule is about not
  // lying, not a licence to delete the product. The panel searches the REAL
  // corpus now through `findSources` (lib/workspace/intake), so it delivers what
  // Atlas has and says plainly what it does not.
  //
  // The picker did not disappear — it is the "add more sources" path inside a
  // populated workspace (WorkspaceShell's addOpen overlay), which is the job it
  // was always right for.
  if (presented.files.length === 0) {
    return <WorkspaceIntake workspaceId={presented.id} workspaceName={presented.name} />
  }

  return <WorkspaceShell workspace={presented} attachedSourceIds={attachedSourceIds} />
}
