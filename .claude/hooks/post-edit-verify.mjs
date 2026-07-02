#!/usr/bin/env node
// PostToolUse verifier — auto-format the edited file, then fast incremental typecheck.
// Exit 2 feeds stderr back to the session so errors are fixed immediately.
import { execSync } from 'node:child_process'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
let input = {}
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0)
}
const file = String(input.tool_input?.file_path ?? '')
if (!/\.(ts|tsx)$/.test(file) || /node_modules|\.next/.test(file)) process.exit(0)

try {
  execSync(`npx prettier --write "${file}"`, { stdio: 'pipe', timeout: 30000 })
} catch {
  /* prettier failure is non-fatal; tsc below catches real syntax errors */
}

try {
  execSync('npx tsc --noEmit --incremental --tsBuildInfoFile .claude/.tsbuildinfo-hook', {
    stdio: 'pipe',
    timeout: 90000,
  })
} catch (e) {
  const out = String(e.stdout ?? '')
    .split('\n')
    .slice(0, 25)
    .join('\n')
  console.error(`TYPECHECK FAILED after editing ${file}:\n${out}`)
  process.exit(2)
}
process.exit(0)
