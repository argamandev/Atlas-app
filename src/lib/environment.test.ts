import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE ENVIRONMENT BOUNDARY.
//
// The workflow imposes a rule on the product — a law is not learned until a
// mechanism enforces it (ADR-0002) — while exempting itself from it. This is the
// move `apiAuthBoundary.test.ts` made for API routes, applied to the workflow:
// enumerate from the filesystem, assert a structural property across all of it,
// and require a STATED REASON for every exception.
//
// WHAT IT ASSERTS, and why each one is a class of drift rather than an instance:
//
//  1. The always-on set is exactly what is declared. It grew to ~60k tokens
//     without anyone deciding to grow it, one reasonable file at a time — the
//     same shape as the API auth drift, where the notes said "two routes" and a
//     command found sixteen. A file joining or leaving now fails the battery.
//  2. That set stays inside a stated token budget, printed in the failure. A
//     budget nobody can see is a preference.
//  3. `STATUS.md` stays under a line cap, which is what makes "rewritten, never
//     appended" a fact instead of an intention.
//  4. Every law declares its enforcement — a mechanism, or `ENFORCED none` /
//     `UNENFORCEABLE` WITH A REASON. Honest marking passes. That is deliberate:
//     a hard gate with no escape hatch pressures people into writing fake
//     mechanisms, and a law that merely LOOKS enforced is worse than one honestly
//     marked unenforced.
//  5. Everything the always-on set points at exists.
//
// WHAT IT DOES NOT ASSERT, said here so nobody trusts it further than it goes:
// no assertion here is about the PROSE of any document. A test that pins a
// sentence dies the first time someone improves the sentence, and on its way out
// it teaches everyone that the battery is noise. It also cannot tell a good law
// from a bad one, or a real mechanism from a file path that no longer resolves —
// only that a declaration is present and reasoned.
//
// The count of unenforced laws is deliberately NOT capped. It is a measurement,
// reported by `npm run env:health`, and the whole migration exists to drive it
// down; a cap here would just teach people to stop declaring.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ALWAYS_ON,
  LAW_FORM_EXEMPT,
  REPO_ROOT,
  RETIRED_VOCABULARY,
  SKIP_REFS,
  STATUS_FILE,
  STATUS_LINE_CAP,
  TOKEN_BUDGET,
  VOCABULARY_EXEMPT,
  withoutArchivePaths,
  allLaws,
  alwaysOnSizes,
  discoverAlwaysOn,
  importsOf,
  parseLaws,
  referencedDocs,
  resolveDoc,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM module, deliberately outside tsconfig's TS program
} from '../../scripts/lib/env-manifest.mjs'

const read = (f: string) => readFileSync(join(REPO_ROOT, f), 'utf8')

test('the always-on set is exactly the declared set', () => {
  const declared = Object.keys(ALWAYS_ON).sort()
  const onDisk: string[] = discoverAlwaysOn()

  // Guard the guard: a broken walk would make this pass by comparing nothing.
  assert.ok(onDisk.length >= 3, `discovered only ${onDisk.length} always-on files — is the walk broken?`)

  assert.deepEqual(
    onDisk,
    declared,
    'The set of documents loaded into EVERY session no longer matches the declaration in ' +
      'scripts/lib/env-manifest.mjs.\n' +
      `  on disk:  ${onDisk.join(', ')}\n` +
      `  declared: ${declared.join(', ')}\n\n` +
      'Adding a file here costs every session, every turn, forever. If it belongs, declare it in ' +
      'ALWAYS_ON with the reason it earns that cost. If it is reference material, it is a FACT ' +
      '(CONTEXT.md) and belongs on-demand, not here.'
  )
})

test('every always-on file states why it earns a place, and exists', () => {
  for (const [file, reason] of Object.entries(ALWAYS_ON)) {
    assert.ok(existsSync(join(REPO_ROOT, file)), `ALWAYS_ON declares ${file}, which does not exist`)
    assert.ok(
      reason.trim().length > 20,
      `ALWAYS_ON["${file}"] needs a real reason, not a placeholder — this list is the entire ` +
        'per-session cost and should be readable in full by a human.'
    )
  }
})

test('the always-on set stays inside its token budget', () => {
  const { files, total } = alwaysOnSizes() as { files: [string, number][]; total: number }

  assert.ok(
    total <= TOKEN_BUDGET,
    `the always-on set is ~${total} tokens against a budget of ${TOKEN_BUDGET}:\n` +
      files.map(([f, t]) => `  ${String(t).padStart(6)}  ${f}`).join('\n') +
      '\n\nThis is what every session pays before it reads a single line of code. Either take ' +
      'something out — a FACT loads on demand, HISTORY loads when a law is challenged (CONTEXT.md) ' +
      '— or raise TOKEN_BUDGET in scripts/lib/env-manifest.mjs deliberately and say why in the commit.'
  )
})

test('STATUS.md stays one page', () => {
  const lines = read(STATUS_FILE).split(/\r?\n/).length
  assert.ok(
    lines <= STATUS_LINE_CAP,
    `${STATUS_FILE} is ${lines} lines against a cap of ${STATUS_LINE_CAP}. It is rewritten, never ` +
      'appended: anything that has landed gets removed, and anything dated belongs in PROGRESS.md ' +
      'or docs/case-history/. A status file that only grows is how the last board started.'
  )
})

test('every law declares its enforcement', () => {
  const laws = allLaws()

  // Guard the guard: if the parser stops recognising the marker, this test would
  // pass by checking nothing — which is exactly the false green it exists to catch.
  assert.ok(laws.length >= 20, `only ${laws.length} laws parsed — has the **LAW · marker changed?`)

  const bare = laws
    .filter((l: { enforcement: { kind: string } }) => l.enforcement.kind === 'missing')
    .map((l: { file: string; line: number; title: string }) => `${l.file}:${l.line}  ${l.title}`)

  assert.deepEqual(
    bare,
    [],
    `these laws declare no enforcement at all:\n  ${bare.join('\n  ')}\n\n` +
      'Every law carries one of: **ENFORCED** <mechanism> · **ENFORCED** none — <why nothing ' +
      'catches it> · **UNENFORCEABLE** — <why nothing could>. Marking it honestly is enough to ' +
      'pass; you do not have to build the mechanism in the same breath. A bare law is the state ' +
      'ADR-0002 exists to end — it reads as enforced and is not.'
  )
})

test('a law that declares no mechanism states why', () => {
  const unreasoned = allLaws()
    .filter((l: { enforcement: { kind: string } }) =>
      ['none', 'partial', 'unenforceable'].includes(l.enforcement.kind)
    )
    .filter((l: { enforcement: { reason: string } }) => l.enforcement.reason.trim().length < 25)
    .map(
      (l: { file: string; line: number; enforcement: { kind: string }; title: string }) =>
        `${l.file}:${l.line}  [${l.enforcement.kind}]  ${l.title}`
    )

  assert.deepEqual(
    unreasoned,
    [],
    `these laws admit they are not enforced but do not say why:\n  ${unreasoned.join('\n  ')}\n\n` +
      'The reason is the whole value of the declaration — it is what tells the next person which ' +
      'mechanism is missing and what it would have to check. "ENFORCED none" on its own is a ' +
      'shrug, and a shrug is what this file replaced.'
  )
})

test('no single mechanism is asked to carry an unbounded run of laws', () => {
  // Grouping is real — four one-line time laws share one test — but it is also the
  // one way a law can arrive already declared: insert a bare `**LAW ·` above an
  // enforced one and it inherits the marker. A ceiling does not close that, it makes
  // it VISIBLE, the same way the PUBLIC allowlist in apiAuthBoundary.test.ts caps the
  // anonymous surface at 8 so that growing it has to be argued for.
  const CEILING = 4
  const oversized = allLaws()
    .filter((l: { groupSize: number }) => l.groupSize > CEILING)
    .map((l: { file: string; line: number; groupSize: number }) => `${l.file}:${l.line} (${l.groupSize})`)

  assert.deepEqual(
    oversized,
    [],
    `one **ENFORCED** marker is being shared by more than ${CEILING} laws:\n  ${oversized.join('\n  ')}\n\n` +
      'Give the new law its own declaration, or raise CEILING here deliberately and say in the ' +
      'commit which mechanism genuinely covers all of them.'
  )
})

test('an always-on file that states no laws in marker form says why', () => {
  for (const [file, reason] of Object.entries(LAW_FORM_EXEMPT)) {
    assert.ok(
      file in ALWAYS_ON,
      `LAW_FORM_EXEMPT names ${file}, which is not in the always-on set — a stale exemption`
    )
    assert.ok(
      reason.trim().length > 40,
      `LAW_FORM_EXEMPT["${file}"] needs a real reason. Exempting a file from the law scan means ` +
        'its rules are invisible to the health metric, and that has to be a stated choice.'
    )
  }

  // The exemption must not swallow the law file itself: app.md is where the scan
  // earns its keep, and an empty result there would be a green signal measuring nothing.
  const appLaws = parseLaws(read('.claude/rules/app.md'), '.claude/rules/app.md')
  assert.ok(appLaws.length >= 20, `app.md yielded only ${appLaws.length} laws — the parser is broken`)
})

// ─── The parser, against fixtures ────────────────────────────────────────────
// Everything above asserts over the REAL documents, and today they all pass. A
// guard that has only ever been seen green is indistinguishable from a guard that
// cannot go red — the failure this repo has already filed as "a test that asserts
// the defect defends it". These fixtures are where the parser is shown failing.

const LAW = (title: string, body = '') => `**LAW · ${title}**${body ? '\n' + body : ''}`

test('a law with no enforcement declaration is caught', () => {
  const laws = parseLaws(`## S\n\n${LAW('bare', 'Some reasoning. → `#case`')}\n`, 'fixture.md')
  assert.equal(laws.length, 1)
  assert.equal(laws[0].enforcement.kind, 'missing')
})

test('the kinds are told apart, and the reason is captured', () => {
  const cases: [string, string][] = [
    ['**ENFORCED** `src/lib/x.test.ts` covers it.', 'mechanism'],
    ['**ENFORCED** none — nothing scans for this at all.', 'none'],
    ['**ENFORCED** partially — one surface only.', 'partial'],
    ['**UNENFORCEABLE** — it is a judgement about a design.', 'unenforceable'],
  ]
  for (const [line, kind] of cases) {
    const [law] = parseLaws(`## S\n\n${LAW('x', line)}\n`, 'fixture.md')
    assert.equal(law.enforcement.kind, kind, `"${line}" should read as ${kind}`)
    assert.ok(law.enforcement.reason.length > 0, `"${line}" lost its reason`)
  }
})

test('a declaration cannot borrow the paragraph below it as its reason', () => {
  // This is the shape that made the "states why" test structurally unable to fail: the
  // reason was read to the end of the block, so a bare `**ENFORCED** none` picked up
  // whatever VERIFY paragraph followed and sailed past the length check. The guard was
  // measuring that the block contained prose, not that the declaration was justified.
  const borrowed = LAW(
    'x',
    '**ENFORCED** none\n**VERIFY** a long paragraph that belongs to the law, not to the declaration.'
  )
  const [law] = parseLaws(`## S\n\n${borrowed}\n`, 'fixture.md')
  assert.equal(law.enforcement.kind, 'none')
  assert.ok(
    law.enforcement.reason.length < 25,
    `a reasonless declaration borrowed ${law.enforcement.reason.length} characters from the ` +
      `paragraph below it: "${law.enforcement.reason}"`
  )

  // And the honest form still reads as reasoned.
  const [ok] = parseLaws(
    `## S\n\n${LAW('y', '**ENFORCED** none — nothing scans for this anywhere.\n**VERIFY** look.')}\n`,
    'fixture.md'
  )
  assert.ok(ok.enforcement.reason.startsWith('nothing scans'), ok.enforcement.reason)
})

test('a run of bare one-line laws shares the mechanism below it', () => {
  // The four time laws in app.md are written this way: four statements, one test.
  const src = `## S\n\n${LAW('a')}\n${LAW('b')}\n${LAW('c', '**ENFORCED** `x.test.ts`.')}\n`
  const laws = parseLaws(src, 'fixture.md')
  assert.deepEqual(
    laws.map((l: { enforcement: { kind: string } }) => l.enforcement.kind),
    ['mechanism', 'mechanism', 'mechanism']
  )
  assert.deepEqual(
    laws.map((l: { groupSize: number }) => l.groupSize),
    [3, 3, 3]
  )
})

test('a law does NOT inherit a mechanism across a section, or past its own argument', () => {
  // Both of these passed in the first version of this parser, and both were wrong:
  // two unenforced auth laws inherited the bidi section's `ENFORCED partially`,
  // and a law whose only follow-up was a VERIFY step inherited the law below it.
  const acrossSection = `## One\n\n${LAW('a')}\n\n## Two\n\n${LAW('b', '**ENFORCED** `x.test.ts`.')}\n`
  assert.equal(parseLaws(acrossSection, 'fixture.md')[0].enforcement.kind, 'missing')

  const pastArgument = `## S\n\n${LAW('a', '**VERIFY** go and look.')}\n\n${LAW('b', '**ENFORCED** `x.test.ts`.')}\n`
  assert.equal(parseLaws(pastArgument, 'fixture.md')[0].enforcement.kind, 'missing')

  const pastPointer = `## S\n\n${LAW('a', 'Reasoning. → `#case`')}\n\n${LAW('b', '**ENFORCED** `x.test.ts`.')}\n`
  assert.equal(parseLaws(pastPointer, 'fixture.md')[0].enforcement.kind, 'missing')
})

// ─── The retired apparatus cannot come back ──────────────────────────────────

test('the retired fleet vocabulary does not appear in the always-on set', () => {
  const offences: string[] = []
  for (const file of Object.keys(ALWAYS_ON)) {
    if (file in VOCABULARY_EXEMPT) continue
    const lines = read(file).split(/\r?\n/)
    for (const [pattern, why] of RETIRED_VOCABULARY as [RegExp, string][]) {
      lines.forEach((line, i) => {
        // A citation INTO docs/archive/ points at history, which is where the
        // retirement put these things. A pointer at a live apparatus still fails.
        if (pattern.test(withoutArchivePaths(line)))
          offences.push(`${file}:${i + 1}  ${String(pattern)} — ${why}\n    ${line.trim()}`)
      })
    }
  }

  assert.deepEqual(
    offences,
    [],
    `the always-on set names something ADR-0001 retired:\n  ${offences.join('\n  ')}\n\n` +
      'The apparatus did not arrive all at once and it will not return all at once either — it ' +
      'comes back one reasonable-looking paragraph at a time. If a session genuinely needs this ' +
      'concept, it is HISTORY and lives in docs/archive/; if the word has a new meaning, define ' +
      'it in CONTEXT.md and exempt the file in VOCABULARY_EXEMPT with the reason.'
  )
})

test('the vocabulary guard can actually go red, and its exemption is real', () => {
  // Guard the guard. Everything above has only ever been seen green, and a pattern
  // that matches nothing is indistinguishable from a set that is clean.
  const sample = 'The supervisor assigns each lane a port and reads agent-memory/BOARD.md.'
  const hits = (RETIRED_VOCABULARY as [RegExp, string][]).filter(([re]) => re.test(sample))
  assert.ok(
    hits.length >= 4,
    `the retired-vocabulary patterns matched only ${hits.length} of 4+ in a sentence built from them`
  )

  // ...and it must not fire on ordinary English that merely contains the letters.
  const innocent = 'The plane landed. Planetary alignment. A clean explanation.'
  for (const [re] of RETIRED_VOCABULARY as [RegExp, string][]) {
    assert.ok(!re.test(innocent), `${String(re)} matches ordinary prose: "${innocent}"`)
  }

  // Citing history is allowed; pointing at a live apparatus is not. Both directions,
  // because an exemption that swallows the live case would retire the guard silently.
  const cite = 'the FINDING entries in `docs/archive/ready-queue-2026-07-03--2026-08-10.md`'
  const live = 'append it to `agent-memory/ready-queue.md` before you start'
  const queue = (RETIRED_VOCABULARY as [RegExp, string][]).find(([re]) => String(re).includes('ready-queue'))!
  assert.ok(!queue[0].test(withoutArchivePaths(cite)), 'a citation into docs/archive/ must be allowed')
  assert.ok(queue[0].test(withoutArchivePaths(live)), 'a pointer at the live queue must still fail')
  assert.ok(
    /\bcross-cutting\b/i.test(withoutArchivePaths('docs/archive/x.md says cross-cutting is the channel')),
    'only the archive PATH is blanked — the bare word elsewhere on the line still counts'
  )

  // Every exemption names a file that is actually in the set, with a stated reason —
  // a stale exemption is a hole nobody can see.
  for (const [file, reason] of Object.entries(VOCABULARY_EXEMPT)) {
    assert.ok(file in ALWAYS_ON, `VOCABULARY_EXEMPT names ${file}, which is not in the always-on set`)
    assert.ok(
      reason.trim().length > 40,
      `VOCABULARY_EXEMPT["${file}"] needs a real reason — exempting a file lets the whole retired ` +
        'apparatus back in through it.'
    )
  }
})

test('@imports are followed, so the budget measures what is actually loaded', () => {
  // `@imports` expand eagerly: `@docs/VISION.md` costs exactly what pasting the file
  // in costs. A discovery that stops at the pointer would price the set at half what
  // a session is handed and report it green.
  assert.deepEqual(importsOf('@CONTEXT.md\n@STATUS.md\n'), ['CONTEXT.md', 'STATUS.md'])
  assert.deepEqual(importsOf('@./STATUS.md'), ['STATUS.md'], 'a ./ prefix is the same file')

  // Prose and examples are not imports. Both forms appear in this repo's documents,
  // and matching them would invent always-on files that do not exist.
  assert.deepEqual(importsOf('ask @sagi about it'), [])
  assert.deepEqual(importsOf('write `@imports` like this'), [])
  assert.deepEqual(importsOf('```\n@docs/VISION.md\n```\n'), [], 'a fenced example is not a use')

  // And the real CLAUDE.md's imports are in the declared set, not merely resolvable.
  for (const ref of importsOf(read('CLAUDE.md')) as string[]) {
    assert.ok(
      ref in ALWAYS_ON,
      `CLAUDE.md imports ${ref}, which is not declared in ALWAYS_ON — an import is not a pointer, ` +
        'it is a paste, and it costs every session every turn.'
    )
  }
})

test('every document the always-on set points at exists', () => {
  const broken: string[] = []
  for (const file of Object.keys(ALWAYS_ON)) {
    for (const ref of referencedDocs(read(file)) as string[]) {
      if (!resolveDoc(ref)) broken.push(`${file} → ${ref}`)
    }
  }

  assert.deepEqual(
    broken,
    [],
    `the always-on set points at documents that do not exist:\n  ${broken.join('\n  ')}\n\n` +
      'A session told to read a file that is not there loses the thread and starts guessing. ' +
      'Fix the path, or remove the pointer.'
  )

  // Every skipped class of reference states why it is skipped — otherwise the check
  // above looks more complete than it is, which is the failure mode M1 names.
  for (const [pattern, reason] of SKIP_REFS as [RegExp, string][]) {
    assert.ok(reason.trim().length > 20, `SKIP_REFS ${pattern} needs a stated reason`)
  }
})
