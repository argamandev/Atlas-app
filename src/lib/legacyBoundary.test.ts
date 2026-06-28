import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Atlas source roots — must NEVER import the legacy (Timlul) product, so Timlul stays
// deletable in one pass with zero impact on Atlas. See LEGACY.md.
const ATLAS_ROOTS = [
  'src/app/app',
  'src/components/ds',
  'src/components/app',
  'src/components/live',
  'src/components/chat',
  'src/components/company',
  'src/components/calendar',
]

// Legacy folders Atlas may not depend on.
const FORBIDDEN =
  /from\s+['"]@\/components\/(landing|dashboard|transcript|processing|companies|platform|layout|auth|ui)\//

function walk(dir: string): string[] {
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const out: string[] = []
  for (const name of entries) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

test('Atlas does not import the legacy Timlul product', () => {
  const files = ATLAS_ROOTS.flatMap(walk)
  assert.ok(files.length > 20, `guard scanned too few files (${files.length}) — roots wrong?`)
  const violations: string[] = []
  for (const f of files) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (FORBIDDEN.test(line)) violations.push(`${f}:${i + 1}: ${line.trim()}`)
      })
  }
  assert.deepEqual(violations, [], `Atlas imports legacy:\n${violations.join('\n')}`)
})
