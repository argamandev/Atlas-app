import type { ProjectRow, ProjectSourceRow } from './data'

// The browser's only door to the project API. Every call surfaces its failure to
// the caller — a rejected promise, never a swallowed one. The UI is required to
// render that failure: a save that silently did nothing while the screen looks
// unchanged is the defect class in .claude/rules/app.md.

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as T
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
