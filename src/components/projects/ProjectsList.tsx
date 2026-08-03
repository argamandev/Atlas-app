'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ProjectsIcon, PlusIcon } from '@/components/ds/icons'
import { ErrorLine } from '@/components/projects/ErrorLine'
import type { ProjectRow } from '@/lib/projects/data'
import { fetchProjects, createProjectReq } from '@/lib/projects/client'

// Projects list (design lines 1099-1121). Warm design hexes are rendered through
// their Harvey values: E6E2DA→hairline, FAF9F6→paper, ECE9E2→panel, 1C1B19→ink,
// 6B6862→ink-muted; CBC5B8/A19C90 are UNSET in the design's Harvey table and map
// to the nearest token by role (see cross-cutting 2026-08-01).
//
// Real rows since 2026-08-02. The card counts come from the API, so the list
// shows what the database actually holds for THIS account and nothing else.
export function ProjectsList() {
  const { dict } = useI18n()
  const router = useRouter()

  const [projects, setProjects] = useState<(ProjectRow & { chats: number; sources: number })[]>([])
  const [loading, setLoading] = useState(true)
  // A failed LOAD and a failed WRITE are different sentences. Rendering
  // "Not saved — relation does not exist" for a load error tells the user
  // something untrue about what just happened.
  // Thrown values, not messages: ErrorLine needs the status to tell an expired
  // session apart from a broken query.
  const [loadError, setLoadError] = useState<unknown>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    try {
      const { projects: rows } = await fetchProjects()
      // The list endpoint returns rows only; per-project counts belong to the
      // detail view. Showing 0 here would be a claim, so the card renders the
      // project's name and nothing it cannot back up.
      setProjects(rows.map((r) => ({ ...r, chats: 0, sources: 0 })))
      setLoadError(null)
    } catch (e) {
      setLoadError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createProject() {
    setError(null)
    try {
      const { project } = await createProjectReq(dict.projects.untitled)
      router.push(`/app/chat/projects/${project.id}`)
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="atscroll min-h-0 flex-1 overflow-auto px-12 pb-32 pt-11">
        <div className="max-w-[720px]">
          <h1 className="mb-1.5 font-display text-[30px] font-medium tracking-[-0.02em] text-ink">
            {dict.projects.title}
          </h1>
          <p className="mb-[26px] text-[14px] text-ink-muted">{dict.projects.subtitle}</p>

          {/* Both are rendered, never one instead of the other — the same fix
              ProjectView already carries. Picking loadError first while neither
              path clears the other's state meant a create failure ARRIVING
              AFTER a load failure was invisible: the user clicked New project,
              nothing happened, and the banner on screen still described the
              load. A dead click is the founder's red line. */}
          {(loadError !== null || error !== null) && (
            <div
              dir="auto"
              role="alert"
              className="mb-4 flex flex-col gap-1 rounded-[9px] border border-hairline bg-paper px-3 py-2 text-[12.5px] leading-[1.5] text-[#B0533E]"
            >
              {loadError !== null && (
                <ErrorLine
                  template={dict.projects.loadFailed}
                  error={loadError}
                  auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
                />
              )}
              {error !== null && (
                <ErrorLine
                  template={dict.projects.saveFailed}
                  error={error}
                  auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
                />
              )}
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-ink-ghost">{dict.common.loading}</p>
          ) : (
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
                  {p.instructions || p.memory ? (
                    <div dir="auto" className="line-clamp-2 text-[12.5px] leading-[1.5] text-ink-muted">
                      {p.memory || p.instructions}
                    </div>
                  ) : (
                    <div className="text-[12.5px] leading-[1.5] text-ink-ghost">
                      {dict.projects.addContextEmpty}
                    </div>
                  )}
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
          )}
        </div>
      </div>
    </div>
  )
}
