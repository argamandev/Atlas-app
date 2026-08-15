import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// EVERY SINGLE-ROW SUPABASE READ THAT DROPS ITS ERROR IS ACCOUNTED FOR.
//
// The law (rules/app.md): gating an endpoint changes every caller's ERROR path
// — and never invent a cause. `supabaseWriteDiscipline.test.ts` holds the write
// slice and STATED this gap in its own limits: "`const { data } = …` without
// `error` still passes the scan while reading nothing that matters." The
// FOURTH filing of the discarded-{error} class came through exactly that gap
// (review finding 2026-08-13, slice A3): `resolveFinishCompanyId` dropped the
// error on a companies read, so a transient DB failure threw "cannot attribute
// … to a TASE issuer" — an INVENTED CAUSE for a read that never happened.
//
// THE RULE: a destructure of an awaited supabase client whose chain (up to the
// next await) contains `.single(` / `.maybeSingle(` — "one row I will now decide
// on" — or `.rpc(` (same never-throws contract, named an unscanned channel by
// the round-3 review of slice A3) must capture `error`, or be accounted for in
// DROPPED below, a per-file ratchet with the reason. A new unaccounted site fails; fixing an accounted
// one fails too (shrink the ratchet deliberately). Fail-closed reads (a failure
// DENIES) may stay ratcheted; a read whose failure INVENTS a state may not.
//
// STATED LIMITS (M1): single/maybeSingle chains only — list reads that drop
// `error` render absence, which the degradation-visible law owns at the surface
// (M4), not this scan. A client in a differently-named variable is invisible.
// Both stated, not license.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = 'src'

/** Deliberately error-dropping single-row reads, per file, with the reason. A ratchet. */
const DROPPED: Record<string, { count: number; why: string }> = {
  'src/app/api/admin/requests/route.ts': {
    count: 1,
    why: 'admin-role gate: a failed profile read yields no role → 403. Fail-closed; a read failure denies, never grants',
  },
  'src/app/api/live/finish/route.ts': {
    count: 2,
    why: 'status poll + already-running check on the known demo row: a failed read renders "none" / re-fires an idempotent finish — degraded, never inventing success',
  },
  'src/app/api/transcripts/route.ts': {
    count: 1,
    why: 'isAdminUser profile read: fail-closed (no role → 403 on the force path)',
  },
  'src/app/api/transcripts/[id]/route.ts': {
    count: 4,
    why: 'two admin-role gates (fail-closed), one best-effort audio_url read for post-delete cleanup, one PATCH formatted_data read whose failure returns 404 — none invents a state',
  },
  'src/app/app/chat/page.tsx': {
    count: 1,
    why: 'newest-transcript convenience read on a server component; failure renders the empty chat state (pre-existing; the degradation-visible law owns the surface)',
  },
  'src/lib/auth.ts': {
    count: 1,
    why: 'requireAdmin profile read: fail-closed',
  },
  'src/lib/db/transcripts.ts': {
    count: 1,
    why: 'renameSpeaker overlay read: failure rebuilds the override map from empty — lossy but display-only overlay, and the write that persists it IS read (pre-existing shape, kept until overlays join the consistency unit)',
  },
  'src/lib/documents/index.ts': {
    count: 2,
    why: 'document + page lookups whose null renders the 404/empty state (pre-existing)',
  },
  'src/lib/live/finishLiveCall.ts': {
    count: 2,
    why: 'resolveOwnerUserId fallback chain: admin profile → newest transcript → fixed uuid; a failed read falls through to the next FK-valid owner, never invents one',
  },
  'src/lib/live/loadCall.ts': {
    count: 1,
    why: 'completed-call load: null (from absence or failure) renders the not-found state (pre-existing)',
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

const DESTRUCTURE = /const\s*\{([^}]*)\}\s*=\s*await\s+(supabaseAdmin|supabase)\b/g
const SINGLE_ROW = /\.(single|maybeSingle|rpc)\(/

test('every single-row supabase read captures its error, or is ratcheted with a reason', () => {
  const failures: string[] = []
  const seen: Record<string, number> = {}

  for (const file of walk(ROOT)) {
    const rel = file.replace(/\\/g, '/')
    const text = readFileSync(file, 'utf8')

    DESTRUCTURE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = DESTRUCTURE.exec(text)) !== null) {
      // The awaited chain: up to the next `await` (or 400 chars) — spans a
      // multi-line builder without leaking into the next statement.
      const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 400)
      const nextAwait = rest.search(/\bawait\b/)
      const chain = nextAwait === -1 ? rest : rest.slice(0, nextAwait)
      if (!SINGLE_ROW.test(chain)) continue
      if (/\berror\b/.test(m[1])) continue

      seen[rel] = (seen[rel] ?? 0) + 1
      if ((seen[rel] ?? 0) > (DROPPED[rel]?.count ?? 0)) {
        const line = text.slice(0, m.index).split('\n').length
        failures.push(`${rel}:${line} — single-row supabase read whose error nothing captures`)
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Single-row supabase reads that drop { error } (the resolveFinishCompanyId invented-cause shape).\n` +
      `A failed read is not a verdict about the row — capture { error } and say WHICH thing failed, ` +
      `or for a genuinely fail-closed read raise its file's count in DROPPED with the reason:\n` +
      failures.join('\n')
  )

  // The ratchet's other jaw: an entry whose sites were fixed must shrink, not linger.
  for (const [rel, { count }] of Object.entries(DROPPED)) {
    assert.equal(
      seen[rel] ?? 0,
      count,
      `${rel}: DROPPED says ${count} error-dropping read(s), the scan found ${seen[rel] ?? 0} — update the ratchet deliberately`
    )
  }
})
