'use client'

import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { useDemoState } from '@/lib/demo/DemoStateProvider'
import { DemoBanner } from '@/components/ds/DemoBanner'
import { ProjectsIcon, PlusIcon } from '@/components/ds/icons'

// Projects list (design lines 1099-1121). Warm design hexes are rendered through
// their Harvey values: E6E2DA→hairline, FAF9F6→paper, ECE9E2→panel, 1C1B19→ink,
// 6B6862→ink-muted; CBC5B8/A19C90 are UNSET in the design's Harvey table and map
// to the nearest token by role (see cross-cutting 2026-08-01).
export function ProjectsList() {
  const { dict } = useI18n()
  const router = useRouter()
  const { projects, addProject } = useDemoState()

  function createProject() {
    const id = addProject(dict.projects.untitled)
    router.push(`/app/chat/projects/${id}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DemoBanner />
      <div className="atscroll min-h-0 flex-1 overflow-auto px-12 pb-32 pt-11">
        <div className="max-w-[720px]">
          <h1 className="mb-1.5 font-display text-[30px] font-medium tracking-[-0.02em] text-ink">
            {dict.projects.title}
          </h1>
          <p className="mb-[26px] text-[14px] text-ink-muted">{dict.projects.subtitle}</p>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/app/chat/projects/${p.id}`)}
                className="rounded-[10px] border border-hairline bg-paper p-[17px] text-start transition-colors hover:bg-subtle/60"
              >
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-panel text-ink">
                    <ProjectsIcon size={16} strokeWidth={1.6} />
                  </span>
                  <span dir="auto" className="text-[14.5px] font-semibold text-ink">
                    {p.name}
                  </span>
                </div>
                <div className="text-[12.5px] leading-[1.5] text-ink-muted">
                  <span className="font-mono-num" dir="ltr">
                    {p.chats.length}
                  </span>{' '}
                  {dict.projects.chatsWord} ·{' '}
                  <span className="font-mono-num" dir="ltr">
                    {p.context.length}
                  </span>{' '}
                  {dict.projects.inContext}
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={createProject}
              className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-hairline p-[17px] text-[13.5px] font-medium text-ink-muted transition-colors hover:bg-subtle/60"
            >
              <PlusIcon size={17} strokeWidth={1.7} className="flex-none" />
              {dict.projects.newProject}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
