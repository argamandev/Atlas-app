import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveUser } from './verifyUser'

// getUser() is the ONLY method resolveUser may call. getSession() returns whatever
// the cookie said — in auth-js 2.105.4 it is a shape check plus an expires_at the
// cookie itself supplies, with no signature check and no network call. A test that
// still passes when getSession() is consulted is not testing anything.
function clientWith(opts: {
  user?: { id: string; email: string | null } | null
  error?: { message: string } | null
  onSession?: () => void
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: opts.error ?? null }),
      getSession: async () => {
        opts.onSession?.()
        return { data: { session: { user: { id: 'cookie-supplied-id' } } }, error: null }
      },
    },
  }
}

test('a verified user is returned', async () => {
  const u = await resolveUser(clientWith({ user: { id: 'real-id', email: 'a@b.c' } }) as never)
  assert.deepEqual(u, { id: 'real-id', email: 'a@b.c' })
})

test('an invalid token yields null even though a cookie session exists', async () => {
  const u = await resolveUser(clientWith({ user: null, error: { message: 'invalid JWT' } }) as never)
  assert.equal(u, null)
})

test('getSession() is never consulted — the cookie is not evidence', async () => {
  let sessionRead = false
  await resolveUser(
    clientWith({
      user: { id: 'x', email: null },
      onSession: () => {
        sessionRead = true
      },
    }) as never
  )
  assert.equal(sessionRead, false, 'resolveUser must not fall back to the cookie session')
})

test('a thrown network error is contained and yields null, not a crash', async () => {
  const throwing = {
    auth: {
      getUser: async () => {
        throw new Error('network down')
      },
    },
  }
  const u = await resolveUser(throwing as never)
  assert.equal(u, null)
})

test('a user with no email resolves to null email rather than undefined', async () => {
  const u = await resolveUser(clientWith({ user: { id: 'id-only', email: null } }) as never)
  assert.deepEqual(u, { id: 'id-only', email: null })
})
