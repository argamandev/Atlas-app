// ─────────────────────────────────────────────────────────────────────────────
// THE ENVIRONMENT MANIFEST.
//
// What a session is handed on every turn, declared once, in one place — and the
// parsers that read it. `src/lib/environment.test.ts` asserts against this and
// `npm run env:health` prints from it, so the guard and the number can never
// disagree about what a law is or which files load.
//
// WHY THIS EXISTS. The workflow imposes on the product a rule it did not obey
// itself: a lesson is not learned until a mechanism enforces it (ADR-0002).
// The always-on set had grown to ~60k tokens without anyone deciding to grow it,
// and laws marked `ENFORCED none` are exactly the ones that kept recurring — up
// to a 7th occurrence. So the workflow gets the same treatment the API routes
// got: enumerate from the filesystem, assert a structural property across all of
// it, and require a STATED REASON for every exception.
//
// Deliberately copied from `src/lib/apiAuthBoundary.test.ts`. Read it first if
// you are about to loosen anything here.
//
// STATED LIMITS, so nobody trusts this further than it goes:
//  - `estimateTokens` is an approximation, not a tokenizer. It is a drift alarm,
//    not an accounting system.
//  - Laws are enumerated by the `**LAW ·` marker. A rule written as prose without
//    that marker is invisible here — which is why `LAW_FORM_EXEMPT` below has to
//    name every always-on file that states its rules some other way, with a reason.
//  - Reference checking covers repo-relative Markdown only (see `SKIP_REFS`).
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * THE ALWAYS-ON SET — every document loaded into every session, with the reason
 * it earns that cost. Discovery (`discoverAlwaysOn`) reads the same set off the
 * filesystem; the test compares the two, so a file joining or leaving fails the
 * battery until this declaration is updated. That is the whole point: growth
 * becomes a deliberate act.
 *
 * This is TODAY's set, not the target set. ADR-0001 retires `parallel-work.md`
 * and moves `live.md` to on-demand; both still load until that ticket lands, and
 * a declaration that described the intended state rather than the real one would
 * be a test certifying an untrue premise.
 */
export const ALWAYS_ON = {
  'CLAUDE.md': 'the entry point: what Atlas is, the iron rules, the doc map',
  '.claude/rules/app.md': 'the app-level invariants — every one paid for by a defect that shipped',
  '.claude/rules/db.md': 'the database is SHARED with production Timlul; these constrain every migration',
  '.claude/rules/live.md':
    'live-engine operational facts. FACTS, not laws (CONTEXT.md) — ADR-0001 moves this to on-demand, which is ticket 02, not this one',
  '.claude/rules/parallel-work.md':
    'the fleet coordination rules. Retired by ADR-0001 — still loaded today, removed in ticket 02',
}

/**
 * The always-on set's ceiling, in estimated tokens.
 *
 * DO NOT restate today's measurement here. An earlier version of this comment
 * carried "~8.8k" from another document; it was 9.2k by the time anyone read it, and
 * `rules/app.md` names hand-carried counts as a defect this repo has shipped three
 * times. Run `npm run env:health` — it prints the current number and the headroom.
 *
 * The target of 6–8k arrives when ticket 02 removes two of the five files, and this
 * ceiling comes down WITH them. Raising it is allowed; raising it silently is not,
 * which is why the number lives here and prints in the failure.
 */
export const TOKEN_BUDGET = 10_000

/** Status is one page describing now. A cap is how "rewritten, never appended" stops being a hope. */
export const STATUS_FILE = 'STATUS.md'
export const STATUS_LINE_CAP = 60

/**
 * Always-on files that do not use the `**LAW ·` marker form, each with the reason.
 * Without this list the law scan would report "0 laws, all enforced" for them —
 * a green signal measuring nothing, which is the exact failure M1 names.
 */
export const LAW_FORM_EXEMPT = {
  'CLAUDE.md':
    'an index and an orientation, not a law file. Its "Iron rules" section points at the law files rather than restating them.',
  '.claude/rules/db.md':
    'states its rules as prose sections rather than LAW/ENFORCED blocks. NOT a claim that they are enforced — converting it to the marker form is re-homing work (ticket 02), and until then its rules are invisible to this scan.',
  '.claude/rules/live.md':
    'facts about two engines, not laws — a fact cannot be violated, only misunderstood (CONTEXT.md).',
  '.claude/rules/parallel-work.md':
    'the retired fleet apparatus (ADR-0001). Adding law markup to a document scheduled for deletion would be work spent on the wrong side of the migration.',
}

/**
 * Where a reference may legitimately resolve from — the roots a reader would try.
 * `.claude` is here because the always-on files write `rules/app.md` in prose,
 * which is how a human refers to it; the check should resolve what the document
 * actually says rather than force the document into the check's shape.
 */
const REF_ROOTS = ['.', '.claude', '.claude/rules', 'docs']

/**
 * References this check deliberately does not follow, each with the reason.
 * Anything skipped here is NOT verified — say so rather than let the check look
 * more complete than it is.
 */
export const SKIP_REFS = [
  [/^[a-z]:[/\\]/i, "absolute machine paths — true on the founder's box, not checkable anywhere else"],
  [
    /^(agent-memory\/|(BOARD|DECISIONS|cross-cutting|ready-queue)\.md$)/,
    "the fleet's shared brain lives outside the repo and is git-ignored, so no checkout can verify it. ADR-0001 retires all four; the pointers go with them in ticket 02",
  ],
  [/[{}<>*|]/, 'a pattern or placeholder (brace expansion, `<branch>`), not a path'],
]

/**
 * Every Markdown document the harness loads on its own, read off the filesystem.
 *
 * Both halves are discovered, neither is assumed. Every `.md` in `.claude/rules/`
 * loads, and so does EVERY `CLAUDE.md` in the tree — a nested one under `src/` is
 * picked up whenever work happens in that subtree, which is precisely the quiet way
 * the set grows. Hard-coding the root `CLAUDE.md` would have made this check answer
 * "yes, the declared file is still declared" and see nothing else.
 */
export function discoverAlwaysOn(root = REPO_ROOT) {
  const rules = readdirSync(join(root, '.claude', 'rules'))
    .filter((n) => n.endsWith('.md'))
    .map((n) => `.claude/rules/${n}`)

  const claudeMds = []
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue
      if (e.isDirectory()) walk(join(dir, e.name), rel ? `${rel}/${e.name}` : e.name)
      else if (e.name === 'CLAUDE.md') claudeMds.push(rel ? `${rel}/CLAUDE.md` : 'CLAUDE.md')
    }
  }
  walk(root, '')

  return [...claudeMds, ...rules].sort()
}

/**
 * Rough token count. Deliberately crude and deliberately documented as crude:
 * ~4 characters per token for English prose, which is the ratio these documents
 * sit at. It answers "has the always-on set drifted", not "what will the bill be".
 *
 * Line endings are normalised FIRST. `core.autocrlf=true` with no `.gitattributes`
 * means the working tree can be CRLF while every blob is LF (`rules/app.md`, the CRLF
 * trap), so counting raw characters would make the budget ~280 tokens larger on the
 * founder's machine than on a fresh clone — a measurement that reports the checkout
 * rather than the documents.
 */
export function estimateTokens(text) {
  return Math.ceil(text.replaceAll('\r\n', '\n').length / 4)
}

/** Each always-on file's estimated size, and the total. One implementation, two callers. */
export function alwaysOnSizes(root = REPO_ROOT) {
  const files = Object.keys(ALWAYS_ON).map(
    (f) => [f, estimateTokens(readFileSync(join(root, f), 'utf8'))] /** @type {const} */
  )
  return { files, total: files.reduce((n, [, t]) => n + t, 0) }
}

const LAW_MARKER = /^\*\*LAW · /
const SECTION_BREAK = /^(#{1,6} |---\s*$)/

/**
 * Split a law file into blocks, one per `**LAW ·` marker, each ending at the next
 * marker or the next section break.
 */
function lawBlocks(text) {
  const lines = text.split(/\r?\n/)
  const blocks = []
  let cur = null
  let section = 0
  lines.forEach((line, i) => {
    if (SECTION_BREAK.test(line)) {
      section++
      cur = null
      if (!LAW_MARKER.test(line)) return
    }
    if (LAW_MARKER.test(line)) {
      cur = {
        line: i + 1,
        section,
        title: line
          .replace(/^\*\*LAW · /, '')
          .replace(/\*\*.*$/, '')
          .trim(),
        body: [line],
      }
      blocks.push(cur)
      return
    }
    if (!cur) return
    cur.body.push(line)
  })
  return blocks.map((b) => ({ ...b, body: b.body.join('\n') }))
}

/**
 * Is this block nothing but the law paragraph itself?
 *
 * Only a BARE block may inherit the next block's declaration: one paragraph, no
 * `**VERIFY**` step of its own, no `→` pointer into case history. A block carrying
 * either has had a whole argument written about it without an enforcement line, and
 * treating that as "part of the group below" is how, in the first version of this
 * parser, two unenforced auth laws inherited the bidi section's `ENFORCED partially`
 * and a law with only a VERIFY step inherited the one below it. The run of four time
 * laws in `app.md` — four one-line statements under one test — is the shape this is
 * for, and the only shape it admits.
 */
function isBare(body) {
  if (/\*\*VERIFY\*\*/.test(body) || body.includes('→')) return false
  const lines = body.split('\n')
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '')
  const rest = end === -1 ? [] : lines.slice(end + 1)
  return rest.every((l) => l.trim() === '')
}

/**
 * How a block declares its enforcement.
 *
 * `none` and `partially` are declarations, not mechanisms — both count as
 * unenforced in the health metric, because a law enforced "for one surface" is
 * unenforced for every other one, and `app.md` says exactly that about bidi.
 */
function enforcementOf(body) {
  const declared = (marker) => {
    const at = body.search(marker)
    if (at === -1) return null
    // The reason is what THIS marker says, and it ends where the next marker begins.
    // Read to the end of the block instead and a bare `**ENFORCED** none` borrows the
    // `**VERIFY**` paragraph underneath it as its justification — which made the
    // "states why" test structurally unable to go red. It measured that the block had
    // prose in it, not that the declaration had a reason (M1).
    const after = body.slice(at).replace(marker, '')
    return after.split(/\*\*[A-Z]/)[0].trim()
  }

  const un = declared(/\*\*UNENFORCEABLE\*\*/)
  if (un !== null) return { kind: 'unenforceable', reason: un.replace(/^[—\-:,\s]+/, '') }
  const rest = declared(/\*\*ENFORCED\*\*/)
  if (rest === null) return { kind: 'missing', reason: '' }
  if (/^none\b/i.test(rest))
    return { kind: 'none', reason: rest.replace(/^none\b[,\s]*/i, '').replace(/^[—\-:,\s]+/, '') }
  if (/^partial(ly)?\b/i.test(rest))
    return {
      kind: 'partial',
      reason: rest.replace(/^partial(ly)?\b[,\s]*/i, '').replace(/^[—\-:,\s]+/, ''),
    }
  return { kind: 'mechanism', reason: rest }
}

/**
 * Every law in a file, with the enforcement its GROUP declares.
 *
 * BARE consecutive law markers, inside one section, with no enforcement between
 * them form one group sharing the mechanism that follows — the four time laws in
 * `app.md` are written that way and one test covers all four. A block that says
 * anything beyond the law itself, or that sits in a different section, is on its
 * own. `groupSize` is reported so a reader can see how many laws one mechanism is
 * being asked to carry.
 */
export function parseLaws(text, file) {
  const blocks = lawBlocks(text)
  const laws = []
  let group = []
  const flush = (enf) => {
    for (const l of group) laws.push({ ...l, enforcement: enf, groupSize: group.length })
    group = []
  }
  const MISSING = { kind: 'missing', reason: '' }
  for (const b of blocks) {
    const enf = enforcementOf(b.body)
    if (group.length && group[0].section !== b.section) flush(MISSING)
    group.push({ file, line: b.line, section: b.section, title: b.title })
    if (enf.kind !== 'missing') flush(enf)
    else if (!isBare(b.body)) flush(MISSING)
  }
  flush(MISSING)
  return laws.sort((a, b) => a.line - b.line)
}

/** Every law across the always-on set. */
export function allLaws(root = REPO_ROOT) {
  return Object.keys(ALWAYS_ON)
    .filter((f) => !(f in LAW_FORM_EXEMPT))
    .flatMap((f) => parseLaws(readFileSync(join(root, f), 'utf8'), f))
}

/** Laws that declare no working mechanism — the number this whole migration exists to drive down. */
export function unenforced(laws) {
  return laws.filter((l) => l.enforcement.kind === 'none' || l.enforcement.kind === 'partial')
}

/**
 * Markdown documents an always-on file points at, minus the ones we deliberately do
 * not follow. Both forms these documents actually use are read: a backticked path,
 * and a Markdown link target.
 */
export function referencedDocs(text) {
  const out = new Set()
  const add = (t) => {
    t = t.trim()
    if (!/\.md$/.test(t)) return
    if (SKIP_REFS.some(([re]) => re.test(t))) return
    out.add(t)
  }
  for (const m of text.matchAll(/`([^`\n]+)`/g)) add(m[1])
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) add(m[1])
  return [...out]
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist'])

/** Every Markdown file in the checkout, indexed by basename. Built once, on demand. */
const docIndexes = new Map()
function markdownByName(root) {
  if (docIndexes.has(root)) return docIndexes.get(root)
  const docIndex = new Set()
  docIndexes.set(root, docIndex)
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(name.name)) continue
      if (name.isDirectory()) walk(join(dir, name.name))
      else if (name.name.endsWith('.md')) docIndex.add(name.name)
    }
  }
  walk(root)
  return docIndex
}

/**
 * Resolve a reference the way a reader would.
 *
 * A path resolves from one of the roots above. A BARE name — `STATUS.md`,
 * `2026-08-09-documents-catalog-findings.md` — resolves if a file by that name
 * exists anywhere in the checkout, because that is what a reader does with it:
 * searches. STATED LIMIT: a bare name therefore proves the document EXISTS, not
 * that it is the one the sentence meant.
 */
export function resolveDoc(ref, root = REPO_ROOT) {
  if (REF_ROOTS.some((r) => existsSync(join(root, r, ref)))) return true
  return !ref.includes('/') && markdownByName(root).has(ref)
}
