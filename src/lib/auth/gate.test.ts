import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requiresAuth, resolveOrigin, loginRedirectTarget, safeNextPath } from './gate'

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
  // A future public route must not be gated just because its name starts with "app".
  assert.equal(requiresAuth('/apple'), false)
  assert.equal(requiresAuth('/approach'), false)
  assert.equal(requiresAuth('/printer-friendly'), false)
})

test('resolveOrigin prefers x-forwarded-* over the internal request origin', () => {
  // Behind Railway, request.url is http://localhost:8080 — redirecting there sends the user
  // nowhere. This is the same trap already recorded in .claude/rules/app.md.
  const origin = resolveOrigin(
    headers({ 'x-forwarded-host': 'atlas.example.com', 'x-forwarded-proto': 'https' }),
    'http://localhost:8080'
  )
  assert.equal(origin, 'https://atlas.example.com')
})

test('resolveOrigin falls back to the request origin when unproxied (localhost dev)', () => {
  assert.equal(resolveOrigin(headers({}), 'http://localhost:3000'), 'http://localhost:3000')
})

test('resolveOrigin defaults a forwarded host with no proto to https', () => {
  assert.equal(
    resolveOrigin(headers({ 'x-forwarded-host': 'atlas.example.com' }), 'http://localhost:8080'),
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

test('safeNextPath refuses anything that could leave the site', () => {
  // An unvalidated ?next= is a classic open redirect: a phishing link that lands on OUR login
  // page and bounces to an attacker's clone after sign-in.
  assert.equal(safeNextPath('https://evil.example.com'), '/app/home')
  assert.equal(safeNextPath('//evil.example.com'), '/app/home')
  assert.equal(safeNextPath('app/home'), '/app/home')
  assert.equal(safeNextPath(null), '/app/home')
  assert.equal(safeNextPath(''), '/app/home')
})

test('safeNextPath keeps a legitimate in-app destination', () => {
  assert.equal(safeNextPath('/app/company/xyz?tab=calls'), '/app/company/xyz?tab=calls')
})
