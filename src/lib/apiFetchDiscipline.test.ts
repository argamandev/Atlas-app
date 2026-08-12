import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// EVERY DIRECT /api FETCH LOOKS AT ITS RESPONSE.
//
// The law (rules/app.md): gating an endpoint changes every caller's ERROR path, not just its
// happy path. This test is the mechanical slice of it, bought by the law's SECOND occurrence
// (ADR-0002): first the LiveSession finish-poll treated a 401 body as "still processing" and
// re-polled forever (2026-08-03); then `renameSpeaker` in LiveTranscriptView awaited a fetch,
// ignored the response, and toasted "saved" for a write the server had refused (caught in
// review, 2026-08-13). Both defects share one shape — a response nobody read — and THAT shape
// a scan can see.
//
// THE RULE: a direct `fetch('/api/…')` / `fetch(`/api/…`)` call site must reference `.ok` or
// `.status` within its following 12 lines, or be accounted for in UNINSPECTED below — a
// per-file RATCHET of deliberately fire-and-forget or benign-parse sites, each with its
// reason. A new unaccounted site fails; fixing an accounted one fails too (update the count
// downward, deliberately). `src/lib/api/client.ts` is exempt as a directory rule: it IS the
// centralized inspector (`handleResponse` owns what a failed request throws).
//
// STATED LIMITS (M1): this proves the response is LOOKED AT, not that the reaction is right —
// reverting optimistic state vs `loginRedirectTarget` vs a message is judgment the law's
// VERIFY sweep still owns. A fetch whose URL lives in a variable is invisible to the scan
// (none exist under src today outside lib/api); the 12-line window is a heuristic, and a
// site that inspects the response further away should be restructured, not allowlisted.
// `.status` on a PARSED BODY (CompanyOverview reads the finish route's `{status}` field)
// satisfies the scan too — textually indistinguishable from Response.status, and reading the
// body's outcome field is outcome inspection for that endpoint.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = 'src'
const EXEMPT_DIRS = [join('src', 'lib', 'api')]

/**
 * Deliberately-uninspected sites, per file, with the reason they are allowed to stay so.
 * A ratchet: the scan must find EXACTLY this many uninspected sites in each file.
 */
const UNINSPECTED: Record<string, { count: number; why: string }> = {
  'src/components/app/LiveNowPanel.tsx': {
    count: 1,
    why: 'polls the PUBLIC /api/live/state inside try/catch; a failed poll renders no live badge, which is the honest default',
  },
  'src/components/live/LiveSession.tsx': {
    count: 3,
    why: 'finish probe + the two finish POST triggers: their .catch sets idle/failed, and the 401 answer lives in startPolling, which owns the redirect (its own site DOES inspect .status)',
  },
  'src/lib/live/LiveAudioProvider.tsx': {
    count: 1,
    why: 'public state poll; the engine-restart heuristic tolerates any body and the catch keeps the last known world',
  },
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

// A direct fetch whose FIRST argument is a literal starting with /api — quote or template.
const FETCH_SITE = /\bfetch\(\s*(['"`])\/api\//g

test('every direct /api fetch inspects its response, or is ratcheted with a reason', () => {
  const failures: string[] = []
  const seen: Record<string, number> = {}

  for (const file of walk(ROOT)) {
    const rel = file.replace(/\\/g, '/')
    if (EXEMPT_DIRS.some((d) => file.startsWith(d))) continue
    const lines = readFileSync(file, 'utf8').split('\n')

    lines.forEach((line, i) => {
      FETCH_SITE.lastIndex = 0
      if (!FETCH_SITE.test(line)) return
      const window = lines.slice(i, i + 12).join('\n')
      const inspected = /\.(ok|status)\b/.test(window)
      if (!inspected) {
        seen[rel] = (seen[rel] ?? 0) + 1
        if ((seen[rel] ?? 0) > (UNINSPECTED[rel]?.count ?? 0)) {
          failures.push(`${rel}:${i + 1} — fetch to /api whose response nothing reads`)
        }
      }
    })
  }

  assert.deepEqual(
    failures,
    [],
    `Direct /api fetches with an unread response (the LiveSession-401 / renameSpeaker-toast defect shape).\n` +
      `Read the response (.ok / .status) and answer its 401, or — for a genuinely benign ` +
      `fire-and-forget — raise its file's count in UNINSPECTED with the reason:\n` +
      failures.join('\n')
  )

  // The ratchet's other jaw: an entry whose sites were fixed must shrink, not linger.
  for (const [rel, { count }] of Object.entries(UNINSPECTED)) {
    assert.equal(
      seen[rel] ?? 0,
      count,
      `${rel}: UNINSPECTED says ${count} uninspected site(s), the scan found ${seen[rel] ?? 0} — update the ratchet deliberately`
    )
  }
})
