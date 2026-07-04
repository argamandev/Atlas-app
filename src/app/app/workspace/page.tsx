import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getWorkspaces } from '@/lib/workspace/data'
import { AppPage } from '@/components/app/AppPage'

// Workspace picker — FRONTEND-ONLY stub (Milestone 1). Layout mirrors the design's
// workspace picker (design-import lines 752–781): headline + explainer, white
// workspace cards, dashed "New workspace" card. All data flows through
// lib/workspace/data.ts so the real backend is a swap there.
export default async function WorkspacePage() {
  const locale = getLocale()
  const dict = getDictionary(locale)
  const workspaces = await getWorkspaces()

  return (
    <AppPage contentClassName="bg-shell">
      <div className="atscroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-8 pt-12">
          <h1 className="text-[26px] font-bold tracking-tight text-ink">{dict.workspace.title}</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">{dict.workspace.subtitle}</p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                className="group flex flex-col items-start rounded-card bg-canvas p-5 text-start shadow-card ring-1 ring-hairline transition-shadow hover:shadow-popover"
              >
                <div className="flex w-full items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-subtle text-base text-ink">
                    {w.initial}
                  </span>
                  <span className="font-mono-num text-2xs text-ink-faint">{w.updatedLabel}</span>
                </div>
                <span className="mt-4 text-[15px] font-semibold text-ink" dir="auto">
                  {w.name}
                </span>
                <span className="mt-1 text-xs text-ink-muted" dir="auto">
                  {w.subtitle}
                </span>
                <span className="mt-3 font-mono-num text-2xs text-ink-faint" dir="ltr">
                  {w.fileCount} {dict.workspace.files}
                </span>
              </button>
            ))}

            <button
              type="button"
              className="flex min-h-[168px] flex-col items-center justify-center rounded-card border border-dashed border-ink-faint/40 p-5 text-center transition-colors hover:border-ink-faint/70 hover:bg-canvas/60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-lg leading-none text-white">
                +
              </span>
              <span className="mt-3 text-sm font-semibold text-ink">{dict.workspace.newWorkspace}</span>
              <span className="mt-1 text-xs text-ink-faint">{dict.workspace.newWorkspaceHint}</span>
            </button>
          </div>
        </div>
      </div>
    </AppPage>
  )
}
