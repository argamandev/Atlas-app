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

/**
 * How long a stated reason has to be before it stops being a shrug.
 *
 * ONE number, exported, because there were three: this one, a 20 in the hook's override
 * and a 30 in `environment.test.ts` — and the comment here claimed to "match
 * environment.test.ts" while the hook quietly disagreed with both. Every place that
 * demands a stated reason now demands the same length.
 */
export const MIN_REASON = 25

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
  const unreadable = []
  let declaresNone = false
  let current = null

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (/^FINDINGS:\s*none\b/i.test(line)) declaresNone = true
    // A line that MEANT to be a finding and did not parse. Without this, a record in
    // the old `FINDING <branch> · SEV · …` shape plus "FINDINGS: none" reads as a clean
    // review of zero findings — the gate's own worst outcome, a green signal that
    // measured nothing (`app.md` M1).
    else if (/^FINDING\b/i.test(line) && !FINDING.test(line)) unreadable.push({ line: i + 1, text: line })
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
  const reviewedSha = /^\s*REVIEWED:\s*([0-9a-f]{7,40})\b/im.exec(text)?.[1] ?? null
  return { verdict, reviewedSha, findings, strays, unreadable, declaresNone }
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

  if (!record.reviewedSha)
    problems.push(
      'the review record names no commit. Add "REVIEWED: <sha>" — the sha the reviewer actually read. ' +
        'Without it nothing ties the verdict to the code, and a review filed at the first commit clears ' +
        'a merge at the twelfth.'
    )

  for (const u of record.unreadable)
    problems.push(
      `line ${u.line}: this line starts with FINDING but could not be read as one, so it counted for ` +
        `nothing:\n      ${u.text}\n    The shape is "FINDING · <BLOCKER|WARNING|NIT> · <file:line> · ` +
        '<one sentence>" (.claude/agents/atlas-reviewer.md). A finding the parser skips is a finding ' +
        'the gate reports as absent.'
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

/**
 * Did the branch move under the review after it was filed?
 *
 * `changedSinceReview` is every path that changed between the reviewed sha and the
 * branch tip. The review record itself is expected to be among them — writing it IS
 * the act of filing the review — and everything else means the reviewer approved code
 * that is no longer what would merge. `atlas-reviewer.md` already says "the author
 * fixes, you re-review"; this is that sentence with an exit code.
 */
export function stalenessProblems(changedSinceReview, recordPath) {
  const moved = changedSinceReview.filter((p) => p !== recordPath)
  if (!moved.length) return []
  return [
    `${moved.length} file(s) changed after the reviewed commit, so the verdict is not about the code ` +
      `that would merge:\n      ${moved.slice(0, 10).join('\n      ')}` +
      `${moved.length > 10 ? `\n      …and ${moved.length - 10} more` : ''}\n    ` +
      'Re-review at the tip and update REVIEWED:. A stale approval is an assumed answer wearing a ' +
      "recorded one's clothes.",
  ]
}

/** Did this law's declaration genuinely get stronger between `before` and `after`? */
function strengthened(before, after) {
  // The hatch. Marking a law honestly unenforceable is a legitimate outcome of a
  // recurrence and always has been (ADR-0002): without it, a hard gate pressures
  // people into mechanisms that only look like enforcement, and a law that merely
  // LOOKS enforced is worse than one honestly marked bare.
  if (after.enforcement.kind === 'unenforceable') {
    // ...but not as an EXIT from a mechanism. The hatch is for a law nothing mechanical
    // could ever check; a law already carrying one has disproved that about itself, so
    // this transition is a demotion wearing the honest exit's clothes — and it would be
    // the cheapest possible answer to a recurrence.
    if (before.enforcement.kind === 'mechanism')
      return {
        ok: false,
        why:
          'already carries a mechanism, so it cannot be reclassified UNENFORCEABLE in answer to a ' +
          'recurrence — the recurrence says that mechanism has a hole, not that no mechanism could exist. ' +
          'Close the hole, or say in the declaration what the mechanism now covers that it did not.',
      }
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

  // THE FLOOR, and it sits ABOVE the bottom of the ladder. The spec: "`ENFORCED none`
  // is not an acceptable terminal state for a law that has recurred." Comparing tiers
  // alone read missing(0) → none(1) as a promotion, and main holds eleven laws that
  // parse as `missing` — so naming any of them and typing the words "ENFORCED none"
  // cleared the entire promotion ritual. Declaring the absence honestly is how a law
  // is FILED; it is not how a recurrence is ANSWERED.
  if (to <= TIER.none)
    return {
      ok: false,
      why:
        `now declares ${to === TIER.none ? 'ENFORCED none' : 'no enforcement at all'}, and ENFORCED none is ` +
        'not an acceptable terminal state for a law that has recurred. It gains one tier stronger ' +
        '(impossible → test → hook or grep → ritual gate) in THIS commit, or it is marked UNENFORCEABLE ' +
        'with a stated reason — that hatch is the honest exit, and it is always open.',
    }

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

  for (const dir of f.deletedWithoutArchive ?? [])
    problems.push(
      `${dir} was deleted by this branch and no copy of it appears under docs/archive/. Working notes ` +
        'become HISTORY at the merge, and a deletion is the one outcome that is not history — copy the ' +
        'folder to docs/archive/scratch/<date>-<slug>/ verbatim first, then remove it.'
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

// ─────────────────────────────────────────────────────────────────────────────
// THE VERIFIED-COUNT CHECK (founder decision 2026-08-13, DECISIONS.md).
//
// M1's count-carrying clause — "a count restated from another document — wrong
// every time it was hand-carried" — fired twice on feat/smart-layer-foundations:
// a PROGRESS entry claimed "Verified: 706/706" and STATUS.md a spare-token figure,
// both true when written and both false at the tip after a later edit. M1 is a
// meta-law the promotion ritual cannot see (deferred, founder 2026-08-12), so this
// closes the one recurring SHAPE at the ritual-gate tier: the gate re-runs the
// battery and refuses a merge whose NEW PROGRESS lines claim a Verified count that
// disagrees with the run it just made.
//
// STATED LIMITS: the claim grammar is the ritual's own label — the first `N/M`
// pair DIRECTLY after the word "Verified" on an added line. A count buried later
// in the sentence is invisible (convention: the battery count comes right after
// the label, or the line points at the command instead of quoting a number); so
// is a count in any other file. This proves the CLAIMED count equals the MEASURED
// one at gate time, nothing more.
// ─────────────────────────────────────────────────────────────────────────────

// The word "Verified", optionally wrapped/followed by bold markers and a colon,
// then immediately the pass/total pair.
const VERIFIED_CLAIM = /\bverified\b[:*\s]{0,8}(\d+)\s*\/\s*(\d+)/i

/** Test-count claims in the PROGRESS lines a branch adds. */
export function verifiedClaims(addedLines) {
  const claims = []
  for (const line of addedLines) {
    const m = VERIFIED_CLAIM.exec(line)
    if (m) claims.push({ line: line.trim(), pass: Number(m[1]), total: Number(m[2]) })
  }
  return claims
}

/**
 * The battery's own summary, from `node --test`'s spec reporter output
 * (`ℹ tests N` / `ℹ pass N`), ANSI stripped. Null when the output carries no
 * parsable summary — which the caller must treat as a failure to verify, never
 * as "no disagreement found".
 */
export function parseBatterySummary(output) {
  // eslint-disable-next-line no-control-regex
  const clean = output.replace(/\u001b\[[0-9;]*m/g, '')
  const num = (label) => {
    const m = new RegExp(`ℹ ${label} (\\d+)`).exec(clean)
    return m ? Number(m[1]) : null
  }
  const total = num('tests')
  const pass = num('pass')
  return total === null || pass === null ? null : { total, pass }
}

/**
 * Refusals owed by the claims against the run. `run` is `{ pass, total }` from
 * `parseBatterySummary`, or null — and null FAILS CLOSED: a battery that cannot
 * report its own summary cannot corroborate anyone quoting it.
 */
export function verifiedCountProblems(claims, run) {
  if (!claims.length) return []
  if (!run)
    return [
      'the new PROGRESS entry claims a Verified count, but the battery run the gate made produced no ' +
        'parsable summary — fix the battery (or the claim), then re-run the gate.',
    ]
  const problems = []
  for (const c of claims) {
    if (c.pass !== run.pass || c.total !== run.total)
      problems.push(
        `the new PROGRESS entry claims "Verified: ${c.pass}/${c.total}" but the battery the gate just ran ` +
          `measured ${run.pass}/${run.total}. Regenerate the count from a run of THIS tree — a count carried ` +
          `across edits is M1's exact defect, twice recorded. (line: "${c.line.slice(0, 80)}")`
      )
  }
  return problems
}
