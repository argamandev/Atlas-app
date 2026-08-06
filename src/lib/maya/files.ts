import { MAYA_MAX_PDF_BYTES, MAYA_TIMEOUT_MS } from './config'
import type { MayaResult } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// A 200 IS NOT PROOF YOU GOT THE FILE.
//
// Observed live on 2026-08-06: a `.pdf` URL on mayafiles answered
// **HTTP 200, content-type text/html, 212 bytes** — a WAF interstitial. Eight
// subsequent fetches of that same URL returned the real 438 KB PDF, so it is
// intermittent, which is the dangerous kind rather than the harmless one: an
// ingest that trusts the status code stores a 212-byte "annual report", extracts
// nothing from it, caches it, and renders a document card the analyst will open
// and find empty.
//
// `.claude/rules/app.md` already carries the sibling incident — a bad response
// plus a long max-age pinned a 0-byte PDF past the server-side fix. The rule
// that survives both: VALIDATE THE BYTES, not the envelope.
//
// These URLs are public: no `apikey`, no cookie, no browser user-agent. That is
// verified, not assumed — sending the key here would leak it to a host that
// never asked for it.
// ─────────────────────────────────────────────────────────────────────────────

const PDF_MAGIC = '%PDF-'

export type DownloadOptions = { fetchImpl?: typeof fetch }

function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false
  return Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString('latin1') === PDF_MAGIC
}

async function fetchOnce(url: string, opts: DownloadOptions): Promise<MayaResult<Uint8Array>> {
  const doFetch = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MAYA_TIMEOUT_MS)
  try {
    const res = await doFetch(url, { signal: controller.signal })
    if (!res.ok) return { ok: false, failure: { kind: 'unavailable', detail: `HTTP ${res.status}` } }

    const buf = new Uint8Array(await res.arrayBuffer())

    if (buf.length > MAYA_MAX_PDF_BYTES) {
      return { ok: false, failure: { kind: 'unavailable', detail: `file too large (${buf.length} bytes)` } }
    }
    if (!looksLikePdf(buf)) {
      // The interstitial's own shape, reported honestly so a log says what
      // happened rather than "extraction failed".
      return {
        ok: false,
        failure: { kind: 'unavailable', detail: `not a PDF (${buf.length} bytes)` },
      }
    }
    return { ok: true, data: buf }
  } catch (e) {
    const detail =
      (e as Error)?.name === 'AbortError' ? 'timeout' : ((e as Error)?.message ?? 'network error')
    return { ok: false, failure: { kind: 'unavailable', detail } }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Download a filing's PDF, or fail loudly.
 *
 * Retries ONCE, because the interstitial is transient and a second attempt
 * costs a second where failing costs the analyst their document. It does not
 * retry further: a URL that answers with HTML twice is not having a bad moment.
 */
export async function downloadFiling(
  url: string,
  opts: DownloadOptions = {}
): Promise<MayaResult<Uint8Array>> {
  const first = await fetchOnce(url, opts)
  if (first.ok) return first

  const second = await fetchOnce(url, opts)
  return second
}
