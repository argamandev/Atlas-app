// ─────────────────────────────────────────────────────────────────────────────
// THE SHIP GATE — the two rituals, as functions instead of as prose.
//
// `.claude/skills/ship/SKILL.md` described both of these in careful English, and
// `CONTEXT.md` counts prose as the weakest tier and NOT as enforcement. A ritual
// written only in a skill fires when someone remembers to read the skill; ADR-0002
// is the ruling that this is not good enough. So the rituals moved here, where a
// hook can run them (`.claude/hooks/pre-bash-gate.mjs`, the merge door) and the
// battery can test them (`src/lib/shipGate.test.ts`).
//
//  EVICTION, bound to the merge. When work lands, its working notes become history
//  in the same motion and STATUS.md is REWRITTEN, not appended to. Deliberately not
//  a periodic sweep: the retired apparatus reached 2.8 MB with a sweep on the books
//  that nothing forced to run.
//
//  PROMOTION, bound to the review. Every finding answers "is this a recurrence of a
//  law we already hold?" — and if it is, that law gains a mechanism one tier
//  stronger in the same commit, or is honestly marked UNENFORCEABLE with a reason.
//
// EVERYTHING HERE IS PURE. Git reads and filesystem walks live in
// `scripts/ship-gate.mjs`, which hands this module plain numbers and text. That
// split is what lets the battery drive these rules through their failing cases
// instead of only ever seeing them green.
//
// STATED LIMITS, so nobody trusts this further than it goes:
//  - "one tier stronger" is measured at the resolution `app.md` DECLARES in:
//    none < partial < mechanism, plus the UNENFORCEABLE hatch. ADR-0002's finer
//    ladder (impossible → test → hook → ritual gate → prose) is invisible here —
//    a law that swaps a grep for a test still reads as `mechanism`, which is why
//    a mechanism→mechanism promotion requires the DECLARATION TEXT to change.
//  - A review record is a document a human or a subagent writes. This checks that
//    the question was ANSWERED, never that the answer was right.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The declaration tiers, weakest first. `unenforceable` is deliberately absent:
 * it is not a rung on this ladder, it is the honest exit from it, and it is
 * handled by name in `strengthened` below.
 */
export const TIER = { missing: 0, none: 1, partial: 2, mechanism: 3 }

/** How long a stated reason has to be before it stops being a shrug. Matches `environment.test.ts`. */
const MIN_REASON = 25

const FINDING = /^FINDING\s*[·|]\s*(BLOCKER|WARNING|NIT)\s*[·|]\s*(.*)$/i
const RECURRENCE = /^RECURRENCE:\s*(yes|no)\b\s*(?:[→>-]+\s*(.*))?$/i

/**
 * Read a review record into findings, each with the recurrence answer that belongs
 * to it.
 *
 * PAIRED, NEVER COUNTED. A `RECURRENCE:` line attaches to the finding above it, and
 * a record with two findings and two answers where both answers sit under the first
 * one is a record with one finding unanswered. Counting the two totals and comparing
 * them would call that complete — the shape of failure `app.md` M1 names, where the
 * measurement answers the question you typed rather than the one you meant.
 */
export function parseReviewRecord(text) {
  const findings = []
  const strays = []
  let declaresNone = false
  let current = null

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (/^FINDINGS:\s*none\b/i.test(line)) declaresNone = true
    const f = FINDING.exec(line)
    if (f) {
      current = { line: i + 1, severity: f[1].toUpperCase(), text: f[2].trim(), recurrence: null }
      findings.push(current)
      return
    }
    const r = RECURRENCE.exec(line)
    if (!r) return
    const answer = { isRecurrence: /^yes$/i.test(r[1]), law: (r[2] ?? '').trim() }
    if (!current || current.recurrence) strays.push({ line: i + 1, ...answer })
    else current.recurrence = answer
  })

  const verdict = /^\s*VERDICT:\s*(APPROVED|CHANGES)\b/im.exec(text)?.[1]?.toUpperCase() ?? null
  return { verdict, findings, strays, declaresNone }
}

/** Is the record structurally complete — verdict present, every finding answered? */
export function reviewProblems(record) {
  const problems = []
  if (record.verdict === null)
    problems.push('the review record states no VERDICT: APPROVED or VERDICT: CHANGES.')
  else if (record.verdict !== 'APPROVED')
    problems.push(
      `the review verdict is CHANGES. Fix the findings and re-review; a merge is not the answer to CHANGES.`
    )

  if (!record.findings.length && !record.declaresNone)
    problems.push(
      'the review record lists no findings and does not say "FINDINGS: none". Silence is not an answer — ' +
        'an empty record and an unreviewed branch look identical.'
    )

  for (const f of record.findings)
    if (!f.recurrence)
      problems.push(
        `line ${f.line}: this finding has no recurrence answer. Every finding carries ` +
          '"RECURRENCE: no" or "RECURRENCE: yes → <law>" (ADR-0002) — the question is asked at review ' +
          'because that is the moment it is cheap: the defect is in front of you and the branch is unmerged.'
      )

  for (const s of record.strays)
    problems.push(
      `line ${s.line}: a RECURRENCE answer with no finding above it, or a second answer for one finding. ` +
        'Answers pair with findings one to one.'
    )

  return problems
}

/** Did this law's declaration genuinely get stronger between `before` and `after`? */
function strengthened(before, after) {
  // The hatch. Marking a law honestly unenforceable is a legitimate outcome of a
  // recurrence and always has been (ADR-0002): without it, a hard gate pressures
  // people into mechanisms that only look like enforcement, and a law that merely
  // LOOKS enforced is worse than one honestly marked bare.
  if (after.enforcement.kind === 'unenforceable') {
    return after.enforcement.reason.trim().length >= MIN_REASON
      ? { ok: true }
      : {
          ok: false,
          why:
            'is marked UNENFORCEABLE without a real reason. The hatch is honest marking, not a marking — ' +
            'say what nothing mechanical could ever check, and why.',
        }
  }

  const from = TIER[before.enforcement.kind] ?? 0
  const to = TIER[after.enforcement.kind] ?? 0
  if (to > from) return { ok: true }

  // Already at the top of the ladder this parser can see, and it recurred anyway —
  // so the mechanism has a hole. The declaration has to say something new about how
  // that hole is closed. Restating it unchanged is the fourth restatement ADR-0002
  // refuses; this cannot tell a test from a hook, so the changed TEXT is the proxy,
  // and it is a proxy — a reworded reason passes.
  if (
    to === from &&
    to === TIER.mechanism &&
    after.enforcement.reason.trim() !== before.enforcement.reason.trim()
  )
    return { ok: true }

  return {
    ok: false,
    why:
      `still declares ${after.enforcement.kind === 'missing' ? 'nothing' : `ENFORCED ${after.enforcement.kind}`}. ` +
      'A recurrence means the mechanism tier is too weak, never that the law needs restating — it gains one ' +
      'tier stronger (impossible → test → hook or grep → ritual gate) in THIS commit, or it is marked ' +
      'UNENFORCEABLE with a stated reason.',
  }
}

/**
 * Every recurrence answered "yes" has to name one law, that law has to be one main
 * already holds, and it has to leave this branch stronger than it arrived.
 *
 * `before` and `after` are law lists from `parseLaws` — main's and the branch's.
 */
export function recurrenceProblems(record, before, after) {
  const problems = []
  const find = (laws, name) => laws.filter((l) => l.title.toLowerCase().includes(name.toLowerCase()))

  for (const f of record.findings) {
    if (!f.recurrence?.isRecurrence) continue
    const name = f.recurrence.law
    if (!name) {
      problems.push(`line ${f.line}: "RECURRENCE: yes" names no law. Write "yes → <the law it repeats>".`)
      continue
    }

    const hits = find(after, name)
    if (hits.length !== 1) {
      problems.push(
        `line ${f.line}: "${name}" ${hits.length === 0 ? 'matches no law' : `matches ${hits.length} laws`} in the ` +
          'always-on set. Name it precisely enough to resolve to one.'
      )
      continue
    }

    const now = hits[0]
    const was = before.find((l) => l.title === now.title)
    if (!was) {
      // "A recurrence of a law we ALREADY hold." A law this branch introduces is a
      // first occurrence; allowing it would let a branch satisfy the gate by writing
      // the law it claims to be repeating.
      problems.push(
        `line ${f.line}: "${now.title}" does not exist on main, so this is a first occurrence and not a ` +
          'recurrence. Answer "RECURRENCE: no" and file the new law normally.'
      )
      continue
    }

    const verdict = strengthened(was, now)
    if (!verdict.ok) problems.push(`line ${f.line}: the law "${now.title}" ${verdict.why}`)
  }

  return problems
}

/**
 * What this merge still owes history.
 *
 * Every input is a measurement taken against the branch, never a judgement: how many
 * lines of STATUS.md the branch adds and removes, whether STATUS.md existed at the
 * merge base at all, how long it ends up, the same two counts for PROGRESS.md, and
 * which working-note folders are closed but still sitting in `.scratch/`.
 *
 * `statusExistedAtBase` is there because the first version of this check read "no
 * deletions" as "appended rather than rewritten", and a branch that CREATES
 * STATUS.md has no deletions and has appended to nothing. That is a proxy standing
 * in for the fact (`app.md` M3.2), and it fired on the very branch that introduced
 * the file.
 */
export function evictionProblems(f) {
  const problems = []

  if (f.statusAdded === 0 && f.statusRemoved === 0)
    problems.push(
      'this merge does not touch STATUS.md. STATUS.md describes NOW: whatever just landed comes out of it ' +
        'and whatever is next goes in. A merge that leaves it alone leaves the founder reading a status ' +
        'page about work that is already done.'
    )
  else if (f.statusRemoved === 0 && f.statusExistedAtBase)
    problems.push(
      `STATUS.md gained ${f.statusAdded} lines and lost none, so it was appended to rather than rewritten. ` +
        'Anything that has landed gets REMOVED, not struck through; anything dated belongs in PROGRESS.md ' +
        'or docs/case-history/. A status file that only grows is how the last board started.'
    )

  if (f.statusLines > f.statusCap)
    problems.push(
      `STATUS.md is ${f.statusLines} lines against a cap of ${f.statusCap}. The battery will fail on main ` +
        'the moment this lands; cut it before the merge, not after.'
    )

  if (f.progressAdded === 0)
    problems.push(
      'this merge adds no PROGRESS.md entry. Everything taken out of STATUS.md has to land somewhere, and ' +
        'PROGRESS.md is where: 3-5 bullets, what + why + verification.'
    )
  if (f.progressRemoved > 0)
    problems.push(
      `this merge removes ${f.progressRemoved} lines from PROGRESS.md, which is append-only. Rewriting a ` +
        'dated record falsifies it.'
    )

  for (const dir of f.unarchivedScratch)
    problems.push(
      `${dir} is closed — every ticket in it reads done — but still sits in .scratch/. Working notes become ` +
        'history in the same motion as the merge: copy the folder to docs/archive/ verbatim, never re-authored, ' +
        'and remove it from .scratch/. Eviction happens at merge because a sweep that runs "later" is how the ' +
        'last apparatus reached 2.8 MB.'
    )

  return problems
}

/**
 * Which working-note folders are closed, given one entry per status-bearing file.
 *
 * A folder is closed when it holds at least one ticket and EVERY ticket in it reads
 * done. The "at least one" is load-bearing: `every` over an empty list is true, so
 * without it a folder of loose notes with no ticket in it would read as closed the
 * moment it was created, and the gate would demand that live notes be filed as
 * history.
 */
// Every closed state this repo's tracker actually writes. Not a guess at an open
// vocabulary — `docs/agents/issue-tracker.md` and `triage-labels.md` define a CLOSED
// set, and these are all of its terminal members (`resolved` and `wontfix` are theirs;
// the rest are what the workflow-reset tickets used). Add a term here when the tracker
// gains one; a status this does not recognise reads as OPEN, which errs towards leaving
// notes in `.scratch/` rather than filing live work as history.
const CLOSED = /^(done|shipped|closed|merged|archived|resolved|wontfix)$/i
export function closedScratchDirs(entries) {
  const byDir = new Map()
  for (const e of entries) {
    if (!e.status) continue
    if (!byDir.has(e.dir)) byDir.set(e.dir, [])
    byDir.get(e.dir).push(e.status.trim())
  }
  return [...byDir]
    .filter(([, statuses]) => statuses.length > 0 && statuses.every((s) => CLOSED.test(s)))
    .map(([dir]) => dir)
    .sort()
}
