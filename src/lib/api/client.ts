// Thin client-side fetch layer (used by client components). Centralizes credentials,
// JSON handling and error surfacing. Server components read lib/db directly instead.

/**
 * A failed request, carrying the HTTP status the caller needs to act on.
 *
 * This exists because the status used to be THROWN AWAY here: every failure
 * became `new Error(body.error)`, so a 401 arrived at the UI as the bare string
 * "unauthorized" and got rendered as if it were an explanation. A caller cannot
 * offer the one useful action — sign in again — without knowing the status, and
 * sniffing the message text for the word would break the moment the server
 * rephrased it.
 */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Is this failure "we do not know who you are" — i.e. is signing in the fix? */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401
}

/**
 * Turn a fetch Response into data, or throw an ApiError carrying the status.
 *
 * EXPORTED because it is the single place allowed to decide what a failed
 * request throws. It was private, and the cost was immediate: `lib/projects/client.ts`
 * is a SECOND fetch layer that grew its own `throw new Error(body.error)`, so
 * `isUnauthorized()` — which needs `instanceof ApiError` — was false on every
 * Projects screen. Four of the eight error banners could not reach their 401
 * branch, and the sign-in route added for them was dead code on exactly the
 * screens this branch is about. Any new fetch layer calls this; it does not
 * write its own throw.
 */
export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status)
  }
  return res.json() as Promise<T>
}

export async function apiGet<T>(path: string): Promise<T> {
  return handleResponse<T>(await fetch(path, { credentials: 'include' }))
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return handleResponse<T>(
    await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return handleResponse<T>(
    await fetch(path, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

export async function apiDelete<T>(path: string): Promise<T> {
  return handleResponse<T>(await fetch(path, { method: 'DELETE', credentials: 'include' }))
}
