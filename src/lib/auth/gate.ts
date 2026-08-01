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
 * redirect built from it sends the user nowhere. Trust `x-forwarded-*` when present — the same
 * rule the API routes already follow (.claude/rules/app.md).
 */
export function resolveOrigin(headers: { get(name: string): string | null }, fallbackOrigin: string): string {
  const host = headers.get('x-forwarded-host')
  if (!host) return fallbackOrigin
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

/**
 * Validates a `next` value coming back from the login page before any client redirects to it.
 * Only same-site absolute paths are allowed; anything protocol-relative, absolute-URL, or
 * non-gated falls back to the app home.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return '/app/home'
  if (!next.startsWith('/') || next.startsWith('//')) return '/app/home'
  return next
}
