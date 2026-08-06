import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE LAYER HAS TO STAY A LAYER.
//
// Founder, 2026-08-06: *"The api key and data integration is the most important
// product we are building. Calendar, investor calls, chat and workspace all are
// being built on it."* The workspace is consumer ① of four, and it is the one
// being built first — which is exactly the condition under which a shared layer
// quietly acquires the shape of its first caller.
//
// This test is the cheapest possible guard against that: if `lib/maya` ever
// imports workspace code, the coupling is caught the same day rather than the
// day the calendar needs the layer and finds a workspace in it.
// ─────────────────────────────────────────────────────────────────────────────

const MAYA_DIR = join(process.cwd(), 'src', 'lib', 'maya')

/** Anything that would tie this layer to one consumer. */
const FORBIDDEN = [
  { pattern: /from\s+['"]@\/lib\/workspace/, what: '@/lib/workspace' },
  { pattern: /from\s+['"]\.\.\/workspace/, what: '../workspace' },
  { pattern: /from\s+['"]@\/components/, what: '@/components' },
  { pattern: /from\s+['"]@\/app\//, what: '@/app' },
  { pattern: /from\s+['"]@\/lib\/db\//, what: '@/lib/db' },
]

test('the MAYA layer imports nothing from the workspace, the UI, or the database layer', () => {
  const files = readdirSync(MAYA_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  assert.ok(files.length > 0, 'expected the layer to have source files')

  const offences: string[] = []
  for (const file of files) {
    const src = readFileSync(join(MAYA_DIR, file), 'utf8')
    for (const { pattern, what } of FORBIDDEN) {
      if (pattern.test(src)) offences.push(`${file} imports ${what}`)
    }
  }

  assert.deepEqual(offences, [], `the MAYA layer must not depend on its consumers:\n${offences.join('\n')}`)
})

test('the layer reads its key from the environment and never hardcodes one', () => {
  const files = readdirSync(MAYA_DIR).filter((f) => f.endsWith('.ts'))
  for (const file of files) {
    const src = readFileSync(join(MAYA_DIR, file), 'utf8')
    // a 32-char hex-ish literal would be a leaked credential
    assert.ok(
      !/['"][0-9a-f]{32}['"]/i.test(src),
      `${file} appears to contain a hardcoded 32-character secret`
    )
  }
})
