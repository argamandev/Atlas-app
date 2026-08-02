import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE API AUTH BOUNDARY.
//
// Every HTTP method of every route under src/app/api must BOTH resolve a signed-in user AND
// refuse when there is none, unless it is listed as PUBLIC below with a reason.
//
// WHY A STRUCTURAL TEST RATHER THAN "we fixed the routes": the holes this closes were not one
// mistake, they were a DRIFT. Routes were added over months, each one reasonable on its own,
// and the fleet's own notes described the damage as "two routes" when a command found 16 call
// sites across 8 files. A per-route fix rots the same way; a guard that runs in the battery
// does not.
//
// THE FIRST VERSION OF THIS FILE WAS ITSELF TOO WEAK, and a cold reviewer caught it the same
// day (2026-08-03). Every rule below with a "was" attached exists because the guard passed
// something it should have failed. Read them before loosening anything:
//
//  1. It matched the mere PRESENCE of an auth call, so `POST /api/conversations` — which called
//     `getRequestUserId`, discarded the null and wrote the row as `DEMO_USER_ID` — counted as
//     authenticated. A route that asks who you are and then ignores the answer is not gated.
//     Now: the handler must contain a refusal too.
//  2. It scanned raw source, so a COMMENT quoting `getRequestUserId(req)` satisfied it. The
//     guard could not tell code from prose, and this file's own author had written exactly such
//     a comment in `api/chat/route.ts`. Now: comments and string literals are stripped first.
//  3. It sliced each handler from its declaration to the NEXT declaration, so a helper defined
//     BETWEEN two handlers counted toward the earlier one. `transcripts/[id]/route.ts` already
//     has that shape (`requireAdmin` sits between two handlers). Now: bodies are brace-matched.
//  4. It only recognised `export async function GET(`, so a file mixing that with
//     `export const GET = async …` yielded a silently unchecked handler. Now: both shapes, all
//     seven methods, and an UNPARSEABLE shape fails loudly instead of passing.
//
// WHAT IT STILL CANNOT SEE, stated so nobody trusts it further than it goes. This is a TEXT
// scan, not a type or flow analysis. It proves each handler resolves a caller and has a refusal
// path — not that the refusal is reachable, and not that the caller may touch the specific row
// it goes on to read. Ownership filtering is a separate obligation living in the lib/db modules
// (see .claude/rules/app.md: supabaseAdmin bypasses RLS, so RLS protects only what queries
// through the USER's client). It also only scans routes: a PAGE that falls back to a shared
// identity is invisible to the first test, which is why the second one scans all of src/app.
// ─────────────────────────────────────────────────────────────────────────────

const API_ROOT = 'src/app/api'
const APP_ROOT = 'src/app'

const METHODS = 'GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS'

/**
 * Resolving who the caller is. A CLOSED list on purpose: a handler that delegates to some other
 * helper is flagged rather than trusted, because the guard cannot know that an arbitrary
 * function authenticates. Adding a new auth helper therefore means adding it here — one
 * deliberate line — and that is the intended cost. Verified by fixture: a handler calling an
 * unregistered `guard(req)` helper fails, which is the safe direction.
 */
const AUTH_FNS = 'getRequestUserId|resolveUser|requireAdmin|getCurrentUser'
const AUTH_CALL = new RegExp(`\\b(?:${AUTH_FNS})\\s*\\(`)

/**
 * Is this handler's auth RESULT actually acted on?
 *
 * The check is BOUND to the variable the auth call was assigned to. A second reviewer round
 * (2026-08-03) showed that an unbound "does the body contain a refusal" test is worthless: the
 * original BLOCKER shape — resolve a user, discard it — still passed four different ways, because
 * an unrelated `if (cached) return cached`, an upstream `if (up.status === 401)`, or even a
 * never-called arrow returning 401 all satisfied a loose token search. Binding kills all four.
 *
 * Accepted shapes, which are the ones the codebase actually uses:
 *   const userId = await getRequestUserId(req);  if (!userId) return unauthorized()
 *   const user   = await resolveUser(supabase);  if (!user)   return … 401 …
 *   const denied = await requireAdmin();         if (denied)  return denied     ← delegation
 *
 * STATED LIMIT: this proves the result is CHECKED, not that the check happens before anything
 * expensive or side-effecting. Ordering is a real property and this cannot see it — `/api/chat`
 * had its refusal below `getChatContext` and only a human reading caught that.
 */
function authVerdict(body: string): 'ok' | 'no-auth' | 'unchecked' {
  const assign = new RegExp(
    `(?:const|let|var)\\s+(\\w+)\\s*(?::[^=;]+)?=\\s*await\\s+(?:${AUTH_FNS})\\s*\\(`,
    'g'
  )
  const bound: string[] = []
  for (let m = assign.exec(body); m; m = assign.exec(body)) bound.push(m[1])
  if (bound.length === 0) return AUTH_CALL.test(body) ? 'unchecked' : 'no-auth'
  for (const id of bound) {
    const negated = new RegExp(`if\\s*\\(\\s*!\\s*${id}\\b[^)]*\\)\\s*(?:return|\\{)`)
    const delegated = new RegExp(`if\\s*\\(\\s*${id}\\s*\\)\\s*return\\s+${id}\\b`)
    if (negated.test(body) || delegated.test(body)) return 'ok'
  }
  return 'unchecked'
}

/**
 * Methods deliberately reachable without a session. Keyed `<route> <METHOD>`.
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

  // ── NOT "by design" — an OPEN ITEM, dated 2026-08-03. ────────────────────────────────────
  // These proxy the live engine and serve real call captions and audio, so anonymous access to
  // them IS content exposure.
  // A FIRST VERSION OF THIS COMMENT CLAIMED the exposure was bounded because "they proxy a
  // localhost-only engine, so a deployed Atlas cannot reach it". The reviewer refuted it from
  // the routes themselves: both read `process.env.LIVE_ENGINE_URL || 'http://localhost:8788'`,
  // and `live/state/route.ts` says that variable exists precisely to "point the deploy at a
  // tunnelled local engine". So the bound holds ONLY while LIVE_ENGINE_URL is unset — which is
  // a deploy-time configuration, not a property of the code. Setting it on Railway opens these
  // two routes to the world in the same breath.
  // Closing them safely needs a live run with the engine up (.claude/rules/live.md) and a
  // latency measurement on /pcm, which is polled continuously.
  // ⇒ MUST BE CLOSED BEFORE `LIVE_ENGINE_URL` IS EVER SET IN A DEPLOYED ENVIRONMENT.
  //   Tracked in docs/V1-SECURITY-AND-LAUNCH-NOTES.md.
  '/live/pcm GET':
    'OPEN ITEM — proxies the live engine; MUST be gated before LIVE_ENGINE_URL is set on a deploy',
  '/live/state GET':
    'OPEN ITEM — proxies the live engine; MUST be gated before LIVE_ENGINE_URL is set on a deploy',
}

function walk(dir: string, match: (name: string) => boolean): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, match))
    else if (match(name)) out.push(p)
  }
  return out
}

/**
 * Blank out comments and string/template literals, preserving length and newlines so offsets
 * and any reported line numbers stay meaningful. Without this the guard cannot tell a real call
 * from one quoted in a comment — see note 2 in the header.
 *
 * Known limit: a regex literal containing a quote character would confuse the scanner. No route
 * file has one today; if that changes, this needs a regex-literal state as well.
 */
function blankNonCode(src: string): string {
  let out = ''
  let i = 0
  const keep = (ch: string) => (ch === '\n' ? '\n' : ' ')
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') out += keep(src[i++])
      continue
    }
    if (c === '/' && d === '*') {
      out += '  '
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) out += keep(src[i++])
      out += '  '
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      out += ' '
      i++
      while (i < src.length) {
        if (src[i] === '\\') {
          out += '  '
          i += 2
          continue
        }
        if (src[i] === c) {
          out += ' '
          i++
          break
        }
        out += keep(src[i++])
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * `blankNonCode` with a CANARY, because its one failure mode is silent and dangerous.
 *
 * The scanner has no regex-literal state, so a regex containing an unmatched quote — `/[']/` —
 * flips its string parity and blanks the REST OF THE FILE. Everything after it then looks like
 * empty space: a handler with no auth, or a live `?? DEMO_USER_ID`, becomes invisible, and the
 * test passes. The second review round demonstrated exactly that. Teaching the scanner regex
 * literals properly means implementing JavaScript's regex/division ambiguity, which is a bad
 * trade inside a guard.
 *
 * So instead: verify the blanking did not eat code. Every line that STARTS with `import ` or
 * `export ` in the raw file must still start with it after blanking — a parity flip wipes them,
 * and no such line can legitimately vanish. Cheap, and it converts the silent failure into a
 * loud one, which is the only property that matters here.
 */
function blanked(raw: string, file: string): string {
  const out = blankNonCode(raw)
  const count = (s: string) => (s.match(/^[ \t]*(?:import|export)\s/gm) ?? []).length
  const before = count(raw)
  const after = count(out)
  assert.equal(
    after,
    before,
    `${file}: comment/string blanking lost ${before - after} import/export line(s). That means a ` +
      'construct this scanner cannot parse — almost certainly a regex literal containing a quote ' +
      '— flipped its parity and blanked the rest of the file, which would hide real code from ' +
      'this guard. Fix the scanner or rewrite the construct; do NOT relax this check.'
  )
  return out
}

/** Index of the character after the parenthesis group opening at `open`. */
function matchDelim(src: string, open: number, o: string, c: string): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++
    else if (src[i] === c) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Split a route file into one segment per exported HTTP handler, each segment being exactly that
 * handler's own body — brace-matched, so a helper declared between two handlers belongs to
 * neither (note 3 in the header).
 */
function handlers(code: string, route: string): { method: string; body: string }[] {
  const re = new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+|const\\s+)(${METHODS})\\b`, 'g')
  const out: { method: string; body: string }[] = []
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const method = m[1]
    const paren = code.indexOf('(', m.index + m[0].length)
    const brace = code.indexOf('{', m.index + m[0].length)
    assert.ok(
      paren !== -1,
      `${route} ${method}: no parameter list found — the guard cannot parse this handler shape ` +
        'and must be taught it rather than silently skipping it.'
    )
    const closeParen = matchDelim(code, paren, '(', ')')
    assert.ok(closeParen !== -1, `${route} ${method}: unbalanced parameter list`)
    const bodyOpen = code.indexOf('{', closeParen)
    assert.ok(
      bodyOpen !== -1 && (brace === -1 || brace > paren),
      `${route} ${method}: no body block found — the guard cannot parse this handler shape.`
    )
    // Anything other than a return type / `=>` between the params and the body means this is a
    // call expression (`export const GET = withAuth(handler)`), not a function we can read.
    assert.ok(
      !code.slice(closeParen + 1, bodyOpen).includes('('),
      `${route} ${method}: handler is produced by a call expression, so the guard cannot see ` +
        'whether it authenticates. Teach the guard this shape or inline the handler.'
    )
    const bodyClose = matchDelim(code, bodyOpen, '{', '}')
    assert.ok(bodyClose !== -1, `${route} ${method}: unbalanced body`)
    out.push({ method, body: code.slice(bodyOpen, bodyClose + 1) })
  }
  return out
}

/**
 * Fail loudly on a handler exported by RE-EXPORT — `export { doWrite as POST, doWrite as DELETE }`
 * — which is a normal Next.js shape and which `handlers()` cannot see, because there is no
 * declaration to brace-match. Left undetected it is the worst possible failure: the file still
 * contains one recognised `export async function GET`, so `hs.length > 0` is satisfied and the
 * MUTATING methods are silently unchecked. The second review round proved exactly that against
 * the previous version, which had claimed unparseable shapes "fail loudly". They did not.
 */
function assertNoReExportedHandlers(code: string, route: string, found: string[]): void {
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (!name || !new RegExp(`^(?:${METHODS})$`).test(name)) continue
      assert.ok(
        found.includes(name),
        `${route}: \`${name}\` is exported by re-export (\`${m[0].trim()}\`). The guard cannot ` +
          'see whether it authenticates, so it must not pass silently. Declare the handler ' +
          'directly (`export async function ' +
          name +
          '(…)`) or teach the guard this shape.'
      )
    }
  }
}

/** `src/app/api/quotes/[id]/route.ts` → `/quotes/[id]` */
function routeOf(file: string): string {
  return file
    .replace(/\\/g, '/')
    .replace(API_ROOT, '')
    .replace(/\/route\.ts$/, '')
}

test('every API route handler resolves a user AND refuses without one', () => {
  const files = walk(API_ROOT, (n) => n === 'route.ts')
  // Guard the guard: a broken walk() would make this test pass by scanning nothing.
  assert.ok(files.length >= 25, `scanned too few route files (${files.length}) — is API_ROOT wrong?`)

  const open: string[] = []
  let checked = 0

  for (const file of files) {
    const route = routeOf(file)
    const raw = readFileSync(file, 'utf8')
    const code = blanked(raw, file)
    const hs = handlers(code, route)
    assert.ok(hs.length > 0, `${route}: no exported HTTP handler found — did the export shape change?`)
    assertNoReExportedHandlers(
      code,
      route,
      hs.map((h) => h.method)
    )

    for (const h of hs) {
      const key = `${route} ${h.method}`
      if (key in PUBLIC) continue
      checked++
      const verdict = authVerdict(h.body)
      if (verdict === 'no-auth') open.push(`${key} — resolves no user`)
      else if (verdict === 'unchecked') open.push(`${key} — resolves a user but never acts on the result`)
    }
  }

  assert.ok(checked >= 30, `only ${checked} handlers were actually checked — allowlist too broad?`)
  assert.deepEqual(
    open,
    [],
    `these API handlers are not gated:\n  ${open.join('\n  ')}\n\n` +
      'The pattern is two lines: `const userId = await getRequestUserId(req)` then ' +
      '`if (!userId) return unauthorized()`. If the endpoint is genuinely public, add it to ' +
      'PUBLIC in this file WITH THE REASON.'
  )
})

test('nothing under src/app falls back to the shared DEMO_USER_ID identity', () => {
  // Deliberately the WHOLE app tree, not just the API. The fallback also lived in two server
  // components (`app/company/[id]/page.tsx`, `app/calendar/page.tsx`), which rendered another
  // identity's quotes, folders and followed calls as the visitor's own whenever getCurrentUser()
  // came back empty — invisible to a routes-only scan.
  // blankNonCode first: NAMING the constant in a comment is how these fixes explain themselves,
  // and several of them do. Only a real reference counts.
  const offenders = walk(APP_ROOT, (n) => n.endsWith('.ts') || n.endsWith('.tsx'))
    .filter((f) => /DEMO_USER_ID/.test(blanked(readFileSync(f, 'utf8'), f)))
    .map((f) => f.replace(/\\/g, '/'))

  assert.deepEqual(
    offenders,
    [],
    `these files still reference the shared demo identity:\n  ${offenders.join('\n  ')}\n\n` +
      'DEMO_USER_ID owns real rows. Falling back to it means an unidentified caller reads and ' +
      "writes that identity's data. Refuse, or render nothing — never someone else's data."
  )
})

test('the public allowlist stays small and every entry states its reason', () => {
  for (const [key, reason] of Object.entries(PUBLIC)) {
    assert.ok(reason.trim().length > 20, `PUBLIC["${key}"] needs a real reason, not a placeholder`)
  }
  // Not a style rule: this list is the entire anonymous attack surface of the API — a claim that
  // is only true because the first test now checks refusal, not just presence of an auth call.
  // It should be read in full by a human whenever it grows, and a hard ceiling forces that.
  assert.ok(
    Object.keys(PUBLIC).length <= 8,
    `${Object.keys(PUBLIC).length} public API handlers — that is the whole anonymous surface. ` +
      'If it genuinely needs to grow, raise this number deliberately and say why in the commit.'
  )
})
