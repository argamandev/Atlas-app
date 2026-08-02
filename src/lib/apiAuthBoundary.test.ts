import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE API AUTH BOUNDARY.
//
// Every HTTP method of every route under src/app/api must resolve a signed-in user, unless it
// is listed as PUBLIC below with a reason.
//
// WHY A STRUCTURAL TEST RATHER THAN "we fixed the routes": the holes this closes were not one
// mistake, they were a DRIFT. Routes were added over months, each one reasonable on its own,
// and the fleet's own notes described the damage as "two routes" when a command found 16 call
// sites across 8 files. A per-route fix rots the same way; a guard that runs in the battery
// does not. Add a route with an unauthenticated method and this test fails before review.
//
// WHAT IT CANNOT SEE, stated so nobody trusts it further than it goes: this is a TEXT scan, not
// a type or flow analysis. It proves each method calls an auth helper — not that the result is
// checked, and not that the caller may touch the specific row it goes on to read. Ownership
// filtering is a separate obligation that lives in the lib/db modules (see .claude/rules/app.md:
// supabaseAdmin bypasses RLS, so RLS protects only what queries through the USER's client).
// ─────────────────────────────────────────────────────────────────────────────

const API_ROOT = 'src/app/api'

/** Any of these, called anywhere inside a handler, counts as resolving the caller. */
const AUTH_CALL = /\b(getRequestUserId|resolveUser|requireAdmin|getCurrentUser)\s*\(/

/**
 * Methods that are deliberately reachable without a session. Keyed `<route> <METHOD>`.
 * Every entry carries the reason it is safe — an allowlist without reasons is just a mute button.
 */
const PUBLIC: Record<string, string> = {
  '/access-request POST':
    'the request-access form on the public landing page — the whole point is that a stranger can submit it',
  '/auth/signout GET':
    'signing out must work when the session is already invalid; requiring a valid session to leave is a trap',
  '/calls GET': 'reference data: the scheduled-calls list, shared corpus, no user rows involved',
  '/companies GET': 'reference data: the company directory, shared corpus',
  '/companies/[id] GET': 'reference data: one company, shared corpus',

  // ── NOT "by design" — these two are an OPEN ITEM, dated 2026-08-03. ──────────────────────
  // They proxy the live engine on :8788 and serve real call captions and audio, so anonymous
  // access to them IS content exposure. They are listed here rather than fixed because closing
  // them safely needs a live run with the engine up (.claude/rules/live.md), the live chapter is
  // parked, and /pcm is polled continuously — an auth round trip per poll is a latency change
  // that must be measured on a real call, not assumed.
  // The exposure is bounded until then: both proxy a localhost-only engine, so on a deployed
  // Atlas they cannot reach it and return nothing regardless of who asks.
  // MUST BE REVISITED BEFORE LIVE IS DEPLOYED — not before Atlas is deployed. Tracked in
  // docs/V1-SECURITY-AND-LAUNCH-NOTES.md.
  '/live/pcm GET': 'OPEN ITEM — proxies the localhost live engine; gating needs a live test',
  '/live/state GET': 'OPEN ITEM — proxies the localhost live engine; gating needs a live test',
}

/**
 * Files still permitted to mention DEMO_USER_ID, with an expiry condition.
 * The constant pools every anonymous caller into one identity that owns real rows; the point of
 * this chapter was to delete its use, so what remains must be visible and finite.
 */
const DEMO_USER_EXCEPTIONS: Record<string, string> = {
  '/conversations/route.ts':
    "POST's fallback is being rewritten by Lane M's in-flight fix/projects-honesty (it moves into " +
    'lib/db/conversationScope.ts). Editing the same lines here would be a merge conflict for no ' +
    'gain. CLOSES when that branch merges — delete this entry then and the test will tell you if ' +
    'the fallback is really gone.',
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

/** `src/app/api/quotes/[id]/route.ts` → `/quotes/[id]` */
function routeOf(file: string): string {
  return file
    .replace(/\\/g, '/')
    .replace(`${API_ROOT}`, '')
    .replace(/\/route\.ts$/, '')
}

/** Split a route file into one segment per exported HTTP handler. */
function handlers(src: string): { method: string; body: string }[] {
  const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g
  const found: { method: string; at: number }[] = []
  for (let m = re.exec(src); m; m = re.exec(src)) found.push({ method: m[1], at: m.index })
  return found.map((h, i) => ({
    method: h.method,
    body: src.slice(h.at, i + 1 < found.length ? found[i + 1].at : src.length),
  }))
}

test('every API route method resolves a user, or is an explicit public exception', () => {
  const files = walk(API_ROOT)
  // Guard the guard: a broken walk() would make this test pass by scanning nothing.
  assert.ok(files.length >= 25, `scanned too few route files (${files.length}) — is API_ROOT wrong?`)

  const open: string[] = []
  let checked = 0

  for (const file of files) {
    const route = routeOf(file)
    const src = readFileSync(file, 'utf8')
    const hs = handlers(src)
    assert.ok(hs.length > 0, `${route}: no exported HTTP handler found — did the export shape change?`)

    for (const h of hs) {
      const key = `${route} ${h.method}`
      if (key in PUBLIC) continue
      checked++
      if (!AUTH_CALL.test(h.body)) open.push(key)
    }
  }

  assert.ok(checked >= 30, `only ${checked} handlers were actually checked — allowlist too broad?`)
  assert.deepEqual(
    open,
    [],
    `these API handlers are reachable with no signed-in user:\n  ${open.join('\n  ')}\n\n` +
      'Add `const userId = await getRequestUserId(req); if (!userId) return unauthorized()` — or, ' +
      'if the endpoint is genuinely public, add it to PUBLIC in this file WITH THE REASON.'
  )
})

test('no API route pools anonymous callers into DEMO_USER_ID', () => {
  const offenders: string[] = []
  for (const file of walk(API_ROOT)) {
    const route = routeOf(file)
    const key = `${route}/route.ts`.replace(/^\/+/, '/')
    if (key in DEMO_USER_EXCEPTIONS) continue
    if (/DEMO_USER_ID/.test(readFileSync(file, 'utf8'))) offenders.push(route)
  }
  assert.deepEqual(
    offenders,
    [],
    `these routes still fall back to the shared demo identity:\n  ${offenders.join('\n  ')}\n\n` +
      'DEMO_USER_ID owns real rows. Falling back to it means an anonymous request reads and ' +
      "writes that identity's data. Return unauthorized() instead."
  )
})

test('the public allowlist stays small and every entry states its reason', () => {
  for (const [key, reason] of Object.entries(PUBLIC)) {
    assert.ok(reason.trim().length > 20, `PUBLIC["${key}"] needs a real reason, not a placeholder`)
  }
  // Not a style rule: this list is the entire anonymous attack surface of the API. It should be
  // read in full by a human whenever it grows, and a hard ceiling forces that to happen.
  assert.ok(
    Object.keys(PUBLIC).length <= 8,
    `${Object.keys(PUBLIC).length} public API handlers — that is the whole anonymous surface. ` +
      'If it genuinely needs to grow, raise this number deliberately and say why in the commit.'
  )
})
