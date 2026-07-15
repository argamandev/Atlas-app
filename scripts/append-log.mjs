#!/usr/bin/env node
// Append one entry to a shared fleet log (append-only by construction — this script
// has no code path that reads back, truncates, or rewrites; fs.appendFileSync only).
// Exists because the permission layer denies Edit/Write on the logs (whole-file
// rewrites) and extends that denial to ad-hoc shell appends; this script is the
// sanctioned, allowlisted append door (see .claude/settings.json permissions.allow).
//
// Usage:
//   node scripts/append-log.mjs <cross-cutting|ready-queue> "the line to append"
//   node scripts/append-log.mjs <cross-cutting|ready-queue> <<'EOF'   (stdin form)
//   ...multi-line entry...
//   EOF
import fs from 'node:fs'

const AGENT_MEMORY = 'C:/Users/Sagi/Desktop/Atlas/agent-memory' // shared brain, absolute per rules/parallel-work.md
const LOGS = { 'cross-cutting': 'cross-cutting.md', 'ready-queue': 'ready-queue.md' }

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

const path = `${AGENT_MEMORY}/${file}`
// Keep the log well-formed if a previous entry lacked its trailing newline.
const endsWithNewline = fs.statSync(path).size === 0 || (() => {
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
