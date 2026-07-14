# Smart-environment audit — 2026-07-07 (cold-context agent, supervisor-dispatched)

> Founder-requested audit of every environment md file (CLAUDE.md, rules/, skills/, agent-memory/,
> docs/, PROGRESS/ARCHITECTURE) against the mission: a parallel-fleet work environment that only
> improves. Seeded with 4 supervisor observations from the Lane-I ship cycle; the agent verified
> those and generalized. 26 findings. Fix disposition is tracked at the bottom.

## Overall verdict

The environment is structurally sound and genuinely self-improving — the funnel (state → rules/skills → CLAUDE.md), the typed append-only logs, the two-gate ship ritual, and the graduated Lane-I lessons all demonstrably worked in the July 2–4 cycle. But the system's health depends on three manual rituals that are already skipping beats: **/fleet-lint has apparently never run** (zero supervisor `LINT` output lines in cross-cutting.md despite ~6 merges since the skill shipped), **ARCHITECTURE.md missed an entire merged feature**, and the **stamp/graduate/refresh steps fire only at "feature retirement", which never happens for a seat that rolls into M2**. The failure mode is not chaos but silent staleness: dormant sections nobody is allowed to correct, evidence parked in deletable worktrees, and prompts/docs that would mislead exactly the cold session this system is designed for.

## FINDINGS

### CRITICAL

1. `agent-memory/cross-cutting.md` · **missing feedback loop** · The fleet-lint output line (`[ts] LINT — N findings…`) appears zero times — the skill mandates a run "every 2-3 merges" and ~6 merges have happened since it shipped 2026-07-02, so the environment's only drift-catching mechanism is dormant (every drift finding below is downstream of this) · Add a mechanical trigger: /ship supervisor step 5 appends a merge counter line and step 6 says "counter ≥3 since last LINT line → run /fleet-lint now, before updating the board".

2. `ARCHITECTURE.md:219` (also 211-213, 258-276) · **drift** · Three days after the IVRIT merge the codebase map still calls `live-broadcast.mjs` "THE live engine", omits `scripts/live-ivrit-broadcast.ts` + 5 sibling scripts (all verified present), omits `src/lib/live/{ivritParse,ivritStitcher,pcmChunker,wavEncode}.ts` + 3 test files, claims "45 tests" (main is at 64+), and its harness table lacks `rules/app.md`, `skills/fleet-lint`, `agents/atlas-reviewer.md`, and `hooks/gate-tests.mjs` — because /ship has no "update ARCHITECTURE.md" step; the doc self-describes as "when we change structure, we update it" but nothing operationalizes that · Add "update ARCHITECTURE.md for any new/moved files" as an explicit /ship supervisor step (step 5, beside the PROGRESS append).

3. `docs/superpowers/plans/2026-07-03-ivrit-live-pipeline-m1.md:3` (and the spec beside it) · **lifecycle gap** · The fully-executed M1 plan carries no `STATUS: SHIPPED` banner and its first line actively commands agents to execute it task-by-task — the stamping trigger lives in the *retirement* ritual (ship SKILL.md step 3), which never fired because Lane I's seat continues to M2, so every "seat continues" ship leaves a live-looking dead plan · Move stamping from the retirement ritual to the merge ritual: /ship supervisor step 5 stamps any plan/spec whose scope this merge completes.

4. Atlas-ivrit worktree (`.superpowers/sdd/task-8-report.md`, `.superpowers/sdd/progress.md`, `scripts/out/sessions/2026-07-04-first-real-zoom/`, `…-real-zoom-2/`) · **evaporation risk** · The M1 quality report, the SDD ledger, and both real-Zoom call captures live only in git-ignored paths of a worktree that retirement step 6 (`git worktree remove`) will delete — the board and ready-queue cite them as evidence · Add to /ship (lane step 6 + retirement step 2): any artifact cited as evidence must first be copied to the main checkout (`docs/` for reports, `Atlas/scripts/out/sessions/` for captures).

5. `agent-memory/` (whole directory) · **evaporation risk** · The single physical copy of the fleet's brain — including every founder `DECISION` line, whose "one home" is cross-cutting.md by design (queue FINDING 2026-07-02) — is git-ignored with no backup or snapshot ritual anywhere; one bad write or disk event erases the decision history that PROGRESS.md only samples at ship time · Add a snapshot step to /fleet-lint (copy the two logs to `docs/archive/agent-memory-snapshots/<date>/`, they're small) or track the logs in a private branch.

### IMPORTANT

6. `agent-memory/BOARD.md:51` · **drift + rule conflict** · Lane I's "next: await supervisor review/merge" has been false since the 07-04 merge, and the ownership law ("edit ONLY your own lane section") means nobody may fix a dormant lane's section — staleness is structurally uncorrectable, not just unnoticed · Amend parallel-work.md: the supervisor may append a dated `[supervisor note]` line inside a lane's section at merge/retire/re-mission.

7. `agent-memory/BOARD.md:36` vs `ready-queue.md:26` vs git · **drift** (seed 1 confirmed) · Board says 18 commits, the queue's READY said 16, `git rev-list` gives 17 exclusive of the base — three hand-typed numbers, none reconciled · Rule: counts on the board come from a pasted git command output or are omitted; ranges (`018d8ad..e2a8851`) over counts.

8. `agent-memory/BOARD.md:57` · **drift** · Lane M's stated blocker "waiting for local-assets/demo-report.pdf" has been false since 2026-07-03 (LAUNCH-KIT step 0 stamps it ✅ done; cross-cutting 14:30 confirms it landed) — the true reason is the staged-launch DECISION (Lane M last) · Supervisor updates the section (see finding 6) to cite the staged-launch decision instead.

9. `agent-memory/state-supervisor.md` · **drift** · Frozen at 2026-07-02: "main = 10f5a74", "AWAITING FOUNDER: design export, demo pdf" (both landed 07-03) — the board asserts "Supervisor session may be restarted fresh anytime — everything lives in files", but a fresh supervisor reading its own state file gets a 5-day-old contradictory world · The supervisor must obey its own "write before walking away" law; add state-file freshness to fleet-lint check 1.

10. `.claude/skills/transcript-review/SKILL.md:40,50-51` · **drift** · Directs auditors to `KNOWN_CORRECTIONS` and `isSafeCorrection` "in `src/lib/transcription.ts` (~line 297)" — grep shows both live only in `src/lib/correction.ts`; the skill also hardcodes `:3000` ("the user runs npm run dev"), contradicting the port law, and speaks pre-fleet vocabulary ("Feature 1", "main agent") · Update the two file pointers, replace :3000 with "your lane port per rules/parallel-work.md", and modernize the framing.

11. `.claude/skills/ship/SKILL.md:58` + `docs/LAUNCH-KIT.md` · **lifecycle gap** · The imminent Lane-I re-mission has no written procedure: intake step 7 says "write the new opening prompt" without saying *where* (LAUNCH-KIT is the prompts' home but is framed as a one-time "morning of 2026-07-02" doc), and both existing lane prompts are already stale (Lane F prompt names branch `feat/frontend-import`/mission complete; Lane I prompt names the delivered chunking mission) — a founder re-pasting from LAUNCH-KIT births a lane with a dead mission and wrong branch · Write the re-mission checklist into /ship (update BOARD MISSION line + lane section + LAUNCH-KIT prompt + archive-and-reset state file + stamp shipped plans) and add "LAUNCH-KIT prompts match board missions" to fleet-lint check 6.

12. `agent-memory/state-ivrit.md:41-62` · **missing feedback loop** · The four lessons graduated on 07-04 (per the supervisor's board section) still read as "graduation candidates for the supervisor" — the supervisor may not edit another lane's state file, so graduation status can never be recorded where the lesson lives; a fresh Lane I session would re-propose or re-litigate them · Allow the supervisor to append a one-line `[graduated → rules/live.md, verify-app, live-test — supervisor 2026-07-04]` marker under a lane's Lessons section (a narrow, dated exception to the ownership rule).

13. `.claude/settings.json:15-19` + `pre-bash-gate.mjs` · **unenforced rules** · The append-only law, lane-section ownership, and the two-log "never Edit" rule have zero enforcement — the deny list covers only `.env*`/`.mcp.json`, the PostToolUse hook only formats, and the bash gate doesn't block `>` truncation of `agent-memory/{cross-cutting,ready-queue}.md` · Add `Edit`/`Write` denies for the two log files in settings.json and a gate check for single-`>` redirects targeting them (append `>>` stays allowed).

14. `docs/LAUNCH-KIT.md:163` vs `.claude/rules/parallel-work.md:2-3` / `rules/live.md:2` · **contradiction** · LAUNCH-KIT says ":8788 claimed **on the board**"; the rules say claim it **in cross-cutting.md** (which is what lanes actually do) · Fix LAUNCH-KIT's house-rules line to say cross-cutting.md.

15. `ready-queue.md:68` + `state-frontend.md:24-25` · **evaporation risk** · The founder gate for Lane F's parity pass is an external claude.ai Artifact URL, and the lane has itself filed that this harness cannot save screenshot files — the entire /verify-app evidence class ("screenshots you actually inspected") lives only in dead sessions and expiring links · Define a durable evidence convention (e.g., `docs/evidence/<branch>/` with the walkthrough sheet HTML checked in) and reference it from verify-app step 9 and the READY-entry format.

16. `docs/VISION.md:72-74` vs `docs/VISION.md:84` vs `PROGRESS.md` era summary · **contradiction/drift** · "Mission 4" means two different things — the roadmap's item 4 is Multi-view, yet Core 1 says "Mission 4 adds: the independent IVRIT pipeline" (still future-tense though it shipped 07-04) and the era summary routes speaker-capture to "Lane I / Mission 4 territory" · Renumber or rename (e.g., "Lane I pipeline" vs "Mission 4 multi-view") and mark the IVRIT second engine as shipped with a PROGRESS pointer.

17. `CLAUDE.md:37` · **drift** · The constitution lists a single live engine (`live-broadcast.mjs`) while rules/live.md's first law is that TWO engines exist sharing :8788 — a session that only loads CLAUDE.md gets the wrong model · Amend the line to "two engines share :8788 — see rules/live.md before touching live".

18. `PROGRESS.md:100` ("Founder action still open: rotate the Supabase token") · **missing feedback loop** · A security action filed 07-02 has no owner, reminder, or closure trace anywhere — PROGRESS is append-only so it will never be marked done · Track open founder actions as a small section on the BOARD (supervisor-owned) so fleet-lint check 1 sweeps them.

### MINOR

19. `agent-memory/ready-queue.md:79,81` + header · **drift** · Lane F invented `CORRECTION` and `AMENDMENT` line types not declared in the header's greppable schema (READY/VERDICT/FINDING) · Add them to the header comment so grep-based tooling stays complete.

20. `agent-memory/cross-cutting.md:15,20,24` · **drift** · Several entries omit the mandated TYPE prefix (bare "Lane I —", "Lane F:"), and line 20 uses `LINT` for a lane's lesson-filing — colliding with the type reserved for supervisor lint output (which made finding 1 harder to detect) · Reserve `LINT` for fleet-lint output; lane lesson-filings are `ALERT` or a new `LESSON` type.

21. `agent-memory/cross-cutting.md` / `ready-queue.md` · **redundancy/bloat** · PROGRESS.md got a compaction law (check 8) but the two append-only logs have no size threshold or compaction/snapshot procedure at all — fleet-lint's timing law mentions "queue pruning" that is defined nowhere · Add a check-8-style threshold for both logs (archive processed eras to docs/archive/, lint-before-recycle already covers safety).

22. `CLAUDE.md:39-49` doc map · **onboarding cost** · `docs/V1-SECURITY-AND-LAUNCH-NOTES.md` and the stray `docs/superpowers/2026-06-09-v2-results.md` (which also escapes check 9's plans/+specs/-only banner sweep) are unindexed — fleet-lint check 5 would flag the former if it ever ran · Index the security notes in the doc map; move or stamp the stray results file.

23. `.claude/skills/live-test/SKILL.md:64-66` · **drift** · Step 5 hardcodes `:3000` (contradicting the skill's own IVRIT-variant note "uses ITS OWN port, not :3000") and sanity-checks a hardcoded finished-call id `live-finish-demo-tamis-2026-06-14` from a June test · Parameterize the port and the expected call id.

24. `.claude/skills/fleet-lint/SKILL.md:52` (check 7) · **missing feedback loop** · Decision-capture auditing "skims recent founder conversations you know of" — a cold supervisor knows of none, so the check silently passes exactly when it's most needed · Reframe check 7 as evidence-based: diff board/PROGRESS mentions of founder verdicts against `grep DECISION cross-cutting.md`.

25. `docs/ENVIRONMENT.md:144` · **drift (cosmetic)** · A stray closing ``` fence ends the file, wrapping nothing · Delete it.

26. Ports (supervisor 3000 / F 3001 / I 3002 / M 3003) maintained by hand in 4 places (`rules/parallel-work.md`, `verify-app` SKILL, all three LAUNCH-KIT prompts, ENVIRONMENT diagram) · **redundancy** · Currently consistent, guaranteed future drift when a lane is re-missioned · Declare rules/parallel-work.md the single source and have the others say "your port per parallel-work.md".

## Top 5 improvements by leverage (auditor's ranking)

1. **Make /fleet-lint fire mechanically** (finding 1): a merge-counter line appended by /ship, with the ship skill instructing "3 merges since last LINT → lint now". The lint would have caught findings 2, 3, 6-10, 16-17, 22 already; everything else on this list decays without it.
2. **Move doc-truth work from retirement-time to merge-time** (findings 2, 3): /ship supervisor steps gain "update ARCHITECTURE.md" and "stamp completed plans/specs" — retirement is too rare an event to carry them.
3. **Durable-evidence law** (findings 4, 15): nothing may be cited from a worktree, a session, or an external URL in a READY entry or board line unless a copy exists under the main checkout (docs/evidence/ or Atlas/scripts/out/sessions/).
4. **Write the re-mission runbook and refresh LAUNCH-KIT prompts as part of it** (finding 11) — the Lane I re-mission is about to exercise exactly this undocumented path, and LAUNCH-KIT is the file a fresh founder-pasted session is born from.
5. **Give the supervisor a narrow, dated write-exception in lane sections and state files** (findings 6, 8, 12), plus deny-rules on the two logs (finding 13) — freshness becomes someone's *permitted* job, and append-only becomes physics instead of etiquette.

## Disposition (supervisor-maintained — update as findings are fixed)

- [ ] Not yet triaged with the founder. Fix plan pending founder review (2026-07-07).
