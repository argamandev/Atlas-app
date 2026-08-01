// Pure decision logic for the login gate (src/middleware.ts). Kept separate from the
// middleware itself so it can be unit-tested without an edge runtime or a Supabase session.
//
// WHY THIS EXISTS: until 2026-08-01 the API routes were auth-gated but the PAGES were not —
// anyone who typed /app/home walked into the app, and /print/[id] server-rendered a full
// transcript to anyone holding the URL. The gate closes both.

/** Route prefixes that require a signed-in user. Keep in sync with `config.matcher`. */
export const GATED_PREFIXES = ['/app', '/print'] as const

/**
 * True when `pathname` must not be served to an anonymous visitor.
 * Matches a prefix only at a segment boundary, so `/apple` is NOT gated by `/app`.
 */
export function requiresAuth(pathname: string): boolean {
  return GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The absolute origin to build redirects against.
 *
 * Behind a proxy (Railway) `request.url` resolves to the INTERNAL origin (localhost:8080), so a
 * redirect built from it sends the user nowhere. Hence `x-forwarded-*` (.claude/rules/app.md).
 *
 * But `x-forwarded-host` is ATTACKER-CONTROLLED — anyone can send it. Trusting it blindly puts a
 * hostile host into a `Location:` header on the one route an anonymous attacker can always reach.
 * So it is honoured ONLY when it matches `expectedHost` (the deployment's own hostname, from
 * NEXT_PUBLIC_SITE_HOST). Unset — as on localhost — means no proxy, so the request origin wins.
 */
export function resolveOrigin(
  headers: { get(name: string): string | null },
  fallbackOrigin: string,
  expectedHost?: string
): string {
  const host = headers.get('x-forwarded-host')
  if (!host || !expectedHost) return fallbackOrigin
  if (host.toLowerCase() !== expectedHost.toLowerCase()) return fallbackOrigin
  const proto = headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

/**
 * Where to send an anonymous visitor: the login/landing page, carrying the destination so the
 * app can return them after sign-in. `next` is a path+query only — never an absolute URL — so
 * it cannot be used as an open redirect to another host.
 */
export function loginRedirectTarget(pathname: string, search: string): string {
  const dest = `${pathname}${search}`
  return `/?next=${encodeURIComponent(dest)}`
}

/** Where an unusable `next` value lands instead. */
export const DEFAULT_DESTINATION = '/app/home'

/**
 * Validates a `next` value coming back from the login page before anything redirects to it.
 *
 * A naive `startsWith('/') && !startsWith('//')` check is NOT enough, and this function was
 * exactly that until a reviewer broke it (2026-08-01). WHATWG URL parsing treats a backslash as
 * a slash and strips tab/CR/LF entirely, so `/\evil.com`, `/\/evil.com`, `/<TAB>/evil.com` and
 * `/<CR>/evil.com` all pass a prefix check and then resolve to `http://evil.com/`. That is an
 * open redirect: a phishing link lands on OUR real login page, the user signs in for real, and
 * the app hands them to a clone.
 *
 * So: resolve against a throwaway origin and demand the origin survive. Anything that changes it
 * — absolute URL, protocol-relative, backslash, control-character smuggling — is refused by
 * construction rather than by a blocklist we would have to keep guessing at. Then require the
 * destination to be a page the gate actually protects, since that is the only place a `next`
 * can legitimately have come from.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_DESTINATION
  let url: URL
  try {
    url = new URL(next, 'http://next.invalid')
  } catch {
    return DEFAULT_DESTINATION
  }
  if (url.origin !== 'http://next.invalid') return DEFAULT_DESTINATION
  if (!requiresAuth(url.pathname)) return DEFAULT_DESTINATION
  return `${url.pathname}${url.search}`
}
