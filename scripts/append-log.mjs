#!/usr/bin/env node
// Append one entry to the collision log (append-only by construction — this script
// has no code path that reads back, truncates, or rewrites; fs.appendFileSync only).
// Exists because the permission layer denies Edit/Write on the log (whole-file
// rewrites) and extends that denial to ad-hoc shell appends; this script is the
// sanctioned, allowlisted append door (see .claude/settings.json permissions.allow).
//
// The fleet's two logs are gone (ADR-0001); COLLISIONS.md at the repo ROOT replaced
// them, which also removes the absolute machine path this script used to carry — the
// log now travels with the checkout instead of living on one disk.
//
// Usage:
//   node scripts/append-log.mjs collisions "the line to append"
//   node scripts/append-log.mjs collisions <<'EOF'   (stdin form)
//   ...multi-line entry...
//   EOF
import fs from 'node:fs'
import { join } from 'node:path'
import { APPEND_ONLY, REPO_ROOT } from './lib/env-manifest.mjs'

// The doors are DERIVED from the append-only declaration rather than restated here.
// Written twice, the two lists drift, and the half that drifts is the half nobody
// tests — the same reason `pre-bash-gate.mjs` keeps one LOG_NAMES for its two
// consumers. `src/lib/environment.test.ts` asserts nothing in that declaration is
// also always-on.
const LOGS = Object.fromEntries(
  Object.entries(APPEND_ONLY)
    .filter(([, entry]) => entry.door)
    .map(([file, entry]) => [entry.door, file])
)

const [, , logName, ...textArgs] = process.argv
const file = LOGS[logName]
if (!file) {
  console.error(`usage: node scripts/append-log.mjs <${Object.keys(LOGS).join('|')}> [text | stdin]`)
  process.exit(1)
}

let text = textArgs.join(' ')
if (!text) {
  text = fs.readFileSync(0, 'utf8') // stdin
}
text = text.replace(/\r\n/g, '\n').trim()
if (!text) {
  console.error('nothing to append: pass the entry as an argument or on stdin')
  process.exit(1)
}

const path = join(REPO_ROOT, file)
// Keep the log well-formed if a previous entry lacked its trailing newline.
const endsWithNewline =
  fs.statSync(path).size === 0 ||
  (() => {
    const fd = fs.openSync(path, 'r')
    try {
      const buf = Buffer.alloc(1)
      fs.readSync(fd, buf, 0, 1, fs.statSync(path).size - 1)
      return buf.toString('utf8') === '\n'
    } finally {
      fs.closeSync(fd)
    }
  })()

fs.appendFileSync(path, (endsWithNewline ? '' : '\n') + text + '\n', 'utf8')
console.log(`appended ${text.split('\n').length} line(s) to ${file}`)
