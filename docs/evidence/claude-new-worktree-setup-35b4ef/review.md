# Cold review — Agents V1, Plan 1 (foundations)

Branch: `claude/new-worktree-setup-35b4ef` · reviewer `atlas-reviewer`, cold context every round.
Full round-by-round ledger, verbatim, including every ruling taken on a verdict:
`docs/evidence/claude-new-worktree-setup-35b4ef/plan-1-ledger.md` (rescued from the worktree's
untracked SDD notes, which do not survive the worktree — durable-evidence law, `/ship` step 6).

**Rounds are stated below as PROSE, and exactly one `REVIEWED:`/`VERDICT:` pair parses — the last
one, at the foot of this file.** `parseReviewRecord` takes the FIRST match of each, so a per-round
pair would hand the ship gate the OLDEST sha and let a stale approval stand for the tip (filed
2026-08-15, ticket 08b).

- **Task 3, round 1 — VERDICT: CHANGES at the migration FILE, before it touched production.** All
  sixteen ownership checks re-derived independently and passing; one BLOCKER (below).
- **Guard rounds 2 and 3 — VERDICT: CHANGES**, both against `compositeChildFk.test.ts` itself, the
  mechanism written to answer round 1. Neither reached the database.
- **Task 5 and Task 1/2 rounds — review clean**, seven minors deferred; the ones that survived
  final triage are findings below, the rest are in the ledger.
- **Final whole-branch review over `21b0615..c93a7c3` — VERDICT: CHANGES.** One BLOCKER, six
  filed. It re-verified the branch's own claims rather than accepting them (1194/113 against a real
  run, `tsc` clean, `env:health` 10,386/10,410 with the unenforced count unmoved at 13, no secret
  anywhere) and **mutation-probed the new guard in a COPIED migration tree instead of reading it.**

**On the recurrence answers below.** Three of these findings ARE repeats in substance, and all three
are answered `no`, deliberately and not as a dodge — the gate's own rule is that a `yes` must name a
law **main already holds** whose declaration then gets stronger. What each of them repeats is not
such a law: two repeat `rules/app.md`'s meta-law **M3 clause 2** and its CRLF **TRAP**, neither of
which `parseLaws` sees (only `**LAW ·**` blocks are laws, and M3/TRAP carry no `ENFORCED` line by
design); the third repeats a **spec instruction**, `docs/SMART-LAYER-SPEC.md:165`. Answering `yes`
to any of them would name a law that resolves to nothing, or one this branch itself introduces,
which the gate correctly refuses as a first occurrence. **The promotion was paid anyway, in the same
commits** — a new law in `rules/db.md` at the `mechanism` tier, a canary, and finally the law
restated to measure what its mechanism measures. That is recorded here rather than smoothed away,
because "the gate could not represent it" is a real limit of the gate and not an absolution.

---

FINDING · BLOCKER · `supabase/migrations/20260816_032_agents.sql` · every child FK was
single-column, and PostgreSQL referential-integrity checks bypass RLS, so a row inserted with
`user_id = self` and `agent_id = <a stranger's agent>` validates in the database and passes the
`with check` policy too.
RECURRENCE: no
Substantively a repeat of `docs/SMART-LAYER-SPEC.md:165`, which had already told this build to copy
015/016 verbatim, and of the 2026-08-13 foundation review that restated it — but a spec line is not
a law in the always-on set, so `yes` would resolve to nothing. Answered at the tier the repeat
deserves instead: a new **LAW in `.claude/rules/db.md`** declaring `ENFORCED` with a real mechanism,
`src/lib/db/compositeChildFk.test.ts`, in the same commit as the fix. Caught before apply, which is
the whole reason `rules/db.md` reviews DDL on the file rather than after.

FINDING · BLOCKER · `src/lib/db/compositeChildFk.test.ts:260` · the guard decided on FK ARITY
(`columnCount > 1`), not on whether `user_id` is in the key, so `foreign key (agent_id, created_at)
references public.agents (id, created_at)` ran green with two columns and zero ownership binding.
RECURRENCE: no
Repeats `rules/app.md` **M3 clause 2** — give the choke point the FACT it is deciding on, never a
proxy — which is a meta-law with no `ENFORCED` line and no title the parser resolves, so `yes` would
match no law. **Answered by moving the declaration that CAN move:** `rules/db.md`'s law went from
"COMPOSITE, keyed through `user_id`, never single-column" to "KEYED THROUGH `user_id`", because the
old wording was the same proxy the mechanism was measuring — declaration and mechanism agreed with
each other and both missed the point. The guard now reports `keyedThroughUserId` and the test asks
for it directly. Verified by probe in a copied migration tree, both directions: the arity case
failed after the fix, and the three real composite FKs in 032 were mutation-proved to be what the
guard is actually reading. Third time on this branch that a guard's declared reach exceeded its
measured reach, and every one was found by RUNNING it against variants rather than reading it.

FINDING · WARNING · `src/lib/db/compositeChildFk.test.ts:120` · `stripComments` was a no-op on CRLF
(`.` excludes `\r`, and `$` without the `m` flag does not match before one), so it blanked comments
in exactly the one LF migration it was written against and in none of the other 31.
RECURRENCE: no
Repeats this repo's own **TRAP, "a scripted edit can silently match nothing"** — a trap, not a law,
so `yes` resolves to nothing. Answered with the tier the repeat owes: a **CANARY** that asserts a
known-CRLF fixture's comments are actually blanked, copying `api/errorShape.test.ts`, which earned
the same test after its first version matched a word inside a comment and failed to bite when the
bug was reintroduced. Proven both directions before trusting it: an injected reference inside an
existing comment red-lined a correct migration, and a commented-out owner policy pulled `companies`
into `ownerScoped` and red-lined its seven legitimate refs. No false NEGATIVE was reachable, so this
was a robustness and honesty defect rather than a hole, and the applied DDL was untouched.

FINDING · WARNING · `src/lib/db/compositeChildFk.test.ts:221` · the FK regex missed two legal forms
— `references public.agents` with no column list, and `references agents(id)` with no schema prefix
— the first being the most idiomatic way to write the exact bug the guard exists to catch.
RECURRENCE: no
Fixed in round 4; the schema is captured and checked explicitly rather than assumed, so a genuinely
different-schema reference (`auth.users`) is still excluded.

FINDING · NIT · `src/lib/db/compositeChildFk.test.ts:192` · the table-level `foreign key (...)`
branch required a `public.` qualifier, so an unqualified composite FK fell through to the inline
regex and was misreported as single-column, while the test's own STATED LIMITS claimed both forms
were handled.
RECURRENCE: no
Folded into the blocker fix and probed: a correct `foreign key (agent_id, user_id) references agents
(id, user_id)` was red-lined before, and passes after. The stated-limits paragraph was corrected in
the same edit — a guard whose prose overstates its reach is the failure `rules/app.md` opens with.

FINDING · NIT · `scripts/agents-smoke.mjs:25` · `loadLocalEnv()` walked up from cwd with no
boundary, so a run from an unexpected directory would import EVERY key from the first `.env.local`
it found and hand an unrelated project's credentials to a real, billable API.
RECURRENCE: no
The walk now only ACCEPTS a file sitting beside a `package.json` belonging to this repo, and may
still pass through intermediate directories so it reaches the primary checkout from a worktree.
Verified both directions by probing the SHIPPING function's own source text, printing paths only:
climbs out of the worktree to the primary checkout; returns null against a decoy and leaks nothing.
Identifying the repo by package name rather than `.git` is deliberate — a worktree's `.git` is a
FILE, so `.git`-presence would stop the walk at the one directory guaranteed not to hold the file.

FINDING · NIT · `STATUS.md:21` · still read "STRICT ORDER: 10 → 11 → 12 → 13 → 14" and "Next: close
09, then 10" after this branch's own `DECISIONS.md` entry superseded tickets 10–14.
RECURRENCE: no
STATUS.md is rewritten as part of the ship prep. **The gate checks only that the file CHANGED, not
that it is true**, which is precisely why this had to be a finding rather than a gate item.

FINDING · NIT · `.scratch/agents-v1/spec.md:3` · still read `awaiting-founder-review` after all its
rulings were filed in `DECISIONS.md` and a migration had shipped against it into production.
RECURRENCE: no
Now states APPROVED — BUILDING, what Plan 1 landed, and what it did NOT: no agent can be created or
run yet.

FINDING · NIT · `docs/evidence/agents-v1/mechanism.md` · the owed
`ANTHROPIC_ENVIRONMENT_ID=env_01Ryu53wpYhzBHhAKPiAV9M7` lived only in an evidence file nothing
loads, so the first thing Plan 2 needs was the one thing no always-on document mentioned.
RECURRENCE: no
Now in `STATUS.md`, named as owed in TWO places — the primary checkout's `.env.local` AND Railway —
and marked as an id rather than a secret. No agent in this repo can write `.env.local` (denied by
`.claude/settings.json` and by `pre-bash-gate.mjs`), so this is a founder hand-off by construction.

FINDING · NIT · `src/lib/agents/budget.ts:17` · `runBudget()` is never tied to the SDK's
`BetaManagedAgentsBudgetLimit`, so the $1.00 cap rests on a grep and one manual run — a later SDK
bump that renames the field keeps the battery green, and a silently-dropped budget is an UNCAPPED
run against a live account.
RECURRENCE: no
**Filed, not fixed — carried into Plan 2's requirements.** It closes naturally when `runBudget()` is
passed to `sessions.create()` and `tsc` checks it for real, **provided that call site is not cast**.
Nothing in Plan 1 executes a run, so nothing here can exceed a budget; the exposure begins with the
run engine, which is where the type check has to land.

---

## Round history — three verdicts, each naming the commit it read

**`c93a7c3` — CHANGES.** The whole-branch review, on the FK-arity BLOCKER above: the guard decided
on `columnCount > 1` rather than on whether `user_id` was in the key, so
`foreign key (agent_id, created_at) references public.agents (id, created_at)` ran green. Fixed in
`8728e7a` by deciding on `keyedThroughUserId`, and the law in `rules/db.md` was restated from "never
single-column" to "keyed through `user_id`" so the declaration measures what the mechanism measures.

**`1bf3d93` — CHANGES.** The tip re-review, on a **false sentence in `STATUS.md`**: it told every
future session that the ship gate was blocked by the 09b merge and that "every merge after it hits
the same gate — a second consecutive override is a founder call." Untrue. `recurrenceProblems`
reads only the CURRENT branch's `docs/evidence/<branch>/review.md`; 09b's declarations are never
re-opened. **The claim was INHERITED FROM `main`, not invented here** — `git show main:STATUS.md`
lines 36-37 already say "09b's four recurrence declarations are unanswered, so the next merge hits
the same gate", written at the 09b ship and therefore before this branch's merge-base (`21b0615`).
It was then repeated in this session, and **generalised** in the STATUS rewrite from "the next
merge" to "every merge after it", and never measured until someone ran the gate — `rules/app.md` M1.
That origin is the sharper lesson and it is checkable from the repo: **a false sentence in the
always-on set propagates across ships until someone runs the command.** It blocked because it sits
in the set loaded into every turn, one command in the same tree refutes it, and its only operative
effect was to pre-authorise a second consecutive `ATLAS_SHIP_OVERRIDE`.
Same round: the stated limit added to `compositeChildFk.test.ts` was itself false (a quoted
`"USER_ID"` passes, because the code strips quotes then lowercases) — a false limits paragraph
written in the commit that fixed a false limits paragraph. And the set merged at one token of
headroom. All answered in `035b572`.

**`035b572` — APPROVED.** Re-probed rather than read. Ten probes against the rewritten limits
paragraph, ten correct: unquoted `USER_ID` passes (Postgres folds), quoted `"USER_ID"` passes
(deliberate over-acceptance, now stated), whitespace and newlines trimmed, and `owner_user_id`,
`myuser_id` and `user_idx` all correctly red-lined by whole-token match. The two shapes that pass
and look like holes — a positions-swapped key and a child pointer with no FK — are now named with
the reason each is not one. `env:health` 10,400 / 10,430 with 30 spare, and the raise's per-file
components match the command's output exactly rather than being arithmetic. Battery 1194/1194,
`tsc` clean. The `STATUS.md` correction verified true by re-reading `scripts/ship-gate.mjs`, not by
trusting the fix.

Three notes recorded as **not findings**: the STATUS correction should evict at the next rewrite,
having done its one cycle of refuting a belief this file itself planted; the limits paragraph stays
beside the code it describes rather than moving to case-history, because being checkable only
elsewhere is exactly why it stayed false for two rounds; and `app.md` remains 5,727 of 10,400 tokens
with its shrink nine slices overdue — a founder-scheduled mission, not a merge condition.

---

REVIEWED: 035b572
VERDICT: APPROVED
