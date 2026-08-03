import type { ProjectRow, ProjectSourceRow } from './data'
import { handleResponse } from '@/lib/api/client'

// The browser's only door to the project API. Every call surfaces its failure to
// the caller — a rejected promise, never a swallowed one. The UI is required to
// render that failure: a save that silently did nothing while the screen looks
// unchanged is the defect class in .claude/rules/app.md.
//
// THE THROW IS NOT LOCAL, and that is deliberate. This module used to end its
// failure path with `throw new Error(body?.error ?? ...)`, which loses the HTTP
// status. `isUnauthorized()` tests `instanceof ApiError`, so every 401 from the
// Projects API arrived at the UI as an ordinary Error and the sign-in branch in
// ErrorLine was unreachable — on the Projects screens specifically, which is
// where this whole chapter lives. Four of eight error banners were dead, and a
// count of the PROP rather than the BEHAVIOUR reported them as covered.
// Two fetch layers must not hold two answers to "what does a failure throw".

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  return handleResponse<T>(res)
}

export type ProjectChatRow = { id: string; title: string; updated_at: string }

export const fetchProjects = () => call<{ projects: ProjectRow[] }>('/api/projects')

export const fetchProject = (id: string) =>
  call<{ project: ProjectRow; sources: ProjectSourceRow[]; chats: ProjectChatRow[] }>(`/api/projects/${id}`)

export const createProjectReq = (name: string) =>
  call<{ project: ProjectRow }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

export const patchProjectReq = (id: string, patch: Record<string, unknown>) =>
  call<{ project: ProjectRow }>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export const addSourceReq = (projectId: string, name: string) =>
  call<{ source: ProjectSourceRow }>(`/api/projects/${projectId}/sources`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

export const patchSourceReq = (projectId: string, sourceId: string, patch: Record<string, unknown>) =>
  call<{ source: ProjectSourceRow }>(`/api/projects/${projectId}/sources/${sourceId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
