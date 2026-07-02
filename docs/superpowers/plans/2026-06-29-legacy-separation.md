# Legacy (Timlul) Separation — Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax. Execution: inline, single session
> (founder pre-approved the full loop, one notification at the end).

**Goal:** Make the legacy Timlul product safely deletable in one pass with zero risk to Atlas, and
keep it that way via a build-enforced import guard.

**Architecture:** Label-in-place (Option A) + one necessary decouple. Atlas keeps `src/components/*`;
no legacy bulk is moved. A guard test enforces "Atlas imports nothing from legacy."

**Tech Stack:** Next.js 14, TypeScript, `node --test` + `tsx` (existing test runner).

## Global Constraints

- `@/` alias = `src/`. Use it for all cross-folder imports (matches the codebase).
- Banner text (verbatim) for legacy-product files:
  `// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md`
- Banner text (verbatim) for gateway files (Wave 2):
  `// ⚠️ GATEWAY (legacy-styled) — keep until Atlas has its own login/landing, then delete. See LEGACY.md`
- Banner goes on its own line; if the file starts with a `'use client'` directive, the banner goes
  immediately AFTER that directive (the directive must stay first).
- Tests must stay green at every commit.

---

### Task 1: Boundary guard test (and prove it catches a real violation)

**Files:**
- Create: `src/lib/legacyBoundary.test.ts`
- Modify: `package.json` (add the test file to the `test` script)

- [ ] **Step 1: Write the guard test**

```ts
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
  try { entries = readdirSync(dir) } catch { return [] }
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
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (FORBIDDEN.test(line)) violations.push(`${f}:${i + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(violations, [], `Atlas imports legacy:\n${violations.join('\n')}`)
})
```

- [ ] **Step 2: Add to the test script** in `package.json` — append ` src/lib/legacyBoundary.test.ts`
  to the existing `"test"` command.

- [ ] **Step 3: Run the guard ALONE — expect FAIL** (proves it catches violations):
  `node --import tsx --test src/lib/legacyBoundary.test.ts`
  Expected: FAIL, listing `src/app/app/settings/page.tsx … @/components/ui/LanguageToggle`.

### Task 2: Decouple — move LanguageToggle ui/ → ds/

**Files:**
- Create: `src/components/ds/LanguageToggle.tsx` (verbatim copy of the ui version)
- Delete: `src/components/ui/LanguageToggle.tsx`
- Modify: `src/app/app/settings/page.tsx:5`, `src/components/layout/LandingNav.tsx` (import path)
- Modify: `src/components/ds/index.ts` (add `export { LanguageToggle } from './LanguageToggle'`)

- [ ] **Step 1:** Move file + repoint both imports `@/components/ui/LanguageToggle` → `@/components/ds/LanguageToggle`.
- [ ] **Step 2: Run the guard ALONE — expect PASS:** `node --import tsx --test src/lib/legacyBoundary.test.ts` → PASS.

### Task 3: Delete confirmed dead code

**Delete:** `src/components/EmptyState.tsx`, `src/components/ErrorState.tsx`,
`src/components/layout/DashboardSidebar.tsx`, `src/components/layout/DashboardTopBar.tsx`,
`src/components/ui/Card.tsx`, `src/components/ui/Input.tsx` (all verified zero importers).

### Task 4: Label legacy + gateway files

- [ ] Prepend the **legacy** banner to: `components/{landing/*, dashboard/*, transcript/*,
  processing/*, companies/*, platform/*}`, `components/layout/{LandingNav,AppNav}`,
  `components/ui/{Button,Badge}`, and routes `app/home/page.tsx`, `app/dashboard/page.tsx`,
  `app/companies/page.tsx`, `app/processing/[id]/page.tsx`, `app/transcript/[id]/page.tsx`.
- [ ] Prepend the **gateway** banner to: `app/page.tsx`, `components/auth/{LoginForm,JoinForm}`,
  `components/ui/dotted-surface.tsx`.

### Task 5: Manifest + map update

- [ ] Create `LEGACY.md` (delete-set/keep-set, Wave 1/2, pre-delete checklist, security note).
- [ ] Update `ARCHITECTURE.md` §8 to point at `LEGACY.md` and note the guard + the LanguageToggle move.

### Final verification

- [ ] `npm test` → all suites green (incl. the guard).
- [ ] `npx tsc --noEmit` → clean (catches the import move).
- [ ] Commit in small labeled commits (move → guard → dead-code → docs).
