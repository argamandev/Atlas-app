import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { curationVerdict, CURATION_REFUSAL_STATUS } from './auth/curation'

// ─────────────────────────────────────────────────────────────────────────────
// CURATION ROUTES ARE ADMIN-GATED.
//
// Writes that change what EVERY user sees — fixing a speaker's name, re-diarizing a call —
// are corpus curation, admin-only (docs/DATA-MODEL.md "Writes to the shared corpus are
// CURATION", founder decision 2026-08-13, smart-layer ticket 12).
//
// WHY THIS EXISTS AS ITS OWN TEST: `apiAuthBoundary.test.ts` proves a user was RESOLVED and
// the result acted on — it cannot see whether the RIGHT user was allowed. The speakers and
// diarization routes passed that test for ten days while letting any signed-in user rewrite
// speaker attribution on any transcript (and, through `renameSpeakerInQuotes`, other users'
// saved quotes). That gap is exactly where an authorization check drifts out silently, so the
// law gets its own guard: every route listed here must delegate to `requireAdmin` using the
// canonical shape the boundary test also recognises:
//
//   const denied = await requireAdmin(req);  if (denied) return denied
//
// Adding a new curation route (a write to shared-corpus rows that is not owner-scoped) means
// adding it to this list — one deliberate line, same cost model as the boundary test's PUBLIC
// allowlist.
//
// TWO HALVES, on purpose (first review round, 2026-08-13): the structural half below proves
// the routes DELEGATE to the gate; the behavioral half executes the gate's DECISION — every
// branch of `curationVerdict`, including non-admin → forbidden → 403 — so the refusal is not
// merely present by shape but demonstrated by run. The IO seam (`requireAdmin` resolving the
// caller and reading profiles.role) is what remains structural-only.
//
// STATED LIMITS (M1): the structural check is file-level, which equals handler-level only
// while each of these files exports a single handler — the companion `one handler each`
// assertion below pins that premise so it cannot rot silently. It proves the gate is PRESENT,
// not that it runs before side effects; ordering still needs a human reading the route.
// ─────────────────────────────────────────────────────────────────────────────

test('the curation verdict refuses everyone but an admin, fail-closed', () => {
  // no user → unauthorized, whatever the role claims to be
  assert.equal(curationVerdict(null, undefined), 'unauthorized')
  assert.equal(curationVerdict(null, 'admin'), 'unauthorized')
  // a resolved user is not an authorized one: only profiles.role === 'admin' passes
  assert.equal(curationVerdict('uid-1', 'admin'), 'ok')
  // the branch the live defect lived in — a real signed-in user who is NOT an admin
  assert.equal(curationVerdict('uid-1', 'user'), 'forbidden')
  // fail-closed: a missing profile row, a null role, or garbage is forbidden, never ok
  assert.equal(curationVerdict('uid-1', null), 'forbidden')
  assert.equal(curationVerdict('uid-1', undefined), 'forbidden')
  assert.equal(curationVerdict('uid-1', 'Admin'), 'forbidden')
  assert.equal(curationVerdict('uid-1', ''), 'forbidden')
})

test('each refusal carries its HTTP meaning: unauthorized → 401, forbidden → 403', () => {
  assert.equal(CURATION_REFUSAL_STATUS.unauthorized, 401)
  assert.equal(CURATION_REFUSAL_STATUS.forbidden, 403)
})

const CURATION_ROUTES: Record<string, string> = {
  'src/app/api/transcripts/[id]/speakers/route.ts':
    'renames a speaker for every viewer and propagates into every user’s saved quotes',
  'src/app/api/transcripts/[id]/diarization/route.ts':
    'rebuilds the whole transcript’s speaker attribution for every viewer',
}

// Strip comments so prose quoting `requireAdmin` cannot satisfy the check — the boundary
// test's note 2, learned the hard way. Trailing `//` comments are stripped only on lines with
// no quote character before the slashes, so a `//` inside a string can never eat real code;
// the residue (a trailing comment on a line that also holds a string) is accepted and stated.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, '$1')
}

for (const [route, why] of Object.entries(CURATION_ROUTES)) {
  test(`curation route is admin-gated: ${route} (${why})`, () => {
    const code = stripComments(readFileSync(join(process.cwd(), route), 'utf8'))

    assert.match(
      code,
      /import\s*\{[^}]*\brequireAdmin\b[^}]*\}\s*from\s*['"]@\/lib\/auth['"]/,
      `${route} must import requireAdmin from @/lib/auth`
    )
    assert.match(
      code,
      /const\s+denied\s*=\s*await\s+requireAdmin\s*\(\s*req\s*\)/,
      `${route} must call requireAdmin(req) — curation writes are admin-only`
    )
    assert.match(
      code,
      /if\s*\(\s*denied\s*\)\s*return\s+denied\b/,
      `${route} must return the refusal requireAdmin produced`
    )

    // The premise that makes a file-level check a handler-level one: exactly one handler.
    const handlers =
      code.match(/export\s+async\s+function\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g) ?? []
    assert.equal(
      handlers.length,
      1,
      `${route} now exports ${handlers.length} handlers — this test checked the FILE, so re-verify each handler delegates to requireAdmin, then update this premise`
    )
  })
}
