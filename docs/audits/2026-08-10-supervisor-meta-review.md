# Supervisor meta-review — 2026-08-10 (cold external auditor, adversarial)

> Mandated by the **Meta-review law** in `.claude/skills/fleet-lint/SKILL.md` ("the supervisor must
> not be the only grader of itself"). Scope: chapter 3, from the 2026-07-07 environment audit
> through today. Two jobs: (1) verify the disposition of that audit's 26 findings against the
> repository rather than against its own table, and (2) grade the supervisor's decisions — with
> particular weight on today, which carried a fleet-log compaction, a `CLAUDE.md` rewrite, and a
> two-stage split + restructure of `.claude/rules/app.md`.
> Every number below comes from a command, quoted with the finding. 20 findings.
> Read-only audit: this file is the only thing written.

## Overall verdict

The environment is measurably better than it was on 2026-07-07 and, for the first time, it
**shrank**: the always-on preamble went 2,716 → 6,508 words between 08-01 and 08-10 (+140% in nine
days, monotonic) and today's split cut it to 4,540, landing at 4,753. The three rituals the prior
audit found dormant are alive — `/fleet-lint` has now fired five times on its mechanical counter,
the review gate returned CHANGES on 21 of 33 verdicts across 323 recorded findings, and today's two
big refactors were executed with unusual rigour: the case-history file is a **byte-verbatim** copy
of the old rule (300/300 non-blank lines, zero mismatches) and the log archive is **`cmp`-identical**
to its pre-compaction snapshot. Those are real engineering, and the supervisor caught most of its
own drift before I did.

The dominant failure mode has moved. It is no longer silent staleness; it is **unverified
self-correction — the corrective pass introduces the class it is correcting, because the
environment layer has no gate.** Every code change on this repo passes two independent gates (a
cold `atlas-reviewer` plus the supervisor's own pass) and a battery. Every change to the files that
*govern* those sessions — `CLAUDE.md`, `.claude/rules/*`, the skills, the fleet logs — is committed
straight to `main` with none: today's five environment commits have no branch, no reviewer, no
VERDICT line (`grep -c` over the queue = 0). The result is visible in the diffs: the commit whose
subject is *"two verified false claims"* asserts a third one in its own body; the `ARCHITECTURE.md`
paragraph rewritten today **to fix a dangling pointer** now carries a new dangling pointer; the log
rebuild that preserved every entry dropped the header schema the merge-counter depends on; the
compaction that promoted `DECISIONS.md` to "permanent, never compacted" left it the *least*
protected file in `agent-memory/`; and the lint finding that `CLAUDE.md` was over budget was closed
by raising the budget. This is not sloppiness — each edit is well-reasoned. It is the absence of the
one step this repo's own law demands everywhere else: **re-derive the claim from a command after the
edit, not before it.**

---

## FINDINGS

### CRITICAL

**1.** `agent-memory/DECISIONS.md` · **evaporation risk** · Today's compaction created the fleet's
new permanent record — its own header says *"PERMANENT. Never compacted, never trimmed, append-only
like the logs"*, and `CLAUDE.md:34` sells it as "every founder decision, permanent". It is the
**least protected file in the directory**. `git check-ignore -v agent-memory/DECISIONS.md` →
`.gitignore:40`, so it is untracked. `grep -c "DECISIONS" .claude/settings.json` → **0**, so unlike
the other two logs it has no `Edit`/`Write` deny. `grep -n "LOGRE = " .claude/hooks/pre-bash-gate.mjs`
→ `'(cross-cutting|ready-queue)\.md'`, so every truncating bash door (`>`, `sed -i`, `tee`, `cp`,
`rm`, `writeFileSync`) is **open** on it. And `ls docs/archive/agent-memory-snapshots/2026-08-10/`
→ `BOARD.md cross-cutting.md ready-queue.md` — no `DECISIONS.md`, because fleet-lint check 11
(SKILL.md:93) still reads "copy `agent-memory/BOARD.md` + the two logs". Check 11's own
justification is now self-falsifying: it calls the snapshot *"the ONLY backup of every founder
DECISION ever made"* while the file it snapshots holds **zero** of them
(`grep -cE "^\[[^]]*\][ *]*(DECISION|DIRECTION)" agent-memory/cross-cutting.md` → 0). The 67
historical decisions survive in the git-tracked archive; the exposure is **every decision filed
from today onward**, which by the parallel-work law lands in exactly one git-ignored, unsnapshotted,
unguarded file on one disk. · **Remedy:** add `DECISIONS.md` to fleet-lint check 11's copy list, to
the `settings.json` deny pair, and to `LOGRE` in `pre-bash-gate.mjs` (with a gate-test case);
re-run the snapshot today.

**2.** `agent-memory/state-supervisor.md` · **drift — REGRESSION of prior finding 9** · The file
opens `## Where things stand (2026-08-08, rewritten at fleet-lint run 4)` and asserts
**`main = 713c114`**. `git log -1 --format=%h` → **`aacb641`**;
`git log --oneline --merges 713c114..HEAD` → **five** merges since. Its mtime
(`ls -l --time-style=+%Y-%m-%d_%H:%M`) is `2026-08-08_17:13` — two days and an entire chapter cold.
This is the exact finding the prior audit filed as #9, marked `[x]` fixed, and the exact thing
fleet-lint check 1 was amended to catch ("every `agent-memory/state-*.md` **INCLUDING the
supervisor's own**"). Run 5 executed that check today at 01:45, filed Lane M's stale state file as
its worst finding, and did not look at its own. A fresh supervisor born from this file gets a wrong
`main`, a wrong battery count, and no knowledge of the MAYA/calendar/catalog chapter. · **Remedy:**
rewrite it now; and since the check exists and still missed it, make check 1's state-file sweep
mechanical — compare each `state-*.md` mtime against the newest MERGE line and fail on the
supervisor's own first, before any lane's.

**3.** `.claude/rules/*`, `CLAUDE.md`, `.claude/skills/*` · **missing feedback loop** · The
environment's governing files are changed with **no gate at all**, while `main` is production.
`git log --format="%h %d %s" -6` shows `6b6fe21 · 2e3d7cc · 0585c96 · ea83ac7 · aacb641` committed
directly onto `main` (no branch, no `--no-ff` merge); `grep -c "aacb641\|ea83ac7\|0585c96\|2e3d7cc\|6b6fe21"
agent-memory/ready-queue.md` → **0**, so no READY entry, no `atlas-reviewer` dispatch and no VERDICT
exists for any of them. Iron rule 2 ("branch per mini-feature … ship via `/ship`") and the two-gate
supervisor ritual are applied to a CSS tweak and not to a rewrite of the law loaded into every turn
of every session. Findings 4, 6, 7, 9, 11 below are all defects a cold reader would have caught in
one pass. · **Remedy:** extend `/ship` — any diff touching `CLAUDE.md`, `.claude/rules/`,
`.claude/skills/`, `.claude/hooks/` or `.claude/settings.json` goes on a branch and gets an
`atlas-reviewer` pass whose brief is "re-run every command this diff cites and report what it
actually returns". That single brief would have caught findings 4, 6, 7 and 11.

### IMPORTANT

**4.** `.claude/rules/app.md:93-98` · **a command that contradicts the claim it supports** · The
`supabaseAdmin` law carries a per-module classification stamped "Verified 2026-08-10" with the
command `git grep -n "supabaseAdmin\." -- src/lib/db`. The classification is **substantively
correct**; the command does not produce it, and gets it backwards in both directions. Run literally,
it names five files — `companies.ts, projects.ts, quoteFolders.ts, quotes.ts, workspaces.ts`. It
**falsely hits `projects.ts` and `workspaces.ts`**, the two the law holds up as *"user client, RLS
load-bearing — copy these"*, because both contain the prose `…never supabaseAdmin. That is
deliberate…`. And it **silently omits `calls.ts`, `conversations.ts` and `transcripts.ts`**, three of
the six real admin modules, because they chain as `await supabaseAdmin` + newline + `.from(...)`.
Ground truth: `git grep -l "^import { supabaseAdmin }" -- src/lib/db` → `calls, companies,
conversations, quoteFolders, quotes, transcripts`. A cold reader re-deriving the law from its own
citation would conclude `projects.ts` bypasses RLS and that `transcripts.ts` — which
`docs/DATA-MODEL.md` flags as load-bearing — does not. This is the file's own **M1** and its own
"a grep hits comments" TRAP, committed inside the commit that wrote them. · **Remedy:** replace the
citation with `git grep -l "^import { supabaseAdmin }" -- src/lib/db`, which is what the
classification is actually about.

**5.** `agent-memory/cross-cutting.md:1-10` + `agent-memory/ready-queue.md:1-9` · **REGRESSION of
prior findings 19 and 20, introduced by today's rebuild** · The pre-compaction headers declared the
greppable line-type schema. `head -14 docs/archive/cross-cutting-2026-07-03--2026-08-10.md` shows
`TYPE ∈ MIGRATION · TOKENS · TYPES · ENGINE · DECISION · ALERT · LESSON · MERGE · LINT` and, in
full, *"LINT is RESERVED for /fleet-lint output lines (the merge-counter greps for it); lane
lesson-filings use LESSON. MERGE = one line per supervisor merge (/ship step 6)"*.
`head -14 docs/archive/ready-queue-…` shows the five queue types (`READY · VERDICT · FINDING ·
AMEND · CORRECTION`) plus the durable-evidence-path requirement. `head -20` on the two **live**
files shows every one of those lines is gone. This is load-bearing, not cosmetic: the fleet-lint
mechanical trigger counts `MERGE` lines since the last `LINT` line, and prior finding 20 exists
precisely because a lane once filed a lesson as `LINT` and made the missing lint runs harder to
detect. The reservation that prevents a recurrence is no longer stated anywhere a lane reads.
· **Remedy:** restore both type blocks to the rebuilt headers (append-safe: they are above the
first entry, but the files are deny-listed — prepare the text and hand the founder the placement
command, per the compaction protocol).

**6.** commit `2e3d7cc` (body) → `CLAUDE.md:18` · **hand-carried count, in the commit about
hand-carried counts** · The commit rewrote iron rule 1 from *"hook-blocked on both doors (Bash +
Supabase MCP)"* to *"hook-blocked at every door"*, justified in its body by: *"settings.json
registers **FOUR** PreToolUse matchers — Bash, `mcp__supabase__.*`, `mcp__railway.*` … and
`Edit|Write`"*. There are **three**:
`node -e "const s=require('./.claude/settings.json');console.log(s.hooks.PreToolUse.length)"` → `3`.
`Edit|Write` is a **PostToolUse** matcher running `post-edit-verify.mjs`, a formatter/typechecker
(`.claude/settings.json:45-50`) — it blocks no SQL and it is not a door. Two consequences: the
commit that opens *"Not judgment calls — both were checkable and both were wrong"* and lectures
that *"a count comes from a command"* asserts a fourth wrong count in the same paragraph; and the
edit traded a **checkable** claim (name the doors, count them) for an **unfalsifiable** one ("every
door") that will silently become false the first time an MCP server is added under a new prefix,
since the matchers are explicit. (The gate itself is sound — I read it: door 2 correctly reads
`tool_input.query ?? .sql ?? JSON.stringify(tool_input)`, door 3 is default-deny, and
`node .claude/hooks/gate-tests.mjs` → `ALL 70 GATE TESTS PASS`.) · **Remedy:** restore an
enumerable claim — "hook-blocked on all three doors (Bash · Supabase MCP · Railway MCP); adding an
MCP server means adding a matcher" — and fix the commit's record with a correction line.

**7.** `docs/case-history/app.md:239-240` · **a preserved status claim that is now false** · The
entry asserts *"Still open, same class: a >2MB Pinge snip renders as a chip client-side but is
silently stripped server-side and the model answers without the image (FINDING 2026-07-23)"*. It is
closed — and the supervisor itself closed it at **12:13 today**, logging in
`agent-memory/cross-cutting.md:125-129` that `PdfViewer.tsx:232` refuses the capture. I confirmed
independently: `git grep -n "attachmentOversized" -- src` shows a live call at
`src/components/live/PdfViewer.tsx:232`, and `git log -S"attachmentOversized"` dates the fix to
`1799909`, **2026-07-23 — the same day the finding was filed**, meaning the always-on rule carried a
false "still open" for 18 days. The case file was committed at 11:40 (`ea83ac7`) and the closure
logged at 12:13; `HEAD` (`aacb641`) does not touch it, so the falsehood is still on `main`. The
structural issue is bigger than one entry: the case file is verbatim **by design** ("Nothing was
rewritten"), it therefore freezes *status* claims and line numbers alongside lessons, it carries no
"as-of" warning, and `rules/app.md:12` actively directs readers into it. · **Remedy:** add a
one-line as-of banner to the case file ("status claims and line numbers are frozen at 2026-08-10 —
verify before acting"), and append a dated `[CLOSED 2026-08-10]` marker under this entry rather than
editing the verbatim text.

**8.** `.claude/skills/fleet-lint/SKILL.md:46` · **a filed finding closed by moving the goalpost** ·
Run 5 filed, at 01:45 today: *"6 · FILED — `CLAUDE.md` is **428 words** against its ~380 budget
(+13%). Deliberately NOT trimmed inline: it is standing law for every session in the fleet, and
silently shortening it at 01:45 is how a constraint disappears without anyone deciding to remove
it."* Ten hours later the same session raised the constraint instead. `git show ea83ac7:.claude/skills/fleet-lint/SKILL.md`
introduces `CLAUDE.md ≲ 550` — a **45% increase** on the 380 it had just been measured against —
inside a docs commit. `wc -w CLAUDE.md` → **540**, i.e. the file grew 428 → 540 (+26%) the same day
and now sits 10 words under its new ceiling. `grep -in "380\|budget\|550" agent-memory/DECISIONS.md`
→ nothing: no founder decision records the change. The reasoning for a bigger `CLAUDE.md` is
defensible (it absorbed the load-model warning and a real iron rule 5); the *process* is the exact
disappearance-without-a-decision that finding 6 named. · **Remedy:** either trim to 380 or file the
new budget as a DECISION with the founder's words, and add to check 5 the rule that a budget number
may only change in a commit whose subject is the budget.

**9.** `ARCHITECTURE.md:122` · **a dangling pointer created while fixing a dangling pointer** · The
paragraph reads *"see the **"Open, deliberately"** section of `.claude/rules/app.md`"* and is
followed, in the same paragraph, by the parenthetical explaining that it previously said *"read the
🔴 entry at the top of `.claude/rules/app.md`"* and that **no 🔴 entry ever existed**.
`grep -n "deliberately" .claude/rules/app.md` → **exit 1, no match**; the section is titled
`## Open findings — NOT laws.` The restructure (`aacb641`) renamed the section after `2e3d7cc`
wrote the pointer, and nothing re-checked it. Same defect class, same paragraph, same day.
· **Remedy:** point at the real heading, and add to `/ship`'s doc-truth step: after any heading
rename, `git grep` the old heading text across tracked docs **and** `agent-memory/`.

**10.** Always-on preamble · **accretion outrunning its own ceiling** · Measured per commit with
`wc -w` over `CLAUDE.md` + the four rules files: **2,716** (2026-08-01) → **3,247** (08-02) →
**3,784** (08-03) → **4,042** (08-08) → **5,855** (08-09) → **6,508** (08-10, pre-split) → **4,540**
(`ea83ac7`) → **4,753** (`aacb641`). Two facts follow. (a) Growth over the nine days before the
split averaged **421 words/day**, and it was monotonic — every environment edit added. (b) The
newly-declared ceiling is **~5,000 words** and the current figure is 4,753, i.e. **247 words of
headroom, under six hours of the observed rate** — and the corrective commit itself added 213 of
them back. There is no mechanical enforcement: check 5 is a manual sweep that has run five times in
five weeks, and it policed the wrong file for a month by its own admission. The asymmetry is the
point — API auth is a **test**, bidi has a **test**, the append-only logs have a **hook**; the
preamble budget, which taxes every token of every session, has a paragraph. · **Remedy:** make it a
test — a `preambleBudget.test.ts` that sums `wc -w` over the five files and fails past the ceiling,
so raising the budget requires editing a number in a test with a reason in the commit (which is
also the enforcement finding 8 needs).

**11.** `.claude/skills/fleet-lint/SKILL.md:104-108` · **a law with no trigger, applied 60% late** ·
The Meta-review law says "roughly every ~10 merges or once per feature cycle". Counting supervisor
`MERGE` lines across both logs since the 2026-07-07 audit
(`grep -oE "^\[[^]]*\] *(MERGE|LINT)"` over archive + live) gives **16 merges** before this audit
ran — and it ran only because run 5 flagged it in prose at line 115. Every other periodic ritual in
this environment was given a mechanical counter after the last audit; this one, which audits the
supervisor, was left as a feeling. That is the one ritual whose lateness the supervisor is
structurally least able to notice. · **Remedy:** give it the same treatment as `/fleet-lint` — a
`META` line appended at each meta-review, and a `/ship` step 6 clause forcing dispatch at ≥10 MERGE
lines since the last `META` line.

### MINOR

**12.** `ARCHITECTURE.md:493` and `:506` · **two different, both-wrong counts for one artifact** ·
:493 says `pre-bash-gate.mjs` is "Fire-tested (**15-case matrix**)"; :506 says `gate-tests.mjs` is a
"(**60 cases**)" matrix. `node .claude/hooks/gate-tests.mjs | grep -c "^PASS\|^FAIL"` → **70**
("ALL 70 GATE TESTS PASS"). Thirteen lines apart, in the harness table fleet-lint check 5 is
supposed to sweep. · **Remedy:** replace both with the command, as was done for the test enumeration
at :329 (which I verified exact: 652 tests, 69 files).

**13.** `docs/archive/ready-queue-2026-07-03--2026-08-10.md` · **filename misstates its own range** ·
`grep -oE "^\[20[0-9]{2}-[0-9]{2}-[0-9]{2}" … | sort | sed -n '1p;$p'` → first `[2026-07-02`, last
`[2026-08-09`. Both endpoints in the name are wrong by a day, and that filename is quoted in
`CLAUDE.md`, `.claude/rules/parallel-work.md`, `fleet-lint/SKILL.md` and both live log headers — the
five places a session is told where prior art lives. (The cross-cutting archive's name is exact:
07-03 → 08-10.) A lane searching for 2026-07-02 prior art would conclude the record starts a day
later. · **Remedy:** rename to `…-2026-07-02--2026-08-09.md` and update the five citations, or add
"(first entry 2026-07-02)" to the header.

**14.** `.claude/rules/app.md:33` and `:225` · **an over-strong qualifier on a good count** · Both
say the `DEMO_USER_ID` grep "reads as 14 live sites" and that "all 14 are prose" / "is zero". The
count is right (`git grep -o "DEMO_USER_ID" -- src | wc -l` → 14) and the substantive claim is right
(no fallback call site survives), but **3 of the 14 are not prose**: `apiAuthBoundary.test.ts:356` is
a live regex literal (`.filter((f) => /DEMO_USER_ID/.test(...))`) — the guard's own detector — and
`:348`/`:363` are string literals. A cold reader who runs the grep and lands on 356 sees executable
code where the law promised none, which is how a correct law loses its credibility. · **Remedy:**
"14 hits, none of them a fallback call site; three are the guard's own detector and its messages —
trust `apiAuthBoundary.test.ts`, which blanks comments and strings."

**15.** `docs/case-history/app.md:327` · **frozen line number, silently wrong** · The entry names
`lib/maya/events.ts:83` for the `getUTCFullYear` leak; `git grep -n "getUTCFullYear" --
src/lib/maya/events.ts` → **`:106`**. `.claude/rules/app.md:250` has it right, so the always-on layer
is correct and the file it points at for "the full story" is not. Same root cause as finding 7 (a
verbatim archive of live claims with no as-of marker) and closed by the same remedy.

**16.** `agent-memory/DECISIONS.md:9` · **a generation count that no command reproduces** · The
header says *"Generated by fleet-lint compaction 2026-08-10 from **69** DECISION/DIRECTION entries"*
and the file holds 69 bullets (`grep -c "^- "`), but the archive it names holds **67**
(`grep -cE "^\[[^]]*\] *(DECISION|DIRECTION)" docs/archive/cross-cutting-…` → 67; 68 allowing the one
`**DECISION` with markdown emphasis). Either two source entries were split into two lines each — fine,
but then the sentence is wrong — or two lines came from somewhere unstated. Separately, extraction
quality is uneven: **30 of 69** entries are truncated mid-sentence (`grep -c '…$'`), and three open on
a dangling fragment that has lost the decision's subject (`- **[2026-07-07]** 3) — …`,
`- **[2026-07-15]** 07-14) — …`, plus the 07-04 multi-item entry cut at item 2). The file is
explicitly an index into the archive, so truncation is by design — but an index entry whose first
words are `3) —` cannot serve its stated purpose ("read this before proposing anything the founder
may already have settled"). · **Remedy:** state the count from a command, and repair the ~3 fragment
heads by hand.

**17.** `.claude/hooks/pre-bash-gate.mjs:3` · **stale comment** · "Wired for **BOTH** doors to the DB:
Bash commands AND the Supabase MCP tools" — the Railway door was added at `55ffdf0` and is
implemented 50 lines below. Cosmetic, but it is the same "count in a comment" class as finding 6 and
sits in the file that finding 6 miscounted.

**18.** Merged, unpruned branches · **housekeeping, filed at run 5 and still open** ·
`git branch --merged main | grep -vc "^\*\|main$"` → **6**. Three are held by live worktrees
(`feat/documents-catalog`, `feat/ivrit-pipeline`, `feat/surfaces-import`, marked `+`); three are
freely prunable (`feat/company-profiles`, `feat/workspace-tables`, `fix/israel-time-residue`).

**19.** `docs/case-history/app.md` · **two orphan anchors** · The file has 24 `##` headings
(`grep -c '^## '`); `rules/app.md` references 22 of them
(`grep -o '#[a-z0-9-]*' .claude/rules/app.md | sort -u`). `signout-anchor` and
`transcripts-put-lenient` are unreferenced — harmless, because both laws carry their whole content
inline, but it means the "every law links its case" invariant is 22/24, not 24/24. · **Remedy:**
either add the two `→ #anchor` links or note in the case-file header that trivial laws have no case.

**20.** `PROGRESS.md:466` · **prior finding 18, never done, 39 days open** · Still reads *"Founder
action still open: rotate the Supabase token."* The prior audit's own table marks #18 `[ ]` and says
it was "folded into the board's open-items practice" — `grep -in "open items\|founder action\|awaiting
founder" agent-memory/BOARD.md` finds no such section. `PROGRESS.md` is append-only, so this line can
never be marked done; it is the one class of item this environment still has no home for.
· **Remedy:** the "open founder actions" section on the BOARD that #18 asked for, swept by
fleet-lint check 1.

---

## What is genuinely healthy — stated plainly, with the evidence

These were checked adversarially and passed. They should not be re-litigated.

- **The `app.md` split lost nothing.** I reconstructed the pre-split file
  (`git show ea83ac7^:.claude/rules/app.md` → 302 lines, 4,121 words, exactly as claimed) and
  compared its non-blank body against `docs/case-history/app.md` with headings and the header
  comment stripped: **300 vs 300 lines, 0 mismatches**. All 24 bullets became 24 entries. The
  "verbatim" claim is true in the strongest sense.
- **The log compaction was done correctly, by the book its own skill wrote.** Check 10 says verify
  with `cmp`, not an exit code: `cmp docs/archive/agent-memory-snapshots/2026-08-10/cross-cutting.md
  docs/archive/cross-cutting-2026-07-03--2026-08-10.md` → identical; same for the queue. The live
  extract also reconciles exactly — the archive holds 30 current-era entries, 12 are
  DECISION/DIRECTION and moved to `DECISIONS.md`, leaving 18, and the live file holds 20 (18 + the 2
  appended today). Nothing was dropped or invented.
- **`/fleet-lint` fires mechanically.** Prior finding 1 is genuinely fixed. Reconstructing the
  cadence from `MERGE`/`LINT` lines: 2 merges → LINT (07-14), 3 → LINT (07-23), 4 → LINT (08-01),
  3 → LINT (08-08), 4 → LINT (08-10). It over-runs to 4 on days with a same-day merge burst, which is
  worth a glance, but the ritual is alive and its findings are specific and acted on.
- **The review gate does real work.** Across both queues: **21 CHANGES vs 12 APPROVED** verdicts and
  **323 FINDING lines**. A gate that returns CHANGES on two-thirds of rounds is not a rubber stamp.
- **The mechanical guards are green and honest.** `npm test` → **652/652**;
  `node .claude/hooks/gate-tests.mjs` → **70/70**; the `PUBLIC` allowlist is 7 entries under a
  hard cap of 8 with a stated reason each; `git grep "auth\.getSession()" -- src` → nothing.
  Every test `rules/app.md` names as `ENFORCED` exists, and I spot-checked the least likely one —
  `src/lib/workspace/data.test.ts:86-125` really does encode the `<bdi>` rule structurally, and the
  rule is honest that it covers one surface only.
- **`ARCHITECTURE.md` is mostly accurate now.** All 16 concrete file paths it names exist; its test
  enumeration ("652 tests across 69 files") matches both `npm test` and `package.json` exactly, and
  it carries the command that regenerates it. Findings 9 and 12 are the exceptions, not the rule.
- **The prior audit's doc-lifecycle fixes held.** 60/60 plans and specs carry the SHIPPED banner
  (including the stray `2026-06-09-v2-results.md`); every `docs/*.md` is indexed in the CLAUDE.md doc
  map (zero unindexed); `docs/evidence/` holds a README plus 18 branch folders; five brain snapshots
  exist. The supervisor-note and graduation-marker exceptions are used repeatedly and correctly.
- **Today's `CLAUDE.md` corrections were right and checkable.** The load-model claim (rules are
  already in context) is correct; the bidi rewrite is backed by `git grep -o "<bdi" -- src | wc -l`
  → 127 against `dir="ltr"` → 80, exactly as the commit claims; "7 occurrences" traces to a real
  queue FINDING ("THE `<bdi>` RULE REACHED SEVEN OCCURRENCES"), not to another document.

---

## The structural blind spot

The prior audit named **silent staleness**. That is largely solved: mtimes, counters, snapshots and
markers now exist for it — and where it survives (finding 2) it survives inside the supervisor's own
seat, which is the tell.

The current blind spot is narrower and harder: **the supervisor cannot be a cold reader of a file it
just rewrote, and nothing else reads it.** Code gets a cold `atlas-reviewer` by law. Prose does not.
So the environment's quality now depends entirely on the supervisor re-deriving its own claims from
commands *after* editing — which is precisely the discipline that is hardest to apply to text you
have just spent an hour reasoning about, and which the repo has already learned it cannot do for
code (that is why the reviewer exists). Findings 4, 6, 7, 9 and 12 are all one-command checks. The
fix is not more diligence; it is finding 3.

A second-order version worth naming: **the case-history split converts a self-correcting document
into a frozen one.** The old `rules/app.md` was wrong for 18 days about the Pinge finding (finding 7)
— but it was in every session's context, so any session could notice. Its forensic half now lives in
a file nobody loads, is declared verbatim, and carries live status claims and line numbers
(findings 7, 15). The split was right; it needs the as-of banner and an append-a-dated-marker
convention, or the case file becomes a well-organised museum of things that used to be true.

---

## Is the environment improving or accreting?

**Improving, and today it proved it can shrink — but only under manual intervention, and the new
ceiling is already 5% away.** The measured series in finding 10 is the answer: nine days of
monotonic growth at 421 words/day, then a deliberate 30% cut. Nothing prevents the next nine days.

On dead law: I found **no** rule that has never been applied. The most suspicious candidate —
prior finding 26's "ports are declared in one place" — turns out to be *half* done (ports are still
restated in `verify-app/SKILL.md:14`, `docs/ENVIRONMENT.md:42` and four LAUNCH-KIT prompts), but
run 5 **did** flag it and **accepted it with a reason** ("a pasted prompt cannot dereference a rule,
and all four AGREE with `parallel-work.md`"). That is a law being applied and consciously scoped,
which is the healthy outcome, not drift. The genuinely under-applied law is the Meta-review law
(finding 11), and the genuinely unenforceable one is the preamble budget (finding 10).

---

## Fix disposition (supervisor-maintained)

| # | Sev | Where | One-line remedy | Status |
|---|-----|-------|-----------------|--------|
| 1 | CRITICAL | `agent-memory/DECISIONS.md` | Add to fleet-lint check 11 snapshot list, `settings.json` deny, and `LOGRE` in the bash gate + a gate test | |
| 2 | CRITICAL | `agent-memory/state-supervisor.md` | Rewrite now; make check 1's own-state sweep mechanical (mtime vs newest MERGE line, supervisor first) | |
| 3 | CRITICAL | `.claude/**`, `CLAUDE.md` | `/ship`: environment diffs go on a branch + `atlas-reviewer` briefed to re-run every command the diff cites | |
| 4 | IMPORTANT | `.claude/rules/app.md:93-94` | Cite `git grep -l "^import { supabaseAdmin }" -- src/lib/db` instead | |
| 5 | IMPORTANT | both live log headers | Restore the line-type schema + the `LINT`-reserved rule (founder places it; files are deny-listed) | |
| 6 | IMPORTANT | `CLAUDE.md:18` + `2e3d7cc` | Restore an enumerable claim (three doors, named); file a correction for the commit's count | |
| 7 | IMPORTANT | `docs/case-history/app.md:239` | As-of banner on the case file + a dated `[CLOSED 2026-08-10]` marker under the entry | |
| 8 | IMPORTANT | `fleet-lint/SKILL.md:46` | File the 380→550 change as a DECISION, or trim; budgets change only in a commit about the budget | |
| 9 | IMPORTANT | `ARCHITECTURE.md:122` | Point at `## Open findings — NOT laws`; add a heading-rename grep to `/ship` doc-truth | |
| 10 | IMPORTANT | always-on preamble | `preambleBudget.test.ts` summing `wc -w` over the five files, failing past the ceiling | |
| 11 | IMPORTANT | `fleet-lint/SKILL.md:104` | `META` line + `/ship` step 6 clause forcing dispatch at ≥10 MERGE lines since the last one | |
| 12 | MINOR | `ARCHITECTURE.md:493,506` | Replace both counts with the command; actual is 70 | |
| 13 | MINOR | `docs/archive/ready-queue-…md` | Rename to the true range (07-02→08-09) or state it in the header; update 5 citations | |
| 14 | MINOR | `.claude/rules/app.md:33,225` | Reword: 14 hits, none a fallback call site, three are the guard's own detector | |
| 15 | MINOR | `docs/case-history/app.md:327` | Covered by finding 7's as-of banner (`events.ts:83` → `:106`) | |
| 16 | MINOR | `agent-memory/DECISIONS.md:9` | Count from a command; repair the ~3 fragment heads | |
| 17 | MINOR | `pre-bash-gate.mjs:3` | "BOTH doors" → three doors | |
| 18 | MINOR | git branches | Prune the 3 non-worktree merged branches | |
| 19 | MINOR | `docs/case-history/app.md` | Link or exempt `signout-anchor` and `transcripts-put-lenient` | |
| 20 | MINOR | `PROGRESS.md:466` | The open-founder-actions BOARD section prior finding 18 asked for | |

---

## Disposition of the 2026-07-07 audit's 26 findings — verified against the repository

The table at the bottom of that audit claims 25 of 26 done. **Verified: 22 hold, 3 have regressed,
1 was never done** (the last self-acknowledged). Two more hold only partially and are noted.

| # | Prior finding | Claimed | **Verified** | Evidence |
|---|---|---|---|---|
| 1 | /fleet-lint never runs | `[x]` | ✅ **HOLDS** | 5 LINT lines at merge cadences 2/3/4/3/4; `/ship` step 6 carries the counter |
| 2 | ARCHITECTURE.md drift; no /ship step | `[x]` | ⚠ **PARTIAL** | Step exists and the doc is mostly right (16/16 paths, exact test count) — but its Railway line was false for 2 days after go-live, and findings 9 + 12 are live drift today |
| 3 | Shipped plans unstamped | `[x]` | ✅ **HOLDS** | 60/60 plans+specs carry the SHIPPED banner, incl. the stray `2026-06-09-v2-results.md` |
| 4 | Lane-I evidence only in a worktree | `[x]` | ✅ **HOLDS** | `docs/evidence/ivrit-m1/` present; rescue is retirement step 2 |
| 5 | `agent-memory/` unbacked up | `[x]` | ⚠ **PARTIAL** | 5 snapshots exist (07-14 … 08-10) — but the ritual's file list was not updated when `DECISIONS.md` was created today → **finding 1** |
| 6 | Dormant lane sections uncorrectable | `[x]` | ✅ **HOLDS** | `[supervisor note …]` used 9+ times in BOARD.md |
| 7 | Hand-typed counts on the board | `[x]` | ✅ **HOLDS** | READY entries paste ranges (`55ffdf0..43936cc`); one entry self-corrects its own battery arithmetic |
| 8 | Lane M false blocker | `[x]` | ✅ **HOLDS** | superseded by later dated notes |
| 9 | `state-supervisor.md` frozen | `[x]` | ❌ **REGRESSED** | Dated 2026-08-08, asserts `main = 713c114`; HEAD is `aacb641`, 5 merges later → **finding 2** |
| 10 | transcript-review bad pointers/port | `[x]` | ✅ **HOLDS** | points at `src/lib/correction.ts`; no `:3000` |
| 11 | No re-mission runbook | `[x]` | ✅ **HOLDS** | runbook is `/ship` §"Re-mission"; LAUNCH-KIT's pending Lane M prompt is explicitly banner-marked, not silently stale |
| 12 | Graduation unrecordable in lane files | `[x]` | ✅ **HOLDS** | `[graduated → …]` markers in `state-ivrit.md:82`, `state-multiview.md:179` |
| 13 | Append-only law unenforced | `[x]` | ✅ **HOLDS** | 8 deny entries in `settings.json`; 7 bash-door blocks; 70/70 gate tests — **for the two logs only** (see finding 1) |
| 14 | LAUNCH-KIT :8788 claim | `[x]` | ✅ **HOLDS** | all three mentions say `cross-cutting.md` |
| 15 | Evidence lives in dead sessions | `[x]` | ✅ **HOLDS** | `docs/evidence/` + README + 18 branch folders; durable-evidence law is `/ship` lane step 6 |
| 16 | "Mission 4" ambiguity | `[x]` | ✅ **HOLDS** | `VISION.md:73-74` marks IVRIT SHIPPED and disambiguates from Mission 4 |
| 17 | CLAUDE.md single-engine line | `[x]` | ✅ **HOLDS** | `CLAUDE.md:45` — "TWO engines share :8788" |
| 18 | Open founder actions untracked | `[ ]` | ❌ **NEVER DONE** | `PROGRESS.md:466` still open at day 39; no BOARD section exists → **finding 20** |
| 19 | Queue line types undeclared | `[x]` | ❌ **REGRESSED TODAY** | The rebuilt `ready-queue.md` header dropped all five type declarations → **finding 5** |
| 20 | `LINT` type collision | `[x]` | ❌ **REGRESSED TODAY** | The rebuilt `cross-cutting.md` header dropped the TYPE vocabulary and the "LINT is RESERVED" sentence → **finding 5** |
| 21 | No log compaction threshold | `[x]` | ✅ **HOLDS** | check 10, and it fired: run 5 measured 1764/966 lines against 400 and executed the compaction |
| 22 | Unindexed docs | `[x]` | ✅ **HOLDS** | zero `docs/*.md` missing from the CLAUDE.md doc map |
| 23 | live-test hardcoded port/call-id | `[x]` | ✅ **HOLDS** | SKILL.md:24,35,64 defer to `rules/parallel-work.md` |
| 24 | fleet-lint check 7 unfalsifiable | `[x]` | ✅ **HOLDS** | check 7 is evidence-based and now diffs against `DECISIONS.md` |
| 25 | ENVIRONMENT.md stray fence | `[x]` | ✅ **HOLDS** | file ends cleanly |
| 26 | Ports maintained by hand in 4 places | `[x]` | ⚠ **PARTIAL** | `parallel-work.md` declared the source, but restatements remain in `verify-app/SKILL.md:14`, `ENVIRONMENT.md:42` and 4 LAUNCH-KIT prompts — flagged by run 5 and **consciously accepted**, all four consistent. Scoped, not drifted. |

**Score: 22 hold · 2 partial · 3 regressed · 1 never done.** The three regressions are the valuable
ones: #9 regressed inside the seat that owns the check meant to catch it, and #19 + #20 were undone
**today**, by the compaction — a knowledge-preserving operation that preserved every entry and
dropped the schema that makes the entries greppable.

---

## [DISPOSITION 2026-08-12] — appended, never edited into the table above

This report was written on `fix/meta-review-2026-08-10`, which never merged. Half of what it
prescribes died with the fleet (ADR-0001): findings naming `fleet-lint`, `state-supervisor.md`,
the board, the queue or `agent-memory/` are moot — those artefacts no longer exist. The Status
column is left blank as written, because re-authoring a historical record falsifies it.

**Carried into `main` by `chore/workflow-reset` (commit `620fb21`), all four re-verified by
re-running the command rather than trusting this report:**

- **Finding 4** — `app.md` now cites the import grep. Widened to
  `git grep -lE "^import \{[^}]*supabaseAdmin" -- src/lib/db` so a combined import cannot slip,
  and the law now says out loud that the grep is still a proxy (M3.2) for a line-wrapped import.
- **Finding 6** — `CLAUDE.md` iron rule 1 names three doors (`Bash`, `mcp__supabase__.*`,
  `mcp__railway.*`), enumerated from `settings.json`, not recalled.
- **Finding 17** — the same false count in `.claude/hooks/pre-bash-gate.mjs`'s own header
  ("BOTH doors") is corrected in the same motion; round 4 of review caught that the fix for
  finding 6 had left its twin standing.
- **Finding 9** — `ARCHITECTURE.md`'s pointer no longer dangles: the "Open findings" section left
  `rules/app.md` entirely on 2026-08-12 and is now `docs/open-findings.md`, with its own
  ARCHITECTURE row and a `CLAUDE.md` doc-map line.

**Deliberately not carried:** the DEMO_USER_ID reclassification landed too (14 hits: 11 comments,
3 the guard's own detector and messages, 0 fallbacks), but is not numbered here. Everything else
is either fleet-era or still open — the sixteen unfixed findings are unfixed, and this note is not
a claim otherwise.
