import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ApiError, isUnauthorized, handleResponse } from './client'

/**
 * Two guards over one invariant: a failed request must arrive at the UI carrying
 * its HTTP status.
 *
 * WHY THIS EXISTS. `ErrorLine` renders a sign-in route instead of a dead-end
 * error when `isUnauthorized(err)` is true, and that predicate tests
 * `err instanceof ApiError`. The repo had TWO fetch layers. `lib/api/client.ts`
 * threw `ApiError`; `lib/projects/client.ts` threw a plain `Error`, losing the
 * status. So four of the eight error banners could never reach their 401 branch
 * — and they were the four on the Projects screens, i.e. exactly the screens the
 * work was about.
 *
 * It survived a review round because the coverage claim was checked with
 * `git grep -c "auth={{ expired:"`, which counts the PROP. Every site had the
 * prop. Half of them could not use it. **A command answers the question you
 * typed, not the question you meant** — so the check below asserts the
 * BEHAVIOUR reachable from each site, not the presence of an attribute.
 *
 * STATED LIMITS — this is a TEXT scan, and saying "reachable" without saying
 * what it cannot reach would repeat the failure it exists for:
 *
 * 1. **Direct `@/…` imports only.** A module imported RELATIVELY (`./Foo`) is
 *    never visited, and neither is anything two hops away. If a banner
 *    component grows a data layer behind a re-export, this will not see it.
 * 2. **`blankComments` is not a JS parser.** A `//` inside a string literal
 *    truncates that line, and a `/*` inside one blanks to the next `*​/`. That
 *    usually fails SAFE (a real `handleResponse` hidden → false positive), but
 *    a `fetch(` hidden that way fails OPEN: the module drops out of scope. The
 *    canary only catches TOTAL destruction, not a single mangled line.
 * 3. It proves the module can PRODUCE an `ApiError`, not that every one of its
 *    paths does, and not that the component renders the branch correctly.
 *
 * What closes 1 and 2 properly is a real import graph, not a bigger regex. Until
 * then, treat a pass as "no DIRECT dependency is obviously wrong".
 */

const SRC = resolve(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/**
 * Blank comments so the scan reads CODE, not prose.
 *
 * Learned the hard way twice. `apiAuthBoundary.test.ts` was fixed for exactly
 * this last week — a comment quoting `getRequestUserId(req)` satisfied it — and
 * the first version of THIS guard repeated the mistake within the hour: the
 * explanatory comment in `lib/projects/client.ts` contains the word `ApiError`,
 * so when the fix was reverted to prove the guard bites, it did not bite. A
 * guard that reads its own documentation as evidence proves nothing.
 */
function blankComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '')
}

/** `@/lib/foo/bar` → the file it resolves to, or null. */
function resolveAlias(spec: string): string | null {
  if (!spec.startsWith('@/')) return null
  const base = resolve(SRC, spec.slice(2))
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(cand)) return cand
  }
  return null
}

test('every data module reachable from a 401-capable error banner throws ApiError', () => {
  const files = walk(SRC)
  const sites = files.filter((f) => readFileSync(f, 'utf8').includes('auth={{ expired:'))

  // If this is 0 the test is vacuous and is no longer guarding anything.
  assert.ok(sites.length > 0, 'no ErrorLine site with an auth prop was found — has the prop been renamed?')

  const offenders: string[] = []
  for (const site of sites) {
    const src = readFileSync(site, 'utf8')
    for (const m of src.matchAll(/from\s+'(@\/[^']+)'/g)) {
      const dep = resolveAlias(m[1])
      if (!dep) continue
      const raw = readFileSync(dep, 'utf8')
      const depSrc = blankComments(raw)

      // Canary: blanking must not eat the module. If every import/export line
      // vanished, the stripper mis-parsed and every check below is vacuously
      // true — fail loudly instead of silently passing.
      const importLines = (s: string) => (s.match(/^\s*(?:import|export)\b/gm) ?? []).length
      assert.ok(
        importLines(raw) === 0 || importLines(depSrc) > 0,
        `comment blanking destroyed ${dep.replace(SRC, 'src')} — the scan below would be vacuous`
      )

      // Only modules that actually talk to the network are in scope.
      if (!depSrc.includes('fetch(')) continue
      if (!/handleResponse|ApiError/.test(depSrc)) {
        offenders.push(`${site.replace(SRC, 'src')} → ${dep.replace(SRC, 'src')}`)
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'These fetch layers feed an error banner that offers a sign-in route on 401, but throw a ' +
      'plain Error, so the status is lost and the 401 branch is unreachable. Route the failure ' +
      'through handleResponse() in lib/api/client.ts rather than writing a second throw:\n' +
      offenders.join('\n')
  )
})

test('a plain Error is NOT treated as an expired session', () => {
  assert.equal(isUnauthorized(new Error('unauthorized')), false)
  assert.equal(isUnauthorized('unauthorized'), false)
  assert.equal(isUnauthorized(null), false)
  assert.equal(isUnauthorized(undefined), false)
})

test('handleResponse turns a 401 into something isUnauthorized recognises', async () => {
  const res = new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  await assert.rejects(
    () => handleResponse(res),
    (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal((err as ApiError).status, 401)
      assert.equal((err as ApiError).message, 'unauthorized')
      assert.equal(isUnauthorized(err), true)
      return true
    }
  )
})

test('a non-401 failure keeps its status and is not an expired session', async () => {
  const res = new Response(JSON.stringify({ error: 'relation "x" does not exist' }), { status: 500 })
  await assert.rejects(
    () => handleResponse(res),
    (err: unknown) => {
      assert.equal((err as ApiError).status, 500)
      assert.equal(isUnauthorized(err), false)
      return true
    }
  )
})

test('a non-JSON error body still yields a status-carrying ApiError', async () => {
  const res = new Response('<html>gateway timeout</html>', { status: 504 })
  await assert.rejects(
    () => handleResponse(res),
    (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal((err as ApiError).status, 504)
      return true
    }
  )
})
