# The fleet, retired — 2026-08-12

Everything in this folder is a **verbatim copy**, taken the day the standing agent fleet was
retired (ADR-0001). Nothing here was re-authored, summarised or filtered; each file was copied
and verified byte-identical with `cmp` before the originals stopped being live. This is history:
read it when you want to know how a law was learned, never to know how to work today.

| File | What it was |
|---|---|
| `BOARD.md` | The shared brain — mission block plus one section per standing seat, 179 KB. |
| `cross-cutting.md` | The append-only alerts log, current era at retirement. Earlier eras: `docs/archive/cross-cutting-2026-07-03--2026-08-10.md`. |
| `ready-queue.md` | The append-only review queue and verdicts. Earlier eras: `docs/archive/ready-queue-2026-07-03--2026-08-10.md`. |
| `state-frontend.md` · `state-ivrit.md` · `state-multiview.md` · `state-supervisor.md` | Per-seat working memory: verified facts, lessons, "write before walking away". |
| `DECISIONS.md` | The founder decision index. **This one is still live** — it moved to the repo root and is appended to there. This copy is the state at retirement. |
| `parallel-work.md` | The coordination law: ports, board protocol, engine ownership, shared-surface posts. |
| `LAUNCH-KIT.md` | Worktree setup and the paste-ready opening prompts each seat was born from. |
| `ENVIRONMENT-fleet-era.md` | The map of the fleet environment — its layers, its memory funnel, its lifecycle. |
| `README.md` | The original one-paragraph note that sat in `agent-memory/`. |

## What replaced it

- **Coordination** → `COLLISIONS.md` at the repo root, scoped to a migration, a shared type or a
  design token, and nothing else.
- **Working shape** → `CLAUDE.md` § Working shape. One session, one mission, integrating through
  `main`; a worktree on demand.
- **Vocabulary** → `CONTEXT.md`. "Lane" is retired there, by name, so it cannot be re-invented.
- **The environment's own health** → `src/lib/environment.test.ts` in the ordinary battery, and
  `npm run env:health`.

## `/fleet-lint` — where each check went

The skill was a periodic prose sweep a human had to remember to run, which is precisely how the
thing it was sweeping reached 2.8 MB (the sweep existed; nothing forced it to run). It is retired.
Every check is accounted for below. **"Dropped" means dropped — no mechanism replaced it, and
saying so is the point**, because a check quietly deleted reads afterwards as a check that passed
(ADR-0002, and `rules/app.md` M1).

| # | Check | Disposition |
|---|---|---|
| 1 | Board vs git reality; stale state files | **Dropped — the subject is gone.** There is no board and there are no state files. The staleness it hunted was structurally uncorrectable (a session could not edit another's section), which is one of the reasons ADR-0001 exists. |
| 2 | Queue hygiene — unprocessed entries, missing verdicts | **Dropped — the subject is gone.** Work no longer leaves a branch into a queue; it goes through review to `main` in one motion. |
| 3 | Repeated findings → rules | **Moved to review, and strengthened.** `atlas-reviewer` must now name a finding that has appeared before as a RECURRENCE and point at the law it belongs to. Ticket 03 turns that into a gate: a recurrence does not merge until the law gains a mechanism one tier stronger. Review is where this is cheap — the defect is in front of you and the branch is unmerged. |
| 4 | Un-graduated lessons in state files | **Dropped — the subject is gone.** `/ship` step 9 distills a lesson at the moment it is learned instead of waiting for a sweep to find it. |
| 5 | Doc-vs-code drift; the always-on token budget | **Split.** The budget half is now a TEST (`the always-on set stays inside its token budget`) and is strictly stronger: the old check policed CLAUDE.md at ≲380 words for a month while `rules/app.md` grew to 4,121 words unbudgeted. The `ARCHITECTURE.md` drift half is **dropped with no mechanism** — nothing compares its file paths against the tree. `/ship` step 8 asks for it at merge, which is prose, the weakest tier. |
| 6 | Contradictions between CLAUDE.md, rules, skills, launch kit | **Mostly moot, partly covered.** The port table and the opening prompts that generated most of these contradictions are both gone. What survives is covered by `every document the always-on set points at exists`. Contradictions in *content* between two live documents are **not** checked by anything. |
| 7 | Decision capture — verdicts with no `DECISION` line | **Dropped with no mechanism.** `DECISIONS.md` is now a tracked file at the repo root and `/ship` step 10 files at merge, but nothing detects a decision that was never written down. This is the honest gap: a decision that only ever lived in chat is invisible to any scan, because there is nothing to scan. |
| 8 | PROGRESS.md compaction threshold | **Dropped with no mechanism.** `PROGRESS.md` is on-demand and outside the always-on budget, so its size costs a session nothing. If it becomes unreadable, that is a founder decision, not a lint finding. |
| 9 | Stale plans/specs missing the SHIPPED banner | **Moved to `/ship` step 8** as a fixed merge-time item — a ritual gate that fires every merge instead of a sweep that fires when someone remembers. |
| 10 | Log compaction thresholds | **Moved to `/ship` retirement step 4.** Eviction is bound to merge now (`CONTEXT.md` → *Eviction*). The three hard-won lessons underneath it — measure the era split before promising it, archive a complete verbatim copy and rebuild the live file as an extract, never filter by inferred status — are preserved in `parallel-work.md` and in this folder's copy of the skill's own history. **This ticket followed them:** every file here was copied whole and `cmp`-verified, not extracted. |
| 11 | Snapshot the brain to `docs/archive/` | **Done once, permanently.** The reason it existed — `agent-memory/` was git-ignored, one disk, one copy of every founder decision ever made — is closed: the brain is in git now, in this folder, and `DECISIONS.md` lives at the repo root. |
| — | Trigger law: force a lint every ≥3 merges | **Dropped deliberately.** A counter that schedules a sweep is the shape ADR-0001 rejects. Eviction now happens *at* merge, in the same motion as the merge. |
| — | Meta-review law: a cold external audit every ~10 merges | **Dropped with no mechanism.** The practice was genuinely valuable — the 2026-08-10 cold meta-review found four real defects the author had shipped that day — and nothing schedules it now. Ask for one when the environment feels wrong; that is prose, and it is recorded here as prose so nobody later reads its absence as coverage. |
