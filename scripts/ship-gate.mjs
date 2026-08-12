#!/usr/bin/env node
// The ship gate:  npm run ship:gate  [-- --branch <name>]
//
// Everything the ship ritual asks for that a machine can actually check, plus the
// list of things only a human can — generated from the laws rather than copied out
// of them. Run it before merging; `.claude/hooks/pre-bash-gate.mjs` also runs it at
// the merge itself, so it fires whether or not anyone read the skill.
//
// Three sections, in the order they matter:
//   1. WHAT ONLY YOU CAN CHECK — every law that declares no working mechanism and
//      carries a **VERIFY** step, printed in full. Ticket 03: compliance stops
//      depending on someone recalling rule 14 of 27.
//   2. UNENFORCED LAWS — the count ADR-0002 exists to drive down, at the moment it
//      is cheapest to move, reported so the trend is visible rather than recalled.
//   3. THE GATE — eviction (STATUS.md rewritten, PROGRESS.md appended, closed
//      working notes filed as history) and promotion (every review finding answers
//      the recurrence question, and a recurrence buys a stronger mechanism).
//
// Only section 3 can fail the command. Sections 1 and 2 are a ritual gate and a
// measurement; printing them is all a script can honestly do, and saying so is
// better than a checkbox that proves someone typed "y".
//
// The rules themselves are pure functions in `scripts/lib/ship-gate.mjs`, tested in
// `src/lib/shipGate.test.ts`. This file is the git and filesystem half: it turns a
// branch into the numbers those rules judge.

import { execFileSync } from 'node:child_process'
import {
  ALWAYS_ON,
  LAW_FORM_EXEMPT,
  STATUS_FILE,
  STATUS_LINE_CAP,
  parseLaws,
  unenforced,
} from './lib/env-manifest.mjs'
import {
  closedScratchDirs,
  evictionProblems,
  parseReviewRecord,
  recurrenceProblems,
  reviewProblems,
} from './lib/ship-gate.mjs'

const BASE = 'main'
const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? null : argv[i + 1]
}
const cwd = flag('cwd') ?? process.cwd()
// stdio is pinned: execFileSync lets the child's stderr through to ours by default,
// so every `git show` of a file that does not exist yet printed a raw `fatal: path
// … does not exist` above this gate's own explanation of the same fact. The absence
// is expected here and gitOrNull already speaks for it.
const git = (...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] })
const gitOrNull = (...args) => {
  try {
    return git(...args)
  } catch {
    return null
  }
}

const branch = flag('branch') ?? git('rev-parse', '--abbrev-ref', 'HEAD').trim()
if (branch === BASE) {
  console.error(
    `ship-gate: nothing to gate — "${branch}" is the base branch itself. Run this on the feature branch.`
  )
  process.exit(1)
}

// ── 1 + 2. What only a human can check, and the number that must trend down ──
// Read from the BRANCH's law files, not the working tree: the checklist a merge is
// judged against is the one the merge is bringing with it.
const lawFiles = Object.keys(ALWAYS_ON).filter((f) => !(f in LAW_FORM_EXEMPT))
const lawsAt = (ref) =>
  lawFiles.flatMap((f) => {
    const text = gitOrNull('show', `${ref}:${f}`)
    return text === null ? [] : parseLaws(text, f)
  })

const before = lawsAt(BASE)
const after = lawsAt(branch)

// A law nothing mechanical catches, that also tells you what to go and look at.
// The two conditions are separate: a bare law with no VERIFY step is a gap in
// `app.md`, not a checklist item, and inventing a step for it here would be this
// repo's own defect — a mechanism that only looks like one.
const manual = after.filter((l) => l.enforcement.kind !== 'mechanism' && l.verify)

console.log(
  `WHAT ONLY YOU CAN CHECK  (${manual.length} laws on ${branch}, nothing automatic reaches these)\n`
)
manual.forEach((l, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${l.title}`)
  console.log(`      ${l.file}:${l.line}  [${l.enforcement.kind}]`)
  console.log(`      ${l.verify}\n`)
})

const open = unenforced(after)
console.log(`UNENFORCED LAWS: ${open.length} on ${branch}, ${unenforced(before).length} on ${BASE}`)
console.log('  ADR-0002: this number is what "self-improving" means here. Review is where it moves.\n')

// ── 3. The gate ──────────────────────────────────────────────────────────────
// Everything below is measured against `main...branch` — what this branch adds on
// top of the merge base, which is exactly what the merge will carry over.
const numstat = (file) => {
  const line = git('diff', '--numstat', `${BASE}...${branch}`, '--', file).trim()
  if (!line) return { added: 0, removed: 0 }
  const [a, r] = line.split('\n')[0].split('\t')
  // A binary file reports "-\t-". Neither of these is binary; if one ever is,
  // reading it as 0 would silently pass the gate, so it is an error instead.
  if (a === '-' || r === '-') throw new Error(`${file} reads as binary in git diff --numstat`)
  return { added: Number(a), removed: Number(r) }
}

const status = numstat(STATUS_FILE)
const progress = numstat('PROGRESS.md')
const statusText = gitOrNull('show', `${branch}:${STATUS_FILE}`) ?? ''

// Closed working notes still sitting in .scratch/, read off the branch's tree so the
// answer is about what is being merged rather than about the working directory.
const STATUS_LINE = /^\s*(?:\*\*)?Status(?:\*\*)?\s*:\s*(?:\*\*)?\s*([A-Za-z][\w-]*)/m
const scratchFiles = (gitOrNull('ls-tree', '-r', '--name-only', branch, '--', '.scratch') ?? '')
  .split('\n')
  .filter((p) => p.endsWith('.md'))
const entries = scratchFiles.map((path) => ({
  dir: path.split('/').slice(0, 2).join('/'),
  status: STATUS_LINE.exec(gitOrNull('show', `${branch}:${path}`) ?? '')?.[1] ?? null,
}))

const problems = evictionProblems({
  statusAdded: status.added,
  statusRemoved: status.removed,
  statusExistedAtBase: gitOrNull('cat-file', '-e', `${BASE}:${STATUS_FILE}`) !== null,
  statusLines: statusText.split(/\r?\n/).length,
  statusCap: STATUS_LINE_CAP,
  progressAdded: progress.added,
  progressRemoved: progress.removed,
  unarchivedScratch: closedScratchDirs(entries),
})

// The review record. It has to be TRACKED ON THE BRANCH, not merely present on disk:
// /ship's durable-evidence law exists because a worktree path, a session temp dir and
// an external URL all expire, and the only copy of a review is exactly the thing that
// must not.
const RECORD = `docs/evidence/${branch.replaceAll('/', '-')}/review.md`
const recordText = gitOrNull('show', `${branch}:${RECORD}`)
if (recordText === null) {
  problems.push(
    `no review record at ${RECORD} on this branch. Cold review is the step that repeatedly caught what ` +
      'the author missed, and its verdict has to be a tracked file before it can be cited. Dispatch the ' +
      'atlas-reviewer subagent, then file its verdict there — one FINDING line per defect, each answered ' +
      'with "RECURRENCE: no" or "RECURRENCE: yes → <law>".'
  )
} else {
  const record = parseReviewRecord(recordText)
  problems.push(...reviewProblems(record).map((p) => `${RECORD}: ${p}`))
  problems.push(...recurrenceProblems(record, before, after).map((p) => `${RECORD}: ${p}`))
}

if (problems.length) {
  console.error(`SHIP GATE: ${problems.length} thing(s) this merge still owes.\n`)
  for (const p of problems) console.error(`  ✗ ${p}\n`)
  console.error(
    'These are the two rituals ADR-0001 and ADR-0002 bind to the merge: work that lands leaves its notes ' +
      'as history in the same motion, and a defect that has happened before buys a stronger mechanism ' +
      'while the branch is still open. Both are cheap here and expensive anywhere else.\n' +
      'Genuinely wrong for this merge? ATLAS_SHIP_OVERRIDE="<why>" prefixed to the git merge takes the ' +
      'hook out of the way, and says so in the transcript.'
  )
  process.exit(1)
}

console.log(
  `SHIP GATE: clear. ${branch} evicts its notes, rewrites ${STATUS_FILE}, and answers its findings.`
)
