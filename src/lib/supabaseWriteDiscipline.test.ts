import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// EVERY AWAITED SUPABASE WRITE LOOKS AT ITS RESULT.
//
// The law (rules/app.md): gating an endpoint changes every caller's ERROR path, not just its
// happy path. `apiFetchDiscipline.test.ts` holds the /api-fetch slice of it; this test holds
// the slice that law's THIRD occurrence slipped through (review finding, 2026-08-13, slice A1):
// `finishLiveCall`'s processing-stub upserts awaited a supabase write and discarded the
// returned `{ error }`. The supabase client NEVER throws on a failed write — the error rides
// the result object — so a discarded result is a write that can fail in total silence. That
// mattered the day the DB gained `transcripts_company_required` (migration 027): the DB now
// legitimately refuses writes those call sites assumed infallible.
//
// THE RULE: an `await supabaseAdmin…` / `await supabase…` in STATEMENT POSITION (result
// discarded — the previous code character is `;`, `{`, `}`, `)` or file start) whose chain,
// up to the next `await`, calls a write verb (.insert/.upsert/.update/.delete/.remove, and —
// since the round-3 review of slice A3 named them as unscanned channels — .upload/.rpc) must
// not exist — read the result and react — or be accounted for in DISCARDED below, a per-file
// ratchet with the reason. A new unaccounted site fails; fixing an accounted one fails too
// (shrink the ratchet deliberately).
//
// STATED LIMITS (M1): this proves the result is CAPTURED, not that the reaction is right —
// which response a route returns for a refused write is judgment the law's VERIFY sweep owns.
// The scan sees only awaits whose expression BEGINS with a supabase client name (a client in
// a differently-named variable is invisible), and `const { data } = …` without `error` still
// passes the scan while reading nothing that matters. Both are heuristic gaps, stated, not
// license.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = 'src'

/** Deliberately-discarded write results, per file, each with its reason. A ratchet. */
const DISCARDED: Record<string, { count: number; why: string }> = {
  'src/app/api/transcripts/route.ts': {
    count: 4,
    why: 'four best-effort status marks inside failure/retry handling (three pipeline-failed marks in catch blocks, one stuck-record restart mark): the writes that matter (insert, reset, company link) are read; a failed status mark must not eat the pipeline error it is recording',
  },
  'src/app/api/transcripts/[id]/route.ts': {
    count: 2,
    why: 'delete cleanup: a failed scheduled_calls unlink surfaces through the delete itself (the FK then rejects it, and THAT error is read → 500); the storage-audio removal is best-effort on a row already gone, inside its own try/catch',
  },
  'src/app/api/live/finish/route.ts': {
    count: 2,
    why: 'the synchronous processing flip is cosmetic — runLiveBroadcastFinish upserts the same row and READS that error (throws → the catch marks failed); the failed-mark in the catch is failure bookkeeping that must not eat the pipeline error it is recording',
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

const WRITE_VERB = /\.(insert|upsert|update|delete|remove|upload|rpc)\(/
const AWAIT_SUPABASE = /\bawait\s+(supabaseAdmin|supabase)\b/g

test('every awaited supabase write captures its result, or is ratcheted with a reason', () => {
  const failures: string[] = []
  const seen: Record<string, number> = {}

  for (const file of walk(ROOT)) {
    const rel = file.replace(/\\/g, '/')
    const text = readFileSync(file, 'utf8')

    AWAIT_SUPABASE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = AWAIT_SUPABASE.exec(text)) !== null) {
      // Statement position = the result is discarded: the last CODE character before the
      // `await` is a statement/block boundary. Assignments (`= await`), returns, arrow
      // bodies and arguments all put something else there. Whole comment lines are skipped
      // when looking back — a comment ending in a period hid a real site from the first
      // version of this scan (the apiAuthBoundary lesson: blank comments before you grep).
      const beforeLines = text.slice(0, m.index).split('\n')
      // The await's own line: everything before it on that line is code context.
      let prev = ''
      for (let li = beforeLines.length - 1; li >= 0; li--) {
        const t = beforeLines[li].trim()
        if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
        // Trim a trailing line comment only when it is quote-free — `'live://x'` must survive.
        prev = t
          .replace(/\/\/[^'"`]*$/, '')
          .trimEnd()
          .slice(-1)
        break
      }
      if (prev !== '' && prev !== ';' && prev !== '{' && prev !== '}' && prev !== ')') continue

      // The awaited chain: from this await up to the next `await` token (or 400 chars) —
      // enough to span a multi-line builder chain without leaking into the next statement.
      const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 400)
      const nextAwait = rest.search(/\bawait\b/)
      const chain = nextAwait === -1 ? rest : rest.slice(0, nextAwait)
      if (!WRITE_VERB.test(chain)) continue

      seen[rel] = (seen[rel] ?? 0) + 1
      if ((seen[rel] ?? 0) > (DISCARDED[rel]?.count ?? 0)) {
        const line = text.slice(0, m.index).split('\n').length
        failures.push(`${rel}:${line} — awaited supabase write whose result nothing reads`)
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Awaited supabase writes with a discarded result (the finishLiveCall stub-upsert defect shape).\n` +
      `The client never throws — capture { error } and react, or for a genuinely best-effort ` +
      `write raise its file's count in DISCARDED with the reason:\n` +
      failures.join('\n')
  )

  // The ratchet's other jaw: an entry whose sites were fixed must shrink, not linger.
  for (const [rel, { count }] of Object.entries(DISCARDED)) {
    assert.equal(
      seen[rel] ?? 0,
      count,
      `${rel}: DISCARDED says ${count} discarded-result write(s), the scan found ${seen[rel] ?? 0} — update the ratchet deliberately`
    )
  }
})
