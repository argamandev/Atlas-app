import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE TRANSCRIPT BIRTH DOOR GUARD (ingestion standard §2, slice A3).
//
// One birth door: every `transcripts` INSERT/UPSERT lives in
// src/lib/db/transcripts.ts, where company_id + source_key are REQUIRED
// arguments. Before this door existed, seven code paths inserted rows with no
// shared gate, and the 55-row unattributed Timlul export proved attribution
// cannot be retrofitted. Same guard for regenerating `formatted_data` /
// `word_segments`: those and the chunks are ONE consistency unit (standard §4)
// — a write outside the door regenerates one without the others, which is the
// exact desync reprocess-audio.mjs used to create.
//
// The apiAuthBoundary pattern: comments are BLANKED first (a prose mention of
// `.from('transcripts').insert` must not trip the scan — that grep-hits-prose
// trap is documented in app.md), CRLF is normalized before matching (the CRLF
// trap: a \n-written pattern silently matching nothing), and the walk covers
// src/ AND scripts/ because three of the seven historical doors were scripts.
//
// STATED LIMIT, in the apiAuthBoundary tradition: this is a TEXT scan of
// direct chains (`.from('transcripts')` whose NEXT chained call is the write).
// Splitting the chain through a variable (`const t = db.from('transcripts');
// t.insert(...)`) is invisible to it — as is a raw SQL insert. It proves no
// STRAIGHTFORWARD bypass exists, which is the drift this guard is for.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(process.cwd())

/** The one allowed home of transcript writes. */
const DOOR = 'src/lib/db/transcripts.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'out'].includes(entry)) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(p)
  }
  return out
}

/** Blank // and /* *​/ comments, preserving offsets-ish (content replaced by spaces). */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length))
}

type Violation = { file: string; kind: string; at: number }

function scanFile(file: string): Violation[] {
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const src = blankComments(raw)
  const out: Violation[] = []
  const fromRe = /\.from\(\s*['"`]transcripts['"`]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = fromRe.exec(src))) {
    // The next chained call after .from('transcripts'), across newlines.
    const rest = src.slice(m.index + m[0].length)
    const chain = rest.match(/^\s*\.\s*(\w+)\s*\(/)
    if (!chain) continue
    const method = chain[1]
    const line = src.slice(0, m.index).split('\n').length
    if (method === 'insert' || method === 'upsert') {
      out.push({ file, kind: `${method} outside the birth door`, at: line })
    }
    if (method === 'update') {
      // Does the update payload (balanced parens) touch the consistency unit?
      const start = m.index + m[0].length + chain[0].length - 1
      let depth = 0
      let end = start
      for (let i = start; i < src.length; i++) {
        if (src[i] === '(') depth++
        else if (src[i] === ')' && --depth === 0) {
          end = i
          break
        }
      }
      const payload = src.slice(start, end + 1)
      if (/\bformatted_data\b|\bword_segments\b/.test(payload)) {
        out.push({ file, kind: 'formatted_data/word_segments update outside the door', at: line })
      }
    }
  }
  return out
}

test('every transcripts insert/upsert and consistency-unit update lives in the birth door', () => {
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'scripts'))]
  // Guard the guard: the walk must actually see the codebase.
  assert.ok(files.length > 50, `only ${files.length} files walked — the walk is broken`)

  const violations = files
    .flatMap(scanFile)
    .map((v) => ({ ...v, file: relative(ROOT, v.file).replace(/\\/g, '/') }))
    .filter((v) => v.file !== DOOR)

  assert.deepEqual(
    violations,
    [],
    'transcripts writes outside the birth door (route them through src/lib/db/transcripts.ts):\n' +
      violations.map((v) => `  ${v.file}:${v.at} — ${v.kind}`).join('\n')
  )

  // And the door itself must still contain the writes this guard is herding —
  // a green run against a door with no insert would certify nothing (M2).
  const door = scanFile(join(ROOT, DOOR))
  assert.ok(
    door.some((v) => v.kind.startsWith('insert')),
    'the birth door itself no longer contains an insert — the guard is scanning the wrong world'
  )
})
