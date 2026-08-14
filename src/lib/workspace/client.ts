import type { WorkspaceRow, WorkspaceItemRow, WorkspaceBlockRow, AttachableSource } from './data'
import type { ItemCreate, BlockCreate } from './validate'
import type { IntakeResponse, IntakeTurn } from './intake/types'
import type { ItemContent } from './contentTypes'
import type { ChatTurn } from './chat/prompt'
import type { StoredMsg } from './thread'
import type { ChatSnip } from '@/lib/chat/grounding'
import { handleResponse } from '@/lib/api/client'

// The browser's only door to the workspace API. Every call surfaces its failure
// to the caller — a rejected promise, never a swallowed one. The UI is required
// to render that failure: a save that silently did nothing while the screen
// looks unchanged is the defect class in .claude/rules/app.md, and the exact
// thing `fix/projects-honesty` was gated on (`.catch(() => setItems([]))`
// turning a 500 into a confident "nothing here yet").

// THE THROW IS NOT LOCAL, and that is deliberate. This module first shipped
// with its own `throw new Error(body?.error ?? …)`, copied from the Projects
// client as it stood before 2026-08-03 — which loses the HTTP status.
// `isUnauthorized()` tests `instanceof ApiError`, so every 401 would have
// reached the UI as an ordinary Error and the sign-in branch inside ErrorLine
// would have been unreachable on exactly the screens that pass it. Caught by
// `src/lib/api/errorShape.test.ts`, which exists because the same mistake shipped
// once already. Two fetch layers must not hold two answers to "what does a
// failure throw".
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  return handleResponse<T>(res)
}

export type WorkspaceFull = {
  workspace: WorkspaceRow
  items: WorkspaceItemRow[]
  blocks: WorkspaceBlockRow[]
  /** itemId -> company name, for the DERIVED company label */
  companies: Record<string, string>
}

/** The corpus a user may put on a shelf. Static segment, so it does not collide
 *  with /api/workspaces/[id] — Next resolves `sources` before the dynamic one. */
export const fetchSources = () => call<{ sources: AttachableSource[] }>('/api/workspaces/sources')

/**
 * One turn of the intake conversation. Sends the whole thread — the intake is a
 * dialogue, and Atlas needs what was already agreed to answer the next message.
 *
 * `status: 'ready'` in the reply means the user has agreed IN WORDS and the
 * files may now be pulled; anything else means keep talking. Never returns
 * invented rows — see the route's header for why the model cannot conjure one.
 */
export const intakeSearchReq = (workspaceId: string, messages: IntakeTurn[]) =>
  call<{ result: IntakeResponse }>(`/api/workspaces/${workspaceId}/intake`, {
    method: 'POST',
    body: JSON.stringify({ messages }),
  })

/**
 * One turn of the workspace chat, grounded in the shelf's own text.
 *
 * `wantsDocuments` comes back when the analyst asked Atlas to BRING a file
 * rather than asking about one — the caller hands that to the intake
 * conversation. This endpoint never attaches anything itself.
 */
export const workspaceChatReq = (
  workspaceId: string,
  messages: ChatTurn[],
  selection?: { title: string; text: string } | null,
  /** Pinge clips of a PDF page, sent to the model as images (`ChatSnip[]`). */
  attachments?: ChatSnip[]
) =>
  call<{
    result: {
      reply: string | null
      wantsDocuments: string | null
      /** files the answer could see only part of, or not at all */
      partial: string[]
      unreadable: string[]
    }
  }>(`/api/workspaces/${workspaceId}/chat`, {
    method: 'POST',
    body: JSON.stringify({
      messages,
      ...(selection ? { selection } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    }),
  })

/**
 * Ask Atlas to draft a passage for the working document.
 *
 * Returns ONLY the new passage and where it goes — it is never handed the whole
 * document to rewrite, so nothing the analyst wrote can be lost to a bad
 * generation. `result: null` means it could not write; render that, never an
 * empty insertion that looks like success.
 */
export const composeReq = (
  workspaceId: string,
  input: {
    instruction: string
    document: string
    headings: string[]
    passage?: { title: string; text: string } | null
    /** a clipping the instruction is about: the PNG plus where it was cut from */
    clip?: {
      image: { dataUrl: string; page: number; documentId: string }
      title: string
      pageLabel: string
    } | null
  }
) =>
  call<{
    result: { html: string; afterHeading: string | null; partial: string[] } | null
  }>(`/api/workspaces/${workspaceId}/compose`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const fetchWorkspaces = () =>
  call<{ workspaces: WorkspaceRow[]; items: WorkspaceItemRow[] }>('/api/workspaces')

export const fetchWorkspace = (id: string) => call<WorkspaceFull>(`/api/workspaces/${id}`)

export const createWorkspaceReq = (name: string) =>
  call<{ workspace: WorkspaceRow }>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

export const patchWorkspaceReq = (id: string, patch: Record<string, unknown>) =>
  call<{ workspace: WorkspaceRow }>(`/api/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export type WorkspaceCounts = { items: number; threads: number; blocks: number }

/**
 * What deleting this workspace would destroy — asked BEFORE asking to destroy
 * it. The DELETE response carries the same numbers, but by then the answer is a
 * receipt rather than a question (`rules/db.md`, and countWorkspaceContents's
 * own header).
 */
export const fetchWorkspaceCounts = (id: string) =>
  call<{ counts: WorkspaceCounts }>(`/api/workspaces/${id}/counts`)

export const deleteWorkspaceReq = (id: string) =>
  call<{ deleted: true; counts: WorkspaceCounts }>(`/api/workspaces/${id}`, { method: 'DELETE' })

export type StoredThread = { id: string; title: string; messages: StoredMsg[] }

export const fetchThreadReq = (workspaceId: string) =>
  call<{ thread: StoredThread | null }>(`/api/workspaces/${workspaceId}/thread`)

/** Replace the workspace's conversation. Whole array — see the route's header. */
export const saveThreadReq = (workspaceId: string, messages: StoredMsg[]) =>
  call<{ thread: StoredThread }>(`/api/workspaces/${workspaceId}/thread`, {
    method: 'PUT',
    body: JSON.stringify({ messages }),
  })

export const addItemReq = (workspaceId: string, input: ItemCreate) =>
  call<{ item: WorkspaceItemRow }>(`/api/workspaces/${workspaceId}/items`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

/**
 * Fetch a MAYA filing into Atlas and attach it.
 *
 * SENDS A POINTER, NOT THE FILING. The server asks MAYA for the title, the
 * issuer and the file itself — nothing typed or tampered with in a browser
 * becomes a row in shared corpus.
 *
 * Slower than `addItemReq` by design: it downloads a PDF and extracts every
 * page before the shelf can show it.
 */
export const addMayaItemReq = (
  workspaceId: string,
  ref: { mayaReportId: number; issuerId: number; publishedISO: string | null }
) =>
  call<{ item: WorkspaceItemRow; fetched: boolean }>(`/api/workspaces/${workspaceId}/items/from-maya`, {
    method: 'POST',
    body: JSON.stringify(ref),
  })

/** Layout only — `is_open` and `position`. Debounce this at the call site. */
export const patchItemReq = (
  workspaceId: string,
  itemId: string,
  patch: { is_open?: boolean; position?: number }
) =>
  call<{ item: WorkspaceItemRow }>(`/api/workspaces/${workspaceId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

/** What a shelf item actually says. Never cached — a re-processed transcript
 *  keeps its id while its words change. */
export const fetchItemContent = (workspaceId: string, itemId: string) =>
  call<{ content: ItemContent }>(`/api/workspaces/${workspaceId}/items/${itemId}/content`)

export const deleteItemReq = (workspaceId: string, itemId: string) =>
  call<{ deleted: true }>(`/api/workspaces/${workspaceId}/items/${itemId}`, { method: 'DELETE' })

export const addBlockReq = (workspaceId: string, input: BlockCreate) =>
  call<{ block: WorkspaceBlockRow }>(`/api/workspaces/${workspaceId}/blocks`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const patchBlockReq = (
  workspaceId: string,
  blockId: string,
  patch: { body?: string; position?: number }
) =>
  call<{ block: WorkspaceBlockRow }>(`/api/workspaces/${workspaceId}/blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export const deleteBlockReq = (workspaceId: string, blockId: string) =>
  call<{ deleted: true }>(`/api/workspaces/${workspaceId}/blocks/${blockId}`, { method: 'DELETE' })
