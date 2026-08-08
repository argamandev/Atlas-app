import { MAYA_BASE_URL, MAYA_KEY_HEADER, MAYA_LANGUAGE, MAYA_TIMEOUT_MS } from './config'
import type { MayaResult } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// THE SINGLE CHOKEPOINT. Every MAYA request in the product goes through this
// function — the workspace today, and the chat, calendar and live-call
// consumers later.
//
// That is not tidiness, it is the mechanism behind a deliberate deferral. The
// rate limit (10 requests / 2 seconds) is ONE budget shared by our whole key:
// every user, every consumer. A background calendar sync could therefore starve
// somebody's interactive pull mid-conversation. The founder's call on
// 2026-08-06 was that beta does not need a priority queue yet — safe to defer
// precisely because adding one is a change to THIS FILE and nowhere else.
// Triggers to revisit: the first background sync, or enough beta users to collide.
//
// IT NEVER THROWS. Callers must answer different questions for different
// failures — an unreachable MAYA has to be said out loud to the analyst, while
// a 400 is our own bug and must never be rendered as "no filings found" — so
// the outcome is data, not an exception.
// ─────────────────────────────────────────────────────────────────────────────

export type MayaGetOptions = {
  /** Injected in tests. `npm test` makes no network calls. */
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export function mayaKey(): string | null {
  const k = process.env.MAYA_API_KEY?.trim()
  return k ? k : null
}

export async function mayaGet<T>(
  path: string,
  params: Record<string, string | number> = {},
  opts: MayaGetOptions = {}
): Promise<MayaResult<T>> {
  const key = mayaKey()
  // No key means no possible success, so we do not spend a request finding out.
  // Reported as `unauthorized` because that is what it is — a credential
  // problem — rather than as an outage the analyst might wait out.
  if (!key) return { ok: false, failure: { kind: 'unauthorized' } }

  const url = new URL(path, MAYA_BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  const doFetch = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MAYA_TIMEOUT_MS)

  try {
    const res = await doFetch(url.toString(), {
      headers: {
        accept: 'application/json',
        [MAYA_KEY_HEADER]: key,
        'Accept-Language': MAYA_LANGUAGE,
      },
      signal: opts.signal ?? controller.signal,
    })

    const text = await res.text()

    if (res.status === 401 || res.status === 403) return { ok: false, failure: { kind: 'unauthorized' } }
    if (res.status === 429) return { ok: false, failure: { kind: 'rate_limited' } }

    if (res.status === 400) {
      // The field errors ARE the message — "The date range cannot exceed 1
      // year." arrives here and nowhere else. Dropping them would leave a
      // caller's own bug looking like an empty company.
      const fields = readValidationFields(text)
      return { ok: false, failure: { kind: 'bad_request', fields } }
    }

    if (!res.ok) {
      return { ok: false, failure: { kind: 'unavailable', detail: `HTTP ${res.status}` } }
    }

    // A 200 IS NOT PROOF OF JSON. The gateway's WAF answers with an HTML page
    // under a 200 often enough that parsing has to be part of the contract.
    try {
      return { ok: true, data: JSON.parse(text) as T }
    } catch {
      return { ok: false, failure: { kind: 'unavailable', detail: 'response was not JSON' } }
    }
  } catch (e) {
    const detail =
      (e as Error)?.name === 'AbortError' ? 'timeout' : ((e as Error)?.message ?? 'network error')
    return { ok: false, failure: { kind: 'unavailable', detail } }
  } finally {
    clearTimeout(timer)
  }
}

/** ASP.NET validation problem-details → a plain map. Shape-tolerant: an
 *  unreadable body yields `{}` rather than throwing inside an error path. */
function readValidationFields(text: string): Record<string, string[]> {
  try {
    const body = JSON.parse(text) as { errors?: Record<string, unknown> }
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(body.errors ?? {})) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string')
      else if (typeof v === 'string') out[k] = [v]
    }
    return out
  } catch {
    return {}
  }
}
