# Transcript Correction Layer V1 — Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a post-IVRIT correction step that fixes clear word errors by sense (and known entities), flags uncertain words + all numbers for audio verification, never rewrites, and is measured against a human gold with a hard "0 introduced errors" gate.

**Architecture:** A new pure module `src/lib/correction.ts` does the work: chunk the raw text, ask GPT-4o for a *diff* (not a rewrite) per chunk, then deterministically **apply** confident name/homophone fixes and **flag** everything uncertain (and every number). It is wired as Step 0 of `formatWithGPT4o`. A dev-only measurement harness (`scripts/measure.ts`) scores any output vs the gold; a `scripts/run-experiment.ts` runs the corrector with no list (Run A = shipped behavior) and with a throwaway hand-built אמפא list (Run B = measure the list's value).

**Tech Stack:** TypeScript, Next.js 14, OpenAI SDK (`openai@^6`, `gpt-4o`), Node 20 built-in test runner via `tsx`. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-06-08-transcript-correction-v1-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/correction.ts` | **new** — all correction logic: types, `chunkByWords`, `buildCorrectionPrompt`, `parseCorrectionItems`, `isSafeCorrection`, `routeItems`, `correctTranscript`, `attachFlags` |
| `src/lib/correction.test.ts` | **new** — unit tests for the pure functions above (injected fake GPT) |
| `src/lib/types.ts` | add `TranscriptLine.flags?` and `Transcript.corrections?` (+ `CorrectionDiag` type) |
| `src/lib/transcription.ts` | wire Step 0: reorder `extractMeta` before correction, call `correctTranscript`, attach flags + corrections; extend `extractMeta` to return `business`; remove the dead dormant correction code |
| `src/components/transcript/TranscriptBody.tsx` | render flagged spans as yellow `<mark>` with hover text |
| `src/components/transcript/TranscriptEditor.tsx` | admin-only corrections diagnostics panel |
| `scripts/lib/measure-core.ts` | **new** — pure: `normalize`, `tokenize`, `lcsGoldMatched`, `score` |
| `scripts/lib/measure-core.test.ts` | **new** — unit tests for scoring |
| `scripts/measure.ts` | **new** — CLI: score a candidate file vs the gold |
| `scripts/run-experiment.ts` | **new** — Run A / Run B vs gold; defines throwaway `AMPA_ENTITIES` |
| `package.json` | add `tsx` devDep + `test` script |

**Testing strategy:** Deterministic glue (normalization, alignment/scoring, diff parsing, routing, applying) is unit-tested with `node --test`. The LLM-dependent end-to-end quality is validated by `run-experiment.ts` against the gold (the acceptance gate: `introduced == 0`).

---

## Task 0: Tooling — test runner

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add tsx dev dependency**

Run: `npm install -D tsx`
Expected: `tsx` appears under `devDependencies`, install succeeds.

- [ ] **Step 2: Add the test script**

In `package.json` `"scripts"`, add (keep existing scripts):

```json
"test": "node --import tsx --test src/lib/correction.test.ts scripts/lib/measure-core.test.ts"
```

Then exclude dev-only files from the Next/`tsc` build so they don't get type-checked or bundled
(they run via `tsx`, which doesn't read `tsconfig` include/exclude). In `tsconfig.json` change:

```json
"exclude": ["node_modules", "worker", "**/*.test.ts", "scripts"]
```

> Important: with `moduleResolution: "bundler"`, intra-repo imports must be **extensionless**
> (`from './correction'`, not `'./correction.ts'`) — the `.ts` extension is a compile error.

- [ ] **Step 3: Verify the runner works on an empty suite**

Create a temporary file `scripts/lib/measure-core.test.ts` with:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
test('runner works', () => { assert.equal(1, 1) })
```

Run: `npm test`
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/lib/measure-core.test.ts
git commit -m "chore: add tsx + node:test runner"
```

---

## Task 1: Measurement core — normalize & tokenize

**Files:**
- Create: `scripts/lib/measure-core.ts`
- Test: `scripts/lib/measure-core.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `scripts/lib/measure-core.test.ts` with:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, tokenize } from './measure-core'

test('normalize strips speaker headers, timestamps, punctuation', () => {
  const input = '[00:00:00] זוהר רדי:\nשלום, לכולם! האג"ח נותר AA.'
  const out = normalize(input)
  assert.ok(!out.includes('['), 'timestamp removed')
  assert.ok(!out.includes(':'), 'colon removed')
  assert.ok(!out.includes(','), 'comma removed')
  assert.ok(out.includes('שלום'))
})

test('tokenize splits on whitespace, drops empties', () => {
  assert.deepEqual(tokenize('  שלום   לכולם '), ['שלום', 'לכולם'])
})
```

Run: `npm test`
Expected: FAIL — `normalize`/`tokenize` not exported.

- [ ] **Step 2: Implement**

Create `scripts/lib/measure-core.ts`:

```ts
// Pure helpers for scoring a transcript against the gold. No I/O.

/** Strip everything that is not transcript *words*: speaker headers, [timestamps],
 *  the divider line, markdown headings, punctuation, ניקוד; collapse whitespace. */
export function normalize(text: string): string {
  return text
    .replace(/\[\d{2}:\d{2}:\d{2}\]/g, ' ')        // [00:00:00]
    .replace(/^#{1,6}.*$/gm, ' ')                   // ## headings
    .replace(/^=+$/gm, ' ')                          // ====== divider
    .replace(/^[^\n:]{1,40}:\s*$/gm, ' ')           // a line that is just "Name:" (speaker header)
    .replace(/[֑-ׇ]/g, '')                 // Hebrew ניקוד / cantillation
    .replace(/[.,!?;:"'״׳()\[\]{}<>\-–—…]/g, ' ')   // punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean)
}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/measure-core.ts scripts/lib/measure-core.test.ts
git commit -m "feat(measure): normalize + tokenize"
```

---

## Task 2: Measurement core — alignment & scoring

**Files:**
- Modify: `scripts/lib/measure-core.ts`
- Test: `scripts/lib/measure-core.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `scripts/lib/measure-core.test.ts`:

```ts
import { lcsGoldMatched, score } from './measure-core'

test('lcsGoldMatched marks which gold tokens the candidate reproduced', () => {
  const gold = ['א', 'ב', 'ג', 'ד']
  const cand = ['א', 'X', 'ג', 'ד']  // "ב" missing/substituted
  assert.deepEqual(lcsGoldMatched(cand, gold), [true, false, true, true])
})

test('score computes fixed / introduced / remaining vs gold', () => {
  const gold = 'שיעור התפוסה נותר תקין'
  const baseline = 'קישור התפוסה נותר תקין'   // 1 error: שיעור→קישור
  const fixedCand = 'שיעור התפוסה נותר תקין'   // corrected
  const brokeCand = 'שיעור התפוסה נותר שבור'   // fixed שיעור but broke תקין→שבור

  const good = score(baseline, fixedCand, gold)
  assert.equal(good.fixed, 1)
  assert.equal(good.introduced, 0)
  assert.equal(good.remaining, 0)

  const bad = score(baseline, brokeCand, gold)
  assert.equal(bad.fixed, 1)
  assert.equal(bad.introduced, 1)   // תקין was right in baseline, now wrong
})
```

Run: `npm test`
Expected: FAIL — `lcsGoldMatched`/`score` not exported.

- [ ] **Step 2: Implement**

Append to `scripts/lib/measure-core.ts`:

```ts
/** For each gold token, true if the candidate reproduced it (in order), via LCS backtrace. */
export function lcsGoldMatched(cand: string[], gold: string[]): boolean[] {
  const n = cand.length, m = gold.length
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = cand[i] === gold[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])

  const matched = new Array<boolean>(m).fill(false)
  let i = 0, j = 0
  while (i < n && j < m) {
    if (cand[i] === gold[j]) { matched[j] = true; i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return matched
}

export interface Score {
  fixed: number; introduced: number; remaining: number
  goldTokens: number; baselineErrors: number; candidateErrors: number
  errorRateBaseline: number; errorRateCandidate: number
}

/** Compare candidate to gold, using baseline (uncorrected) to attribute fixed vs introduced. */
export function score(baseline: string, candidate: string, gold: string): Score {
  const g = tokenize(gold)
  const gb = lcsGoldMatched(tokenize(baseline), g)
  const gc = lcsGoldMatched(tokenize(candidate), g)
  let fixed = 0, introduced = 0, remaining = 0, baselineErrors = 0, candidateErrors = 0
  for (let k = 0; k < g.length; k++) {
    if (!gb[k]) baselineErrors++
    if (!gc[k]) { candidateErrors++; remaining++ }
    if (!gb[k] && gc[k]) fixed++
    if (gb[k] && !gc[k]) introduced++
  }
  return {
    fixed, introduced, remaining,
    goldTokens: g.length, baselineErrors, candidateErrors,
    errorRateBaseline: baselineErrors / g.length,
    errorRateCandidate: candidateErrors / g.length,
  }
}
```

Run: `npm test`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/measure-core.ts scripts/lib/measure-core.test.ts
git commit -m "feat(measure): LCS alignment + fixed/introduced/remaining scoring"
```

---

## Task 3: Measurement CLI

**Files:**
- Create: `scripts/measure.ts`

- [ ] **Step 1: Implement the CLI**

Create `scripts/measure.ts`:

```ts
// Usage: node --import tsx scripts/measure.ts <candidate.txt> [baseline.txt]
// Scores <candidate> against the gold; if <baseline> is given, reports fixed/introduced too.
import fs from 'fs'
import path from 'path'
import { score, tokenize, lcsGoldMatched } from './lib/measure-core'

const ROOT = process.cwd()
const GOLD = path.join(ROOT, 'scripts', 'fixtures', 'ampa-q1-2026.gold.txt')

const candPath = process.argv[2]
const basePath = process.argv[3] ?? path.join(ROOT, 'scripts', 'fixtures', 'ampa-q1-2026.current.txt')
if (!candPath) { console.error('Usage: measure.ts <candidate.txt> [baseline.txt]'); process.exit(1) }

const gold = fs.readFileSync(GOLD, 'utf8')
const candidate = fs.readFileSync(candPath, 'utf8')
const baseline = fs.readFileSync(basePath, 'utf8')

const s = score(baseline, candidate, gold)
console.log('=== measure vs gold ===')
console.log(`gold tokens:         ${s.goldTokens}`)
console.log(`baseline errors:     ${s.baselineErrors}  (error rate ${(s.errorRateBaseline * 100).toFixed(1)}%)`)
console.log(`candidate errors:    ${s.candidateErrors}  (error rate ${(s.errorRateCandidate * 100).toFixed(1)}%)`)
console.log(`FIXED:               ${s.fixed}`)
console.log(`INTRODUCED:          ${s.introduced}   ${s.introduced === 0 ? '✅ (gate passes)' : '❌ (gate FAILS)'}`)
console.log(`remaining errors:    ${s.remaining}`)

// Show the gold tokens the candidate still misses, with a little context.
const g = tokenize(gold)
const gc = lcsGoldMatched(tokenize(candidate), g)
const misses = g.map((t, i) => (!gc[i] ? `${g[i - 1] ?? ''} [${t}] ${g[i + 1] ?? ''}`.trim() : null)).filter(Boolean)
if (misses.length) { console.log('\n--- still-missing gold words (context) ---'); misses.slice(0, 60).forEach(m => console.log('  ' + m)) }
```

- [ ] **Step 2: Run it against the current baseline (sanity)**

Run: `node --import tsx scripts/measure.ts scripts/fixtures/ampa-q1-2026.current.txt`
Expected: prints a report; `FIXED 0`, `INTRODUCED 0` (candidate == baseline), and a list of ~25-30 still-missing gold words (the known errors). This confirms the ruler sees the real errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/measure.ts
git commit -m "feat(measure): CLI to score a candidate vs gold"
```

---

## Task 4: Correction module — pure functions

**Files:**
- Create: `src/lib/correction.ts`
- Test: `src/lib/correction.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/correction.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkByWords, parseCorrectionItems, isSafeCorrection, routeItems } from './correction'

test('chunkByWords groups words into N-word chunks', () => {
  const text = Array.from({ length: 10 }, (_, i) => `w${i}`).join(' ')
  const chunks = chunkByWords(text, 4)
  assert.equal(chunks.length, 3)
  assert.equal(chunks[0], 'w0 w1 w2 w3')
})

test('parseCorrectionItems reads items, defaults certainty, drops invalid', () => {
  const raw = JSON.stringify({ items: [
    { original: 'אישר', corrected: 'קשרי', kind: 'homophone', certainty: 'confident', reason: 'x' },
    { corrected: 'oops' },                         // no original -> dropped
    { original: '180%', kind: 'number', reason: 'לא הגיוני' }, // certainty defaults
  ] })
  const items = parseCorrectionItems(raw)
  assert.equal(items.length, 2)
  assert.equal(items[1].certainty, 'uncertain')
})

test('isSafeCorrection blocks long and multi-word balloon changes', () => {
  assert.equal(isSafeCorrection('אישר', 'קשרי'), true)
  assert.equal(isSafeCorrection('א', 'א '.repeat(20)), false)
})

test('routeItems applies confident word fixes, flags uncertain + all numbers', () => {
  const text = 'דרך אישר משקיעים והגענו ל180% מההכנסות עם אמפתי'
  const items = [
    { original: 'אישר', corrected: 'קשרי', kind: 'homophone', certainty: 'confident', reason: '' },
    { original: '180%', kind: 'number', certainty: 'confident', reason: 'מעל 100%' }, // number => still flagged, not changed
    { original: 'אמפתי', corrected: 'אמפא', kind: 'name', certainty: 'uncertain', reason: 'שם לא ודאי' },
  ] as const
  const r = routeItems(text, items as any)
  assert.ok(r.text.includes('קשרי משקיעים'), 'confident homophone applied')
  assert.ok(r.text.includes('180%'), 'number NOT changed')
  assert.ok(r.text.includes('אמפתי'), 'uncertain NOT changed')
  assert.equal(r.applied.length, 1)
  assert.equal(r.flags.length, 2) // the number + the uncertain name
  assert.ok(r.flags.some(f => f.text === '180%'))
})
```

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the pure functions**

Create `src/lib/correction.ts`:

```ts
// Post-IVRIT correction: GPT proposes a DIFF, we deterministically apply confident
// word fixes and FLAG everything uncertain (and all numbers). Never rewrites text.

export type CorrectionKind = 'name' | 'homophone' | 'number'
export type Certainty = 'confident' | 'uncertain'

export interface CorrectionItem {
  original: string
  corrected?: string
  kind: CorrectionKind
  certainty: Certainty
  reason: string
}

export interface Flag { text: string; reason: string }

export interface CorrectionResult {
  text: string
  applied: CorrectionItem[]
  flags: Flag[]
}

export interface Profile {
  company: string
  business: string
  quarter: string
  speakers: string   // "זוהר רדי (ceo), שירן (moderator)"
}

export type GptChunkFn = (prompt: string) => Promise<string>

const KINDS: CorrectionKind[] = ['name', 'homophone', 'number']

export function chunkByWords(text: string, wordsPerChunk = 400): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '))
  }
  return chunks
}

export function parseCorrectionItems(raw: string): CorrectionItem[] {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  const items = (parsed as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  const out: CorrectionItem[] = []
  for (const it of items) {
    const o = it as Record<string, unknown>
    if (typeof o.original !== 'string' || !o.original.trim()) continue
    const kind = (KINDS as string[]).includes(o.kind as string) ? (o.kind as CorrectionKind) : 'homophone'
    const certainty: Certainty = o.certainty === 'confident' ? 'confident' : 'uncertain'
    out.push({
      original: o.original,
      corrected: typeof o.corrected === 'string' ? o.corrected : undefined,
      kind,
      certainty,
      reason: typeof o.reason === 'string' ? o.reason : '',
    })
  }
  return out
}

/** Block risky changes that would rewrite rather than fix an ASR error. */
export function isSafeCorrection(wrong: string, correct: string): boolean {
  if (!wrong || !correct || wrong === correct) return false
  if (wrong.length > 35 || correct.length > 35) return false
  const w = wrong.trim().split(/\s+/).length
  const c = correct.trim().split(/\s+/).length
  const maxIncrease = w === 1 ? 1 : 0   // one word may split into two; no balloon growth
  if (c > w + maxIncrease) return false
  if (c < w - 1) return false
  return true
}

/** Confident, non-number, safe items get applied (longest original first). */
function applyConfident(text: string, items: CorrectionItem[]): { text: string; applied: CorrectionItem[] } {
  const appliable = items
    .filter(i => i.certainty === 'confident' && i.kind !== 'number' && i.corrected && isSafeCorrection(i.original, i.corrected))
    .sort((a, b) => b.original.length - a.original.length)
  let result = text
  const applied: CorrectionItem[] = []
  for (const i of appliable) {
    if (!result.includes(i.original)) continue
    result = result.split(i.original).join(i.corrected as string)
    applied.push(i)
  }
  return { text: result, applied }
}

/** Route every item: confident word fixes applied; uncertain (any kind) + every number flagged. */
export function routeItems(text: string, items: CorrectionItem[]): CorrectionResult {
  const r = applyConfident(text, items)
  const appliedSet = new Set(r.applied)
  const flags: Flag[] = items
    .filter(i => !appliedSet.has(i) && (i.kind === 'number' || i.certainty === 'uncertain'))
    .map(i => ({ text: i.original, reason: i.reason }))
  return { text: r.text, applied: r.applied, flags }
}
```

Run: `npm test`
Expected: PASS (8 tests total).

- [ ] **Step 3: Commit**

```bash
git add src/lib/correction.ts src/lib/correction.test.ts
git commit -m "feat(correction): pure diff parse/route/apply with safety guards"
```

---

## Task 5: Correction module — prompt + orchestration

**Files:**
- Modify: `src/lib/correction.ts`
- Test: `src/lib/correction.test.ts`

- [ ] **Step 1: Write failing tests (orchestration with a fake GPT)**

Append to `src/lib/correction.test.ts`:

```ts
import { correctTranscript, buildCorrectionPrompt, attachFlags } from './correction'

test('buildCorrectionPrompt includes profile, entities, chunk and the JSON contract', () => {
  const p = buildCorrectionPrompt(
    { company: 'אמפא', business: 'נדל"ן מניב', quarter: 'Q1 2026', speakers: 'זוהר רדי (ceo)' },
    ['ToHa', 'אמפא TLV'],
    'דרך אישר משקיעים',
  )
  assert.ok(p.includes('אמפא'))
  assert.ok(p.includes('ToHa'))
  assert.ok(p.includes('דרך אישר משקיעים'))
  assert.ok(/items/.test(p) && /certainty/.test(p))
})

test('correctTranscript applies confident fixes from a fake GPT and collects flags', async () => {
  const fakeGpt = async () => JSON.stringify({ items: [
    { original: 'אישר משקיעים', corrected: 'קשרי משקיעים', kind: 'homophone', certainty: 'confident', reason: '' },
    { original: '180%', kind: 'number', certainty: 'confident', reason: 'מעל 100%' },
  ] })
  const profile = { company: 'אמפא', business: '', quarter: '', speakers: '' }
  const r = await correctTranscript('דרך אישר משקיעים ל180% מההכנסות', profile, [], fakeGpt)
  assert.ok(r.text.includes('קשרי משקיעים'))
  assert.ok(r.text.includes('180%'))
  assert.equal(r.flags.length, 1)
})

test('attachFlags puts each flag on the first line containing its text', () => {
  const lines = [{ id: 'L1', text: 'שורה אחת' }, { id: 'L2', text: 'יש כאן 180% מההכנסות' }] as any
  attachFlags(lines, [{ text: '180%', reason: 'בדיקה' }])
  assert.equal(lines[0].flags, undefined)
  assert.equal(lines[1].flags.length, 1)
  assert.equal(lines[1].flags[0].text, '180%')
})
```

Run: `npm test`
Expected: FAIL — `correctTranscript`/`buildCorrectionPrompt`/`attachFlags` not exported.

- [ ] **Step 2: Implement prompt, orchestration, attachFlags**

Append to `src/lib/correction.ts`:

```ts
export function buildCorrectionPrompt(profile: Profile, entities: string[], chunk: string): string {
  const entityBlock = entities.length
    ? `\nרשימת שמות נכונים של החברה (השתמש בה לתיקון שמות בלבד, בהקשר):\n${entities.map(e => `- ${e}`).join('\n')}\n`
    : ''
  return `אתה מתקן שגיאות תמלול אוטומטי (ASR) של שיחת משקיעים בעברית. תמלול גולמי, ללא הקשר חיצוני.

חברה: ${profile.company || 'לא ידוע'} | תחום: ${profile.business || 'לא ידוע'} | רבעון: ${profile.quarter || 'לא ידוע'}
דוברים: ${profile.speakers || 'לא ידוע'}${entityBlock}

החזר אך ורק JSON בפורמט:
{"items":[{"original":"<הטקסט המדויק כפי שמופיע>","corrected":"<התיקון, אם בטוח>","kind":"name|homophone|number","certainty":"confident|uncertain","reason":"<קצר>"}]}

חוקים מחייבים:
1. החזר רק רשימת שינויים נקודתיים. אל תשכתב, אל תנסח מחדש, אל תשנה פיסוק או סגנון.
2. תקן רק שגיאות ASR ברורות: מילים חסרות-משמעות, מילים שלא ייתכנו בהקשר, ושמות שתואמים לרשימה. אל תיגע בניסוח ש"נשמע טוב יותר".
3. סמן certainty לכל פריט: אם אתה בטוח במילה הנכונה -> "confident" (תיושם). אם משהו ברור שגוי אך אינך בטוח מה הנכון -> "uncertain" (יסומן למשתמש, לא ישונה). אם שום דבר לא שגוי — אל תכלול אותו.
4. לעולם אל תשנה ספרה. מספר יכול להיות לכל היותר "uncertain" עם kind="number" (למשל ערך לא הגיוני כמו מעל 100% מההכנסות) — סמן, אל תתקן.
5. "original" חייב להופיע מילה במילה בטקסט שלמטה.

הטקסט:
${chunk}`
}

export async function correctTranscript(
  rawText: string,
  profile: Profile,
  entities: string[],
  gpt: GptChunkFn,
  wordsPerChunk = 400,
): Promise<CorrectionResult> {
  const chunks = chunkByWords(rawText, wordsPerChunk)
  const all: CorrectionItem[] = []
  for (const chunk of chunks) {
    try {
      const raw = await gpt(buildCorrectionPrompt(profile, entities, chunk))
      all.push(...parseCorrectionItems(raw))
    } catch (err) {
      console.warn('[correction] chunk skipped:', (err as Error).message)
    }
  }
  // De-dupe identical originals (keep the first), then apply to the full text.
  const seen = new Set<string>()
  const deduped = all.filter(i => (seen.has(i.original) ? false : (seen.add(i.original), true)))
  return routeItems(rawText, deduped)
}

/** Attach each flag to the first line whose text contains the flag's span. */
export function attachFlags(lines: { text: string; flags?: Flag[] }[], flags: Flag[]): void {
  for (const flag of flags) {
    const line = lines.find(l => l.text.includes(flag.text))
    if (line) (line.flags ??= []).push(flag)
  }
}
```

Run: `npm test`
Expected: PASS (11 tests total).

- [ ] **Step 3: Commit**

```bash
git add src/lib/correction.ts src/lib/correction.test.ts
git commit -m "feat(correction): prompt + chunked orchestration + attachFlags"
```

---

## Task 6: Types — line flags + correction diagnostics

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the types**

In `src/lib/types.ts`, add `flags?` to `TranscriptLine`:

```ts
export interface TranscriptLine {
  id: string
  speakerId: string
  timestamp: string
  text: string
  highlights?: Highlight[]
  /** verify flags — uncertain words and numbers; UI shows a yellow "check the recording" badge */
  flags?: { text: string; reason: string }[]
}
```

Add a diagnostics type and field on `Transcript` (place `CorrectionDiag` above `Transcript`):

```ts
/** Admin diagnostics: every correction the corrector applied (and flagged). */
export interface CorrectionDiag {
  original: string
  corrected?: string
  kind: 'name' | 'homophone' | 'number'
  certainty: 'confident' | 'uncertain'
  reason: string
}
```

And inside `Transcript`, next to `processingSecs`:

```ts
  /** corrections applied + flags raised by the Step 0 corrector (admin diagnostics) */
  corrections?: CorrectionDiag[]
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): line verify-flags + correction diagnostics"
```

---

## Task 7: Wire Step 0 into the pipeline

**Files:**
- Modify: `src/lib/transcription.ts`

- [ ] **Step 1: Extend `extractMeta` to also return `business`**

In `extractMeta` (transcription.ts ~504), change the return type to include `business`:

```ts
): Promise<{ company: string; business: string; ticker: string; quarter: string; date: string; speakers: Array<{ name: string; role: string; title: string }> }> {
```

In its prompt's JSON schema block, add a `business` field and a rule. Find the JSON example in the prompt and add:

```
  "business": "תחום הפעילות של החברה בעברית בקצרה (למשל: נדל\"ן מניב, בנקאות, אנרגיה)",
```

(If the model omits it, downstream defaults to `''` — safe.)

- [ ] **Step 2: Add imports + a GPT chunk caller, and replace the commented Step 0**

At the top of `transcription.ts`, add:

```ts
import { correctTranscript, attachFlags, type Profile } from './correction'
```

Replace the commented Step 0 block (currently transcription.ts:654-662) AND reorder so metadata is computed first. The new body of `formatWithGPT4o` from `const today = ...` becomes:

```ts
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  // Step 1: metadata FIRST — the raw opening already has the correct company name.
  console.log('[format] extracting metadata...')
  const meta = await extractMeta(rawText.slice(0, 2500), videoTitle, today)

  // Step 0: correction (runs on the full raw text, before speaker tagging).
  // V1 ships with NO entity list (sense-only). flags + applied corrections are kept for the UI/diagnostics.
  let flags: { text: string; reason: string }[] = []
  let corrections: import('./types').CorrectionDiag[] = []
  try {
    const profile: Profile = {
      company: meta.company ?? '',
      business: (meta as { business?: string }).business ?? '',
      quarter: meta.quarter ?? '',
      speakers: (meta.speakers ?? []).map(s => `${s.name} (${s.role})`).join(', '),
    }
    const gptChunk = (prompt: string) =>
      withTimeout(
        openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
          temperature: 0,
        }),
        90 * 1000,
        'correction chunk',
      ).then(r => r.choices[0].message.content ?? '{}')

    const result = await correctTranscript(rawText, profile, [], gptChunk)
    rawText = result.text
    flags = result.flags
    corrections = result.applied.map(a => ({
      original: a.original, corrected: a.corrected, kind: a.kind, certainty: a.certainty, reason: a.reason,
    }))
    console.log(`[format] correction: ${corrections.length} applied, ${flags.length} flagged`)
  } catch (err) {
    console.warn('[format] correction pass skipped:', (err as Error).message)
  }

  const speakers: Speaker[] = (meta.speakers ?? []).map((s, i) => ({
    id: `sp${i + 1}`,
    name: s.name,
    role: s.role,
    title: s.title ?? s.name,
    affiliation: '',
  }))
```

(Delete the old `// Step 1: extract metadata` block that followed the commented Step 0 — metadata is now computed above. Keep everything from `// Step 2: tag speakers` onward.)

- [ ] **Step 3: Attach flags to lines and pass corrections through `buildTranscript`**

Just before each `return buildTranscript(...)` call, attach flags to the lines being returned.

For the fallback return (transcription.ts ~708), before it:

```ts
    attachFlags(fallbackLines, flags)
    return buildTranscript(videoId, meta, today, now, speakers, fallbackLines, [], { ...opts, corrections })
```

For the main return (~758), before it:

```ts
  attachFlags(mgmtLines, flags)
  attachFlags(qaLines, flags)
  return buildTranscript(videoId, meta, today, now, speakers, mgmtLines, qaLines, { ...opts, corrections })
```

Update `buildTranscript`'s `opts` type and object spread:

```ts
  opts: { engine?: string; model?: string; corrections?: import('./types').CorrectionDiag[] } = {},
```
and add to the returned object (next to `model: opts.model,`):
```ts
    corrections: opts.corrections,
```

- [ ] **Step 4: Remove the now-dead dormant correction code**

Delete from `transcription.ts`: `KNOWN_CORRECTIONS` (the big dict), `CORRECTION_PROMPT_EXAMPLES`, `buildCorrectionMap`, `applyCorrections`, and the old `isSafeCorrection` — they are unused after this wiring (the new logic lives in `correction.ts`). Confirm with a search.

Run: `npx tsc --noEmit`
Expected: no errors. If `applyCorrections`/`isSafeCorrection`/`KNOWN_CORRECTIONS` are referenced anywhere else, the compiler will flag it — only delete what is unused.

- [ ] **Step 5: Commit**

```bash
git add src/lib/transcription.ts
git commit -m "feat(pipeline): wire Step 0 correction; metadata-first; flags+diagnostics; drop dead code"
```

---

## Task 8: UI — yellow verify flags + admin corrections panel

**Files:**
- Modify: `src/components/transcript/TranscriptBody.tsx`
- Modify: `src/components/transcript/TranscriptEditor.tsx`

- [ ] **Step 1: Render flags in `TranscriptBody`**

Replace `renderText` (TranscriptBody.tsx:50-83) with a version that renders highlight ranges (accent) AND flag ranges (yellow + tooltip). Flag ranges are computed from each flag's text via `indexOf`.

```tsx
function renderText(
  text: string,
  highlights: Highlight[] | undefined,
  flags: { text: string; reason: string }[] | undefined,
  onRemove?: (index: number) => void,
) {
  type Mark = { start: number; end: number; kind: 'hl' | 'flag'; title?: string; hi?: number }
  const marks: Mark[] = []
  ;(highlights ?? []).forEach((h, i) => marks.push({ start: h.start, end: h.end, kind: 'hl', hi: i }))
  ;(flags ?? []).forEach((f) => {
    const idx = text.indexOf(f.text)
    if (idx >= 0) marks.push({ start: idx, end: idx + f.text.length, kind: 'flag', title: 'מומלץ לשמוע את ההקלטה כדי לוודא את התמלול.' })
  })
  if (marks.length === 0) return text
  marks.sort((a, b) => a.start - b.start)

  const out: React.ReactNode[] = []
  let cursor = 0
  marks.forEach((m, k) => {
    const start = Math.max(cursor, Math.min(m.start, text.length))
    const end = Math.max(start, Math.min(m.end, text.length))
    if (start > cursor) out.push(<span key={`t${cursor}`}>{text.slice(cursor, start)}</span>)
    if (end <= start) return
    if (m.kind === 'flag') {
      out.push(
        <mark key={`f${k}`} title={m.title}
          className="bg-amber-400/25 text-text-primary rounded-sm px-0.5 underline decoration-dotted decoration-amber-400/70 cursor-help">
          {text.slice(start, end)}
        </mark>,
      )
    } else {
      out.push(
        <mark key={`h${m.hi}`} onClick={onRemove ? () => onRemove(m.hi as number) : undefined}
          className={cn('bg-accent/25 text-text-primary rounded-sm px-0.5', onRemove && 'cursor-pointer hover:bg-accent/40')}
          title={onRemove ? 'הסר סימון' : undefined}>
          {text.slice(start, end)}
        </mark>,
      )
    }
    cursor = end
  })
  if (cursor < text.length) out.push(<span key="tail">{text.slice(cursor)}</span>)
  return out
}
```

Update the call site (TranscriptBody.tsx:198-204) to pass `line.flags`:

```tsx
                        {renderText(
                          line.text,
                          line.highlights,
                          line.flags,
                          onRemoveHighlight ? (i) => onRemoveHighlight(section.id, line.id, i) : undefined,
                        )}
```

- [ ] **Step 2: Add the admin corrections panel in `TranscriptEditor`**

Immediately after the existing admin diagnostics `engine` block (TranscriptEditor.tsx:107-112), add:

```tsx
      {isAdmin && transcript.corrections && transcript.corrections.length > 0 && (
        <details className="no-print mb-4 text-2xs text-muted border border-border rounded px-2.5 py-1.5" dir="rtl">
          <summary className="cursor-pointer">תיקונים אוטומטיים: {transcript.corrections.length}</summary>
          <ul className="mt-2 space-y-1">
            {transcript.corrections.map((c, i) => (
              <li key={i} className="font-mono-num" dir="ltr">
                <span className="text-amber-400">{c.original}</span>
                {c.corrected ? <> → <span className="text-success">{c.corrected}</span></> : null}
                <span className="opacity-60"> · {c.kind}/{c.certainty}{c.reason ? ` · ${c.reason}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
```

- [ ] **Step 3: Typecheck + build the component tree**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/transcript/TranscriptBody.tsx src/components/transcript/TranscriptEditor.tsx
git commit -m "feat(ui): yellow verify flags in body + admin corrections panel"
```

---

## Task 9: The experiment — Run A / Run B vs gold

**Files:**
- Create: `scripts/run-experiment.ts`

- [ ] **Step 1: Implement the experiment runner**

Create `scripts/run-experiment.ts`. It reads the raw IVRIT text from the captured fixture JSON, runs the corrector twice (no list / with the throwaway list), writes both outputs, and scores all three (baseline=raw, Run A, Run B) against the gold.

```ts
// node --import tsx scripts/run-experiment.ts
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { correctTranscript, type Profile, type GptChunkFn } from '../src/lib/correction'
import { score } from './lib/measure-core'

const ROOT = process.cwd()
function env(k: string): string {
  const txt = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const m = txt.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const openai = new OpenAI({ apiKey: env('OPENAI_API_KEY') })
const gptChunk: GptChunkFn = (prompt) =>
  openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
    temperature: 0,
  }).then(r => r.choices[0].message.content ?? '{}')

// Raw IVRIT plain text out of the captured RunPod response.
function rawFromJson(): string {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.ivrit-raw.json'), 'utf8'))
  const segs: { text?: string }[] = j.output[0].result.flat()
  return segs.map(s => s.text ?? '').join('').trim()
}

const PROFILE: Profile = { company: 'אמפא', business: 'נדל"ן מניב', quarter: 'Q1 2026', speakers: 'זוהר רדי (ceo), שירן (moderator)' }

// THROWAWAY measuring stick — NOT shipped. Read off the gold.
const AMPA_ENTITIES = ['אמפא TLV', 'אמפא קפיטל', 'אמפא ישראל', 'אמפא יובלים', 'ToHa', 'מיטאון', 'עזריאלי טאון', 'בית אמצור', 'סרוגו', 'דוראל אורבן']

const gold = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ampa-q1-2026.gold.txt'), 'utf8')

const main = async () => {
  const raw = rawFromJson()
  const out = path.join(ROOT, 'scripts', 'out'); fs.mkdirSync(out, { recursive: true })

  console.log('Running Run A (no list)…')
  const a = await correctTranscript(raw, PROFILE, [], gptChunk)
  fs.writeFileSync(path.join(out, 'runA.txt'), a.text)

  console.log('Running Run B (+ hand-built list)…')
  const b = await correctTranscript(raw, PROFILE, AMPA_ENTITIES, gptChunk)
  fs.writeFileSync(path.join(out, 'runB.txt'), b.text)

  const show = (label: string, candidate: string, applied: number, flags: number) => {
    const s = score(raw, candidate, gold)
    console.log(`\n=== ${label} ===`)
    console.log(`applied: ${applied}  flagged: ${flags}`)
    console.log(`errors: baseline ${s.baselineErrors} -> candidate ${s.candidateErrors}  | FIXED ${s.fixed}  INTRODUCED ${s.introduced} ${s.introduced === 0 ? '✅' : '❌'}  remaining ${s.remaining}`)
  }
  show('RAW baseline', raw, 0, 0)
  show('Run A (no list, = shipped)', a.text, a.applied.length, a.flags.length)
  show('Run B (+ list, measurement)', b.text, b.applied.length, b.flags.length)
  console.log('\nOutputs: scripts/out/runA.txt, runB.txt')
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run the experiment**

Run: `node --import tsx scripts/run-experiment.ts`
Expected: prints three blocks. **Acceptance:** Run A shows `INTRODUCED 0 ✅` with `FIXED` > 0 (homophones fixed); Run B shows `INTRODUCED 0 ✅` with a higher `FIXED` (names fixed too). If `INTRODUCED > 0`, iterate the prompt in `buildCorrectionPrompt` (tighten "fix only clear ASR errors") and re-run until 0.

- [ ] **Step 3: Record the result + commit the script**

Append a short results note to the spec (the A→B delta + the introduced count), then:

```bash
git add scripts/run-experiment.ts docs/superpowers/specs/2026-06-08-transcript-correction-v1-design.md
git commit -m "feat(experiment): Run A/Run B corrector measurement vs gold"
```

---

## Task 10: End-to-end verification in the product

**Files:** none (manual verification)

- [ ] **Step 1: Typecheck + tests + build**

```bash
npx tsc --noEmit && npm test && npm run build
```
Expected: all green.

- [ ] **Step 2: Re-transcribe אמפא via the product**

Start dev (`npm run dev`), open the אמפא transcript, click **תמלל מחדש** (admin). When done, confirm:
- the transcript reads cleaner (homophones fixed);
- numbers / uncertain words show a **yellow** highlight; hovering shows *"מומלץ לשמוע את ההקלטה כדי לוודא את התמלול."*;
- the admin panel lists the applied corrections.

- [ ] **Step 3: Score the product output**

Copy the rendered transcript text to `scripts/out/product.txt` and run:
`node --import tsx scripts/measure.ts scripts/out/product.txt`
Expected: `INTRODUCED 0`, `FIXED` > 0 vs the current baseline.

- [ ] **Step 4: Final commit (if any tweaks were needed)**

```bash
git add -A && git commit -m "chore: V1 correction layer verified end-to-end"
```

---

## Self-Review notes (for the implementer)

- **Acceptance gate is `introduced == 0`** on Run A *and* the product run. A pass that breaks any correct word is a failure — tighten the prompt, don't relax the gate.
- **Run A is the shipped behavior** (entities `[]`). The `AMPA_ENTITIES` list lives only in `scripts/run-experiment.ts` and is never imported by `src/`.
- **Numbers are never auto-changed** — `routeItems` flags every `kind: 'number'` regardless of certainty.
- If `npm run build` complains about `*.test.ts` files, ensure they are excluded from the Next build (they are not imported by app code; Next only compiles imported modules, so this should be a non-issue — verify).
