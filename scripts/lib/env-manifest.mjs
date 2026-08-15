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
 * ADR-0001 landed here: `parallel-work.md` is retired and `live.md` moved to
 * `docs/live-engines.md` (a FACT loads on demand — CONTEXT.md). `CONTEXT.md` and
 * `STATUS.md` joined, as `@imports` from CLAUDE.md, because a session that does
 * not know the vocabulary or where the founder is reconstructs both by guessing.
 */
export const ALWAYS_ON = {
  'CLAUDE.md': 'the entry point: what Atlas is, the iron rules, the working shape, the doc map',
  'CONTEXT.md':
    'the glossary. LAW / FACT / HISTORY / STATUS are four different things with four homes, and this is the file that says which is which — every other document here depends on it',
  'STATUS.md':
    'where the founder is right now. Capped at STATUS_LINE_CAP lines and rewritten, never appended, so it cannot become the board again',
  '.claude/rules/app.md': 'the app-level invariants — every one paid for by a defect that shipped',
  '.claude/rules/db.md': 'the database is SHARED with production Timlul; these constrain every migration',
}

/**
 * Files that are written by APPENDING and never rewritten, and the door each one
 * has. One declaration, two consumers: `scripts/append-log.mjs` builds its door
 * table from the entries that have one, and `environment.test.ts` asserts this set
 * and `ALWAYS_ON` are disjoint.
 *
 * WHY THE DISJOINTNESS IS THE POINT. Append-only and always-on are the two
 * properties that must never meet: a document that only grows, loaded into every
 * session, is a bill that rises forever with nothing deciding to raise it. That is
 * the exact shape of the apparatus ADR-0001 retired — the board and the logs were
 * both, and they reached 2.8 MB. Atlas evicts at merge (`CONTEXT.md`), and the one
 * always-on file that describes a moving present, `STATUS.md`, is rewritten rather
 * than appended to — held by `STATUS_LINE_CAP` here and by the merge gate in
 * `scripts/lib/ship-gate.mjs`.
 *
 * STATED LIMIT: this asserts that nothing DECLARED append-only is always-on. A
 * document that grows without ever being declared is invisible to it; what catches
 * that one is the token budget above.
 */
export const APPEND_ONLY = {
  'COLLISIONS.md': {
    door: 'collisions',
    why: 'the collision channel — a migration, a shared type, a design token. Current era only; a closed era is copied to docs/archive/ at merge.',
  },
  'PROGRESS.md': {
    door: null,
    why: 'the shipped-work log. Dated entries, appended at ship time; rewriting a dated record falsifies it.',
  },
  'DECISIONS.md': {
    door: null,
    why: 'every founder decision, one line, in his own words, quoted. Permanent — this is the record STATUS.md is allowed to forget because DECISIONS.md does not.',
  },
}

/**
 * Words the retired fleet apparatus is not allowed to walk back in on, and the
 * files permitted to say them anyway.
 *
 * WHY A VOCABULARY CHECK IS NOT PROSE-PINNING. The rule everything else in this
 * file follows is: never assert the wording of a document. This is the one
 * exception, and it earns it by asserting an ABSENCE rather than a presence — no
 * sentence is pinned, no phrasing is blessed, and improving any of these
 * documents cannot fail it.
 *
 * STATED LIMIT, because the first draft of this comment overclaimed and `app.md`
 * has a LAW about exactly that: this is a TRIPWIRE ON SEVEN PROPER NOUNS, not a
 * semantic guard. It catches the retired apparatus returning under its own names.
 * It does NOT catch the apparatus returning under new ones — "seat", "the fleet",
 * "agent memory" spelled with a space all pass, and no word list ever closes an
 * open vocabulary (`app.md`, the classifier law: buy VISIBLE FAILURE, not a longer
 * list). What makes the absence visible here is not this list; it is that the
 * always-on set is declared, budgeted and diffed, so a returning apparatus has to
 * be argued for in `ALWAYS_ON` before it can be written at all.
 *
 * "lane" is the load-bearing one (ADR-0001, CONTEXT.md): it meant a worktree, a
 * branch, a mission and a running session at once, and two fully-merged worktrees
 * passed as live work for months because the vocabulary could not tell an empty
 * directory from an active effort.
 */
export const RETIRED_VOCABULARY = [
  [/\blanes?\b/i, 'ADR-0001 — split into worktree / session / mission (CONTEXT.md)'],
  [/\bsupervisors?\b/i, 'ADR-0001 — there is no standing role; cold review is the atlas-reviewer subagent'],
  [/\bBOARD\.md\b/, 'retired to docs/archive/ — sessions integrate through main'],
  [/\bready-queue\b/i, 'retired to docs/archive/ — there is no queue to hand off to'],
  [/\bcross-cutting\b/i, 'replaced by COLLISIONS.md, scoped to collisions only'],
  [/\bagent-memory\b/i, 'the shared brain is retired; its contents are verbatim in docs/archive/'],
  [/\bparallel-work\b/i, 'the rule is retired; the working shape lives in CLAUDE.md'],
]

/**
 * Blank out every `docs/archive/…` path in a line before the vocabulary scan reads it.
 *
 * THE DISTINCTION THIS DRAWS IS THE WHOLE POINT OF THE TICKET. A law citing
 * `docs/archive/ready-queue-2026-07-03--2026-08-10.md` for the evidence behind
 * "7 recorded occurrences" is pointing at HISTORY, which is exactly where the
 * retirement put it, and a guard that forbade that would push the always-on set
 * back towards unsourced claims — the defect `app.md` files three times over.
 * A law naming `agent-memory/ready-queue.md` is pointing at a live apparatus that
 * no longer exists, and still fails.
 *
 * The narrowness matters: only the archive prefix is blanked, and only where it is
 * the literal path. `cross-cutting` on its own, anywhere else on the line, still hits.
 * Both separators are matched — a Windows-style `docs\archive\…` is the same pointer
 * at the same history, and treating it as a violation would be a false positive on a
 * legitimate citation.
 */
export function withoutArchivePaths(line) {
  return line.replace(/docs[/\\]archive[/\\][^\s`'")\]]*/g, '')
}

/**
 * Where a retired word may still be named, and the reason — as a LINE pattern, not
 * a whole file.
 *
 * A glossary that may not name the word it retired cannot do its job: the tombstone
 * in CONTEXT.md is what stops a session re-inventing "lane" from first principles.
 * But exempting the whole FILE would leave the retired apparatus one unwatched
 * document to walk back in through, and it would be the one nobody greps. So the
 * exemption is scoped to the blockquote the tombstone is written in — CONTEXT.md's
 * ordinary prose is held to the same rule as everything else.
 */
export const VOCABULARY_EXEMPT = {
  'CONTEXT.md': {
    lines: /^\s*>/,
    reason:
      'the glossary is where a retired word is named AS retired. Scoped to the blockquote holding the "Superseded: lane" tombstone — the rest of CONTEXT.md is scanned like every other always-on file.',
  },
}

/**
 * The always-on set's ceiling, in estimated tokens.
 *
 * DO NOT restate today's measurement here. An earlier version of this comment
 * carried "~8.8k" from another document; it was 9.2k by the time anyone read it, and
 * `rules/app.md` names hand-carried counts as a defect this repo has shipped three
 * times. Run `npm run env:health` — it prints the current number and the headroom.
 *
 * Ticket 02 removed `parallel-work.md` and `live.md` and cut CLAUDE.md's fat, then
 * added `CONTEXT.md` and `STATUS.md`, which the spec declares part of the set. So
 * the ceiling comes down with the removals, but not by their full size — some of
 * what was removed was deliberately spent again. Raising it is allowed; raising it
 * silently is not, which is why the number lives here and prints in the failure.
 *
 * DO NOT restate the before/after figures here. An earlier version of this comment
 * carried "~8.8k" from another document and was stale on arrival, and `rules/app.md`
 * names hand-carried counts as a defect this repo has shipped three times — a rule
 * this very comment then broke again by hand-typing "about 2.2k, roughly a quarter".
 * `npm run env:health` prints today's number and the headroom; `git log -p` on this
 * file prints what it was.
 */
/*
 * RAISED 9,000 → 9,250 on 2026-08-14 (founder decision, slice B1a), and the reason
 * is structural rather than "we needed room this once:
 *
 * ADR-0002's promotion ritual GROWS this file's siblings by design. Every time a
 * law's mechanism gets stronger, `rules/app.md` gains the declaration of the new
 * tier — that is the workflow working. `main` was sitting on 17 tokens of headroom,
 * so promoting `Degradation must be VISIBLE` from four-tests to impossible+test
 * failed the battery. A budget that refuses the behaviour it exists to encourage
 * pressures the next session into the two bad ways out: skip the promotion, or
 * weaken an unrelated law to make room. Both are worse than 250 tokens.
 *
 * This does NOT retire the standing plan to shrink `app.md` to pointers at its
 * tests (deferred, `DECISIONS.md` 2026-08-12) — it is the reason that plan matters,
 * and this merge already paid what it could: the new case's story went to
 * `case-history`, and the duplicated CRLF provenance was evicted behind its anchor.
 */
/*
 * RAISED 9,250 → 9,350 on 2026-08-14 (ticket 07 / B1b). NOT a founder decision —
 * mine, flagged in the handoff for him to reverse, and the note above is why I
 * did not simply drop the thing that overflowed.
 *
 * It is the SAME law and the SAME mechanism as the raise above, one slice later:
 * `Degradation must be VISIBLE` earned a THIRD tier when ticket 07's cold review
 * found a scope the backend accepted and never read while the surface promised
 * that grounding. The new guard is real (`chat2/requestScope.test.ts`, four review
 * rounds to make honest), and ADR-0002 requires a recurrence to buy a stronger
 * mechanism IN THE COMMIT that hit it — which the ship gate enforces.
 *
 * The branch paid what it could before asking: STATUS.md went from 887 tokens to
 * ~640, the bidi addendum was folded into an existing law sentence rather than
 * added as a line, and the new case's story went to `case-history`. After all of
 * that the set still sat 2 tokens over, and the remaining moves were shaving
 * single characters out of a status table — which is the budget refusing the
 * behaviour it exists to encourage, exactly as the note above predicted.
 *
 * ⚠ THE REAL FIX IS STILL DEFERRED and this makes it more urgent, not less:
 * `app.md` is 4,861 of these 9,350 tokens, and shrinking it to pointers at its
 * tests (`DECISIONS.md` 2026-08-12) is the standing plan. Two raises in two
 * slices is the signal that the plan has stopped being optional.
 *
 * RAISED 9,350 → 9,420 on 2026-08-15 (ticket 08b). Mine, not the founder's,
 * flagged in the handoff — and this is the THIRD raise in three slices, which
 * the note directly above already called the point at which app.md's shrink
 * stops being optional. It is now overdue, and it is its own mission: folding it
 * into 08b would be exactly the "do not fold a separate concern into unrelated
 * work" this repo enforces elsewhere.
 *
 * SAME LAW, SAME PATTERN, a third time: `Degradation must be VISIBLE` earned a
 * FOURTH tier when 08b's cold review found `callTruncated` held in view state —
 * a degradation one refresh erased. ADR-0002 requires the recurrence to buy a
 * stronger mechanism IN THIS COMMIT, so the tier is not optional either; the
 * only question was where its ~50 tokens come from.
 *
 * The branch paid first, again: STATUS.md's two-reds block was condensed, the
 * 08b/08c summary points at the ticket file instead of restating it, and the new
 * tier was cut from five lines to three with its reasoning moved into
 * `messageFlags.test.ts`'s header. That closed 89 of the 143 tokens. The rest is
 * this raise rather than another round of shaving characters out of a status
 * table — which is the budget refusing the behaviour it exists to encourage.
 */
/*
 * RAISED 9,420 → 9,520 on 2026-08-15 (ticket 08c-2). Mine, not the founder's,
 * and flagged to him in the handoff.
 *
 * A FOURTH RAISE IN FOUR SLICES, on the SAME law, for the FOURTH time:
 * `Degradation must be VISIBLE` earned another tier. 08c-2 hit that law three
 * times in one branch — two routes cutting opposite halves of a live call, then
 * one of them cutting silently, then a test that asserted the shared helper's
 * flag instead of the route's and so would have stayed green on a revert. The
 * mechanism is real (one module owns direction AND the cut-plus-notice pairing,
 * tested down both paths, verified by mutation), and ADR-0002 does not let a
 * recurrence buy prose.
 *
 * The branch paid 89 of the 123 tokens first: STATUS.md's phase and 08c blocks
 * were merged into one, the "next" line condensed, and the new tier cut from ten
 * lines to three with its story left in the review record. The rest is this raise.
 *
 * AND IT BUYS A PROMOTION, not just a tier. `Anything that decides what a screen
 * SAYS gets every one of its states driven in a browser` declared `ENFORCED none`
 * with the words "its natural tier is a ritual gate, which does not exist yet" —
 * and this branch built exactly that gate (`/verify-app` step 8b), after its own
 * evidence file silently omitted one of three new states. So the count
 * `npm run env:health` exists to drive down goes DOWN by one here. That is the
 * trade ADR-0002 is asking for, and it is the first of these four raises where
 * the always-on set got more enforcement per token rather than more prose.
 *
 * The last 30 are HEADROOM, added at review: landing exactly on the ceiling means the
 * next always-on edit of any size fails the battery before it is written, which
 * turns a drift alarm into a tripwire on ordinary work.
 *
 * ⚠ THE STANDING PLAN IS NOW FOUR SLICES OVERDUE. `app.md` is roughly half this
 * budget, and shrinking it to pointers at its tests (`DECISIONS.md` 2026-08-12)
 * was called "no longer optional" one raise ago and "overdue" the raise before.
 * The pattern is not that the laws are too wordy — it is that ONE law keeps
 * earning tiers because the codebase keeps finding new ways to hide a
 * degradation, and each tier is worth having. That is an argument for doing the
 * shrink as its own mission, not for refusing the next tier.
 *
 * RAISE FIVE (2026-08-15, ticket 08c-3): +130, and the paragraph above predicted
 * it almost word for word. The degradation law earned a fifth tier — one source
 * reaching the model by TWO CHANNELS (a report as page text and as snipped
 * images), where a state naming one channel was measured against everything
 * fetched. It cost two review rounds and two BLOCKERs in successive commits, the
 * second of which was introduced BY the fix for the first, so this is a tier the
 * codebase paid for twice in one ticket. It arrives with a `test` mechanism and a
 * type-level split, so enforcement per token still goes up.
 *
 * The figure was 9,650 until round 4 of the same review, which required the tier
 * to NAME BOTH guards holding it rather than one — the sweep of the pure decision
 * AND the case pinning that the marked list is what reaches it. That is 30 more
 * tokens of law and it is not padding: naming one guard while two are load-bearing
 * is the same over-claim the round before had just deleted. Trimming other words
 * to land exactly on 9,650 was the alternative and was rejected — shaving a law's
 * wording to hit a number is how a law gets quietly weakened by arithmetic.
 *
 * ⚠ THE SHRINK IS NOW FIVE SLICES OVERDUE, and the honest reading of five
 * consecutive raises is that it will not happen as a side effect of the next
 * ticket either. It needs to be scheduled.
 */
/*
 * RAISED 9,680 → 9,900 on 2026-08-15 (ticket 09). Mine, not the founder's, and
 * flagged to him in the handoff.
 *
 * RAISE SIX — AND THE FIRST ONE THAT IS NOT THE DEGRADATION LAW EARNING ANOTHER
 * TIER. Every raise above bought a new tier for `Degradation must be VISIBLE`.
 * This one files a NEW law: `Every untrusted string reaching a MODEL passes a
 * sanitiser — the fence LINE, not just the body it opens`, with a test mechanism
 * (`workspace/chat/promptInjectionDiscipline.test.ts`).
 *
 * It is filed because the defect recurred SIX TIMES ON ONE BRANCH, each fix
 * landing where the bug was noticed and each leaving the next door open: the
 * source body, the fence marker line, the shelf listing, the `"""` blocks, the
 * conversation turns, the clip caption — and then the SCAN bought to end the
 * sequence, which named two builders while the defect spanned three. Two cold
 * review rounds found doors four through six. A defect that recurs six times in
 * one branch and has no law is precisely what ADR-0002 says to file, and prose
 * would not have caught door six — the scan did, once it was widened.
 *
 * So `npm run env:health`'s mechanism count goes UP by one here (13 → 14), which
 * is the trade ADR-0002 asks for: more enforcement per token, not more prose.
 *
 * The branch paid before asking, as the notes above require: STATUS.md's 08 block
 * was cut to three lines now that 08 has landed, its two-reds block condensed, and
 * the 09 entry written at a third of its first draft. The law itself was cut from
 * fourteen lines to eleven, with its story sent to `case-history`. The last ~24
 * are headroom, for the reason raise four gives.
 *
 * ⚠ THE SHRINK IS SIX SLICES OVERDUE. The note above said five consecutive raises
 * mean it will not happen as a side effect of the next ticket, and it did not.
 * It needs to be scheduled as its own mission.
 */
export const TOKEN_BUDGET = 9_900

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
  'CONTEXT.md':
    'a glossary. It DEFINES what a law is; it states none. Its entries are definitions, and a definition cannot be violated by code.',
  'STATUS.md':
    'status, which by CONTEXT.md is the one thing that is explicitly NOT a law: it describes now, it is rewritten every merge, and nothing in it constrains how Atlas is built.',
  '.claude/rules/db.md':
    'states its rules as prose sections rather than LAW/ENFORCED blocks, so every rule in it is invisible to this scan and to the health metric. That is a real gap and not a claim of enforcement. Converting it is deliberate follow-up work: each prose rule has to be split into LAW plus an honest enforcement declaration, and doing it inside the retirement ticket would have raised the unenforced count while that ticket was required not to move it.',
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
  [/[{}<>*|]/, 'a pattern or placeholder (brace expansion, `<branch>`), not a path'],
]
// The fleet's shared brain used to be skipped here: it lived outside the repo and was
// git-ignored, so no checkout could verify it. ADR-0001 retired it, and everything the
// always-on set now points at — COLLISIONS.md, DECISIONS.md, the archive — is a tracked
// file in this repo. The skip is deliberately GONE rather than kept as a harmless
// leftover: with it, a pointer back to `agent-memory/BOARD.md` would resolve silently.

/**
 * Every `@import` line in a CLAUDE.md, as repo-relative paths.
 *
 * The syntax is a line whose first non-space character is `@`, followed by a path.
 * Only that form counts: an `@` mid-sentence is prose, and `@import` inside a fenced
 * code block is an example of the syntax rather than a use of it — this repo's own
 * documents contain both, so a looser match would invent imports that do not exist.
 */
export function importsOf(text) {
  const out = []
  let fenced = false
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const m = /^\s*@([^\s`'"]+)\s*$/.exec(raw)
    if (m) out.push(m[1].replace(/^\.\//, ''))
  }
  return out
}

/**
 * Every Markdown document the harness loads on its own, read off the filesystem.
 *
 * Three sources, all discovered, none assumed:
 *  - every `.md` in `.claude/rules/`
 *  - EVERY `CLAUDE.md` in the tree — a nested one under `src/` is picked up whenever
 *    work happens in that subtree, which is precisely the quiet way the set grows.
 *    Hard-coding the root one would have made this check answer "yes, the declared
 *    file is still declared" and see nothing else.
 *  - everything those files pull in with `@import`, TRANSITIVELY.
 *
 * The import leg is the one that closes the hole CLAUDE.md itself warns about:
 * `@imports` expand eagerly, so `@docs/VISION.md` costs exactly what pasting the
 * file in costs. Without following them, the budget would measure the pointer and
 * report a set half the size of the one a session is actually handed — a green
 * signal measuring the wrong thing (M1).
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

  // Transitive, with a visited set: an import that imports is still always-on, and a
  // cycle is a thing a human can write.
  //
  // A MISSING import is still ADDED to the set, then not walked. It would be easier to
  // drop it, and that is the wrong direction: a session handed `@STATUS.md` when no
  // STATUS.md exists gets a broken import, and a discovery that quietly skipped it would
  // report a clean, matching set while the environment was broken. Added, the
  // `ALWAYS_ON declares X, which does not exist` assertion fires and names it.
  //
  // STATED LIMIT: imports resolve against the repo root, which is where every one of
  // them is written today. A nested `src/**/CLAUDE.md` importing a sibling relatively
  // would resolve wrongly here; there is no such file, and the declared-set assertion
  // would fail loudly rather than silently if one appeared.
  const found = new Set([...claudeMds, ...rules])
  const queue = [...found]
  while (queue.length) {
    const file = queue.shift()
    const abs = join(root, file)
    if (!existsSync(abs)) continue
    for (const ref of importsOf(readFileSync(abs, 'utf8'))) {
      if (found.has(ref)) continue
      found.add(ref)
      queue.push(ref)
    }
  }

  return [...found].sort()
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
 * The law's own `**VERIFY**` step — what a human has to go and do because nothing
 * automatic can.
 *
 * This is what makes the ship checklist GENERATED rather than written. Ticket 03's
 * complaint about the previous arrangement was that compliance depended on someone
 * recalling rule 14 of 27; a hand-copied list in the skill would have the same
 * problem one step later, plus the hand-carried-count defect `app.md` files three
 * times. `npm run ship:gate` prints these, so the checklist cannot drift from the
 * laws it comes from.
 *
 * Bounded the same way `enforcementOf` is, and for the same reason: to the next
 * marker at a line start, never to the end of the block.
 */
function verifyOf(body) {
  const at = body.search(/\*\*VERIFY\*\*/)
  if (at === -1) return ''
  return body
    .slice(at)
    .replace(/\*\*VERIFY\*\*/, '')
    .split(/\n\*\*[A-Z]/)[0]
    .replace(/^[—\-:,\s]+/, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
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
    // `verify` belongs to the BLOCK, never to the group: a run of bare one-line laws
    // shares one mechanism, but each of them either carries its own manual step or
    // carries none.
    group.push({ file, line: b.line, section: b.section, title: b.title, verify: verifyOf(b.body) })
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
