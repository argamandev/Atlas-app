import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  requiresAuth,
  resolveOrigin,
  loginRedirectTarget,
  safeNextPath,
  GATED_PREFIXES,
  DEFAULT_DESTINATION,
} from './gate'
import { config as middlewareConfig } from '../../middleware'

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null }
}

test('requiresAuth gates every /app page', () => {
  for (const p of ['/app', '/app/home', '/app/chat', '/app/company/abc', '/app/live/xyz_live']) {
    assert.equal(requiresAuth(p), true, `${p} must be gated`)
  }
})

test('requiresAuth gates /print — it server-renders a full transcript', () => {
  assert.equal(requiresAuth('/print/abc-123'), true)
})

test('requiresAuth leaves the login page and the auth callback open', () => {
  // Gating these would lock everyone out: '/' IS the login page, and the callback is how a
  // session is established in the first place.
  assert.equal(requiresAuth('/'), false)
  assert.equal(requiresAuth('/auth/callback'), false)
  assert.equal(requiresAuth('/api/auth/signout'), false)
})

test('requiresAuth matches on a segment boundary, not a bare prefix', () => {
  assert.equal(requiresAuth('/apple'), false)
  assert.equal(requiresAuth('/approach'), false)
  assert.equal(requiresAuth('/printer-friendly'), false)
})

test('the middleware matcher covers exactly GATED_PREFIXES — drift is a silent full bypass', () => {
  // Three comments used to be the only thing keeping these in sync. If someone adds a prefix to
  // GATED_PREFIXES and forgets config.matcher, requiresAuth() says "gated" while the middleware
  // never runs on it — the route is wide open and every other test still passes.
  const expected = GATED_PREFIXES.map((p) => `${p}/:path*`).sort()
  assert.deepEqual([...middlewareConfig.matcher].sort(), expected)
})

test('resolveOrigin honours x-forwarded-host ONLY when it matches the expected host', () => {
  // Behind Railway, request.url is the internal http://localhost:8080 — redirecting there sends
  // the user nowhere (.claude/rules/app.md).
  const origin = resolveOrigin(
    headers({ 'x-forwarded-host': 'atlas.example.com', 'x-forwarded-proto': 'https' }),
    'http://localhost:8080',
    'atlas.example.com'
  )
  assert.equal(origin, 'https://atlas.example.com')
})

test('resolveOrigin refuses a forged x-forwarded-host', () => {
  // Anyone can send this header. Trusting it puts an attacker's host in a Location: header on
  // the one route an anonymous attacker can always reach.
  const origin = resolveOrigin(
    headers({ 'x-forwarded-host': 'evil.example.com', 'x-forwarded-proto': 'https' }),
    'http://localhost:8080',
    'atlas.example.com'
  )
  assert.equal(origin, 'http://localhost:8080')
})

test('resolveOrigin ignores forwarded headers entirely when no expected host is configured', () => {
  // Localhost dev: no proxy, so there is nothing legitimate to forward.
  assert.equal(
    resolveOrigin(headers({ 'x-forwarded-host': 'evil.example.com' }), 'http://localhost:3000'),
    'http://localhost:3000'
  )
  assert.equal(resolveOrigin(headers({}), 'http://localhost:3000'), 'http://localhost:3000')
})

test('resolveOrigin defaults a matching forwarded host with no proto to https', () => {
  assert.equal(
    resolveOrigin(
      headers({ 'x-forwarded-host': 'atlas.example.com' }),
      'http://localhost:8080',
      'atlas.example.com'
    ),
    'https://atlas.example.com'
  )
})

test('loginRedirectTarget carries the destination, encoded', () => {
  assert.equal(loginRedirectTarget('/app/home', ''), '/?next=%2Fapp%2Fhome')
  assert.equal(
    loginRedirectTarget('/app/company/xyz', '?tab=calls'),
    '/?next=%2Fapp%2Fcompany%2Fxyz%3Ftab%3Dcalls'
  )
})

test('safeNextPath refuses every payload that resolves off-site', () => {
  // These four defeated the original prefix check: WHATWG URL parsing treats a backslash as a
  // slash and strips tab/CR/LF, so each of these resolves to http://evil.example.com/ while
  // starting with "/" and not "//". Verified against the real URL parser, not by inspection.
  const escapes = [
    'https://evil.example.com',
    '//evil.example.com',
    '/\\evil.example.com',
    '/\\/evil.example.com',
    '/\t/evil.example.com',
    '/\r/evil.example.com',
    '/\n/evil.example.com',
    'https:/evil.example.com',
    'javascript:alert(1)',
  ]
  for (const payload of escapes) {
    assert.equal(safeNextPath(payload), DEFAULT_DESTINATION, `${JSON.stringify(payload)} must not survive`)
    // Belt and braces: whatever came back must stay on our own origin.
    assert.equal(
      new URL(safeNextPath(payload), 'http://atlas.test').origin,
      'http://atlas.test',
      `${JSON.stringify(payload)} escaped the site`
    )
  }
})

test('safeNextPath refuses a same-site path the gate does not protect', () => {
  // A `next` can only legitimately have come from the gate, so it must name a gated page.
  // '/apple' is same-site and harmless, but it is not somewhere the gate ever redirects from.
  assert.equal(safeNextPath('/apple'), DEFAULT_DESTINATION)
  assert.equal(safeNextPath('/'), DEFAULT_DESTINATION)
})

test('safeNextPath normalizes a relative path to its absolute same-site form', () => {
  // Deliberately NOT 'app/home': if the input and the fallback collide, the assertion cannot
  // tell "rejected → fallback" from "accepted and normalized". This one distinguishes them —
  // and the answer is NORMALIZED, not rejected: a bare relative path cannot leave the site,
  // and what comes back is always an absolute path, never the caller's raw string.
  assert.equal(safeNextPath('app/settings'), '/app/settings')
})

test('safeNextPath falls back when there is nothing usable', () => {
  assert.equal(safeNextPath(null), DEFAULT_DESTINATION)
  assert.equal(safeNextPath(undefined), DEFAULT_DESTINATION)
  assert.equal(safeNextPath(''), DEFAULT_DESTINATION)
})

test('safeNextPath keeps a legitimate in-app destination, query intact', () => {
  assert.equal(safeNextPath('/app/company/xyz?tab=calls'), '/app/company/xyz?tab=calls')
  assert.equal(safeNextPath('/print/demo'), '/print/demo')
})

test('a gate redirect round-trips: what the gate emits, safeNextPath accepts unchanged', () => {
  // The two halves are written independently; this pins them together.
  for (const [pathname, search] of [
    ['/app/home', ''],
    ['/app/company/xyz', '?tab=calls'],
    ['/print/demo', ''],
  ] as const) {
    const emitted = loginRedirectTarget(pathname, search)
    const next = new URL(emitted, 'http://atlas.test').searchParams.get('next')
    assert.equal(safeNextPath(next), `${pathname}${search}`)
  }
})
