import { test } from 'node:test'
import assert from 'node:assert/strict'

// ─────────────────────────────────────────────────────────────────────────────
// THE SHIP GATE — ticket 03, the rituals.
//
// Two habits keep the environment from regrowing and keep it learning, and both
// of them were PROSE in `.claude/skills/ship/SKILL.md` until this file existed.
// `CONTEXT.md` counts prose as the weakest tier and not as enforcement, and
// ADR-0002 says a lesson is not learned until a mechanism enforces it — so a
// ritual written only in a skill is a ritual that fires when someone remembers
// to read the skill.
//
//  EVICTION — when work merges, its working notes become history in the same
//  motion and STATUS.md is REWRITTEN rather than appended to. Bound to the merge,
//  never to a periodic sweep: the retired apparatus reached 2.8 MB with a sweep
//  on the books that nothing forced to run.
//
//  PROMOTION — at review, every finding answers a question that cannot be
//  skipped: is this a recurrence of a law we already hold? If it is, the law
//  gains a mechanism one tier stronger IN THE SAME COMMIT, or is honestly marked
//  UNENFORCEABLE with a reason.
//
// WHAT THESE TESTS DO NOT COVER, stated so nobody trusts the gate further than it
// goes. Everything here is a pure function over text and numbers; the git reads
// that produce those numbers live in `scripts/ship-gate.mjs` and are exercised by
// the hook matrix (`node .claude/hooks/gate-tests.mjs`), not here. And the tier
// comparison can only see the four kinds the law parser distinguishes — none <
// partial < mechanism, plus the UNENFORCEABLE hatch. It cannot tell a test from a
// hook from an impossible state, so "one tier stronger" is enforced at the
// resolution `app.md` actually declares in, and no finer.
// ─────────────────────────────────────────────────────────────────────────────

import {
  closedScratchDirs,
  evictionProblems,
  parseReviewRecord,
  recurrenceProblems,
  reviewProblems,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM module, deliberately outside tsconfig's TS program
} from '../../scripts/lib/ship-gate.mjs'

// ─── The review record ───────────────────────────────────────────────────────

const RECORD = `# Review — chore/x

VERDICT: APPROVED

FINDING · BLOCKER · src/a.ts:12 · the choke point took a proxy, not the fact
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · NIT · src/b.ts:3 · stale comment
RECURRENCE: no
`

test('a review record yields its verdict and one recurrence answer per finding', () => {
  const r = parseReviewRecord(RECORD)
  assert.equal(r.verdict, 'APPROVED')
  assert.equal(r.findings.length, 2)
  assert.equal(r.findings[0].severity, 'BLOCKER')
  assert.equal(r.findings[0].recurrence?.isRecurrence, true)
  assert.equal(r.findings[0].recurrence?.law, 'Degradation must be VISIBLE')
  assert.equal(r.findings[1].recurrence?.isRecurrence, false)
  assert.deepEqual(reviewProblems(r), [])
})

test('an unanswered finding is a problem — the question cannot be skipped', () => {
  const r = parseReviewRecord('VERDICT: APPROVED\n\nFINDING · NIT · a.ts:1 · x\n')
  assert.equal(r.findings[0].recurrence, null)
  assert.match(reviewProblems(r).join('\n'), /recurrence/i)
})

test('a recurrence answer with no finding above it is a problem, not a pass', () => {
  // The failure this catches: a record that answers the question in the abstract
  // ("RECURRENCE: no") while leaving individual findings unanswered. Counting
  // answers instead of pairing them would read that as complete.
  const r = parseReviewRecord(
    'VERDICT: APPROVED\n\nRECURRENCE: no\nFINDING · NIT · a.ts:1 · x\nRECURRENCE: no\n'
  )
  const problems = reviewProblems(r).join('\n')
  assert.match(problems, /no finding above it/i)
})

test('a clean review must say so explicitly, because silence is not an answer', () => {
  const silent = parseReviewRecord('VERDICT: APPROVED\n')
  assert.match(reviewProblems(silent).join('\n'), /FINDINGS: none/)

  const explicit = parseReviewRecord('VERDICT: APPROVED\n\nFINDINGS: none\n')
  assert.deepEqual(reviewProblems(explicit), [])
})

test('a record that is not APPROVED does not open the merge', () => {
  const r = parseReviewRecord('VERDICT: CHANGES\n\nFINDINGS: none\n')
  assert.match(reviewProblems(r).join('\n'), /CHANGES/)

  const missing = parseReviewRecord('FINDINGS: none\n')
  assert.match(reviewProblems(missing).join('\n'), /VERDICT/)
})

// ─── Promotion: a recurrence buys a stronger mechanism ───────────────────────

const law = (title: string, kind: string, reason = 'a reason long enough to be a real one') => ({
  file: '.claude/rules/app.md',
  line: 1,
  title,
  enforcement: { kind, reason },
})

const answered = (lawName: string) =>
  parseReviewRecord(`VERDICT: APPROVED\n\nFINDING · BLOCKER · a.ts:1 · x\nRECURRENCE: yes → ${lawName}\n`)

test('a recurrence whose law gained no strength is blocked', () => {
  const before = [law('Degradation must be VISIBLE', 'none')]
  const after = [law('Degradation must be VISIBLE', 'none')]
  const problems = recurrenceProblems(answered('Degradation must be VISIBLE'), before, after)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /one tier stronger/i)
})

test('a recurrence whose law moved up a tier passes', () => {
  const before = [law('Degradation must be VISIBLE', 'none')]
  const after = [law('Degradation must be VISIBLE', 'mechanism', '`src/lib/x.test.ts` covers it')]
  assert.deepEqual(recurrenceProblems(answered('Degradation must be VISIBLE'), before, after), [])

  // none → partial is also up. Coarse, and deliberately so: these are the only
  // tiers the declaration form can express.
  const partial = [law('Degradation must be VISIBLE', 'partial', 'one surface only, the rest are bare')]
  assert.deepEqual(recurrenceProblems(answered('Degradation must be VISIBLE'), before, partial), [])
})

test('a law that already carries a mechanism must change that mechanism, not restate it', () => {
  // The mechanism had a hole — that is what a recurrence means. Leaving the same
  // declaration in place is the fourth restatement ADR-0002 exists to refuse.
  const before = [law('Use getUser()', 'mechanism', '`git grep` must keep returning nothing')]
  const same = [law('Use getUser()', 'mechanism', '`git grep` must keep returning nothing')]
  assert.match(recurrenceProblems(answered('Use getUser()'), before, same).join('\n'), /one tier stronger/i)

  const changed = [law('Use getUser()', 'mechanism', '`src/lib/getSessionBan.test.ts` fails the battery')]
  assert.deepEqual(recurrenceProblems(answered('Use getUser()'), before, changed), [])
})

test('the escape hatch is real: UNENFORCEABLE with a reason satisfies the gate', () => {
  // Mandatory, not a weakness. Without it a hard gate pressures people into
  // mechanisms that only look like enforcement, and this repo has already filed
  // the case where a test asserted the defect and thereby defended it.
  const before = [law('Anything that decides what a screen SAYS', 'none')]
  const hatched = [
    law(
      'Anything that decides what a screen SAYS',
      'unenforceable',
      'a battery cannot tell whether a human opened a browser'
    ),
  ]
  assert.deepEqual(
    recurrenceProblems(answered('Anything that decides what a screen SAYS'), before, hatched),
    []
  )
})

test('the hatch needs a reason — a bare UNENFORCEABLE is a shrug', () => {
  const before = [law('X law', 'none')]
  const bare = [law('X law', 'unenforceable', 'n/a')]
  assert.match(recurrenceProblems(answered('X law'), before, bare).join('\n'), /reason/i)
})

test('a recurrence must name a law that resolves to exactly one law', () => {
  const laws = [law('Degradation must be VISIBLE', 'none'), law('Degradation must be LOUD', 'none')]

  const unknown = recurrenceProblems(answered('a law nobody wrote'), laws, laws)
  assert.match(unknown.join('\n'), /matches no law/i)

  const ambiguous = recurrenceProblems(answered('Degradation must be'), laws, laws)
  assert.match(ambiguous.join('\n'), /matches 2 laws/i)
})

test('a recurrence naming a law that main does not hold is not a recurrence', () => {
  // "Is this a recurrence of a law we ALREADY hold?" A law introduced by this very
  // branch is a first occurrence, and pointing at it would let a branch satisfy the
  // gate by inventing the law it claims to be repeating.
  const after = [law('A brand new law', 'mechanism', '`src/lib/x.test.ts`')]
  assert.match(
    recurrenceProblems(answered('A brand new law'), [], after).join('\n'),
    /does not exist on main/i
  )
})

test('findings answered "no" ask nothing of the laws', () => {
  const r = parseReviewRecord('VERDICT: APPROVED\n\nFINDING · NIT · a.ts:1 · x\nRECURRENCE: no\n')
  assert.deepEqual(recurrenceProblems(r, [], []), [])
})

// ─── Eviction: the merge is where working notes become history ───────────────

const CLEAN = {
  statusAdded: 12,
  statusRemoved: 9,
  statusExistedAtBase: true,
  statusLines: 44,
  statusCap: 60,
  progressAdded: 6,
  progressRemoved: 0,
  unarchivedScratch: [] as string[],
}

test('a clean merge has nothing to evict', () => {
  assert.deepEqual(evictionProblems(CLEAN), [])
})

test('a STATUS.md that only grew was appended to, not rewritten', () => {
  const appended = evictionProblems({ ...CLEAN, statusRemoved: 0 })
  assert.equal(appended.length, 1)
  assert.match(appended[0], /rewritten/i)

  const untouched = evictionProblems({ ...CLEAN, statusAdded: 0, statusRemoved: 0 })
  assert.match(untouched.join('\n'), /does not touch/i)
})

test('a branch that CREATES STATUS.md is not accused of appending to it', () => {
  // The gate's own first run failed here, on this branch, which is the branch that
  // introduces STATUS.md: 42 added, 0 removed, and "you appended instead of
  // rewriting" is a confident wrong answer. The check was reading a PROXY — no
  // deletions — for the fact it wanted, which is whether an existing status page was
  // carried forward untouched (`app.md` M3.2). Hand it the fact.
  const created = { ...CLEAN, statusAdded: 42, statusRemoved: 0, statusExistedAtBase: false }
  assert.deepEqual(evictionProblems(created), [])

  // And the exemption is exactly one merge wide: once it exists, appending is appending.
  assert.match(evictionProblems({ ...created, statusExistedAtBase: true }).join('\n'), /rewritten/i)
})

test('STATUS.md is held to its cap at the moment of the merge, not only in the battery', () => {
  assert.match(evictionProblems({ ...CLEAN, statusLines: 61 }).join('\n'), /61 lines against a cap of 60/)
})

test('a merge with no PROGRESS.md entry, or one that rewrites it, is blocked', () => {
  assert.match(evictionProblems({ ...CLEAN, progressAdded: 0 }).join('\n'), /PROGRESS\.md/)
  assert.match(evictionProblems({ ...CLEAN, progressRemoved: 3 }).join('\n'), /append/i)
})

test('closed working notes must reach history in the same motion', () => {
  const problems = evictionProblems({ ...CLEAN, unarchivedScratch: ['.scratch/workflow-reset'] })
  assert.match(problems.join('\n'), /\.scratch\/workflow-reset/)
  assert.match(problems.join('\n'), /docs\/archive/)
})

test('a working-note folder is closed only when every status-bearing file in it is', () => {
  const dirs = closedScratchDirs([
    { dir: '.scratch/done', status: 'done' },
    { dir: '.scratch/done', status: 'shipped' },
    { dir: '.scratch/mixed', status: 'done' },
    { dir: '.scratch/mixed', status: 'ready-for-agent' },
    { dir: '.scratch/open', status: 'in-progress' },
  ])
  assert.deepEqual(dirs, ['.scratch/done'])
})

test('every closed state this repo actually writes counts as closed', () => {
  // The first draft read done/shipped/closed/merged/archived and would have missed
  // `resolved` and `wontfix`, which are `docs/agents/{issue-tracker,triage-labels}.md`'s
  // own words — so a folder of resolved research tickets would have sat in .scratch/
  // forever with the gate reporting it clean. A word list over a vocabulary someone
  // else owns is exactly the shape `app.md` warns about; the difference here is that
  // the vocabulary is CLOSED and written down, and these are all of it.
  for (const status of ['done', 'shipped', 'closed', 'merged', 'archived', 'resolved', 'wontfix', 'DONE'])
    assert.deepEqual(
      closedScratchDirs([{ dir: '.scratch/f', status }]),
      ['.scratch/f'],
      `"${status}" should close`
    )

  for (const status of [
    'ready-for-agent',
    'ready-for-human',
    'needs-triage',
    'needs-info',
    'claimed',
    'in-progress',
  ])
    assert.deepEqual(
      closedScratchDirs([{ dir: '.scratch/f', status }]),
      [],
      `"${status}" is open, not closed`
    )
})

test('a folder with no status line at all is not "closed" by vacuous truth', () => {
  // `every` over an empty list is true, which would archive every folder of loose
  // notes the moment it contained no ticket. The bug is one keyword wide and the
  // damage is moving live notes into history.
  assert.deepEqual(closedScratchDirs([]), [])
  assert.deepEqual(closedScratchDirs([{ dir: '.scratch/loose', status: null }]), [])
})
