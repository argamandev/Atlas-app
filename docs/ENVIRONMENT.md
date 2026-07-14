# The Atlas Smart Environment — a letter to my future self

> **Read this when you need to understand the machine you're running inside.** Built 2026-07-02
> (Mission 2 + same-day audit fixes), founder-approved, reviewer-audited. This is the WHY and
> the SHAPE; the live state is always in `agent-memory/`, the laws in `.claude/`, the history
> in `PROGRESS.md`. This environment is designed to compound — expect it to be sharper than
> described here; never assume it's dumber.

---

## 1. The whole machine on one page

```
                                 ┌─────────────────────┐
                                 │   SAGI (founder)     │
                                 │ vision · briefs ·    │
                                 │ milestone testing    │
                                 └─────┬──────▲────────┘
                            briefs/assets│      │milestones · decisions
                                         ▼      │
                    ┌────────────────────────────────────────┐
                    │   SUPERVISOR — "the Brain" (port 3000)  │
                    │  main checkout · the only main-pusher   │
                    │ ─ holds the MISSION (north star)        │
                    │ ─ review gate: atlas-reviewer + self    │
                    │ ─ merges small & often, runs battery    │
                    │ ─ distills lessons → skills/rules       │
                    │ ─ retires features, intakes new ones    │
                    └────────┬───────────────────▲────────────┘
                             │ assignments        │ ready-queue entries
                             ▼                    │ + board telemetry
        ┌────────────────────────────────────────────────────────┐
        │       agent-memory/  — THE SHARED BRAIN (git-ignored,   │
        │        one physical copy, absolute path from anywhere)  │
        │  BOARD.md   MISSION + lane sections (owner-scoped)      │
        │  cross-cutting.md  append-only alerts (schema/tokens…)  │
        │  ready-queue.md    append-only review queue + verdicts  │
        │  state-<lane>.md   private working memory per session   │
        └───▲──────────────────▲──────────────────▲───────────────┘
            │                  │                  │
   ┌────────┴───────┐ ┌────────┴───────┐ ┌────────┴───────┐
   │ LANE F (3001)  │ │ LANE I (3002)  │ │ LANE M (3003)  │   ← worktrees =
   │ frontend-import│ │ ivrit-pipeline │ │ multiview-pdf  │     isolated copies,
   │ feat/… branch  │ │ feat/… branch  │ │ feat/… branch  │     shared history
   └───────┬────────┘ └───────┬────────┘ └───────┬────────┘
           │ small verified pieces (/verify-app → /ship)
           ▼
   ┌──────────────────────────────────────────────────────┐
   │                    git main                           │
   │   always working · always pushed · --no-ff merges     │
   │   every commit passed: tests + tsc + build + review   │
   └──────────────────────────────────────────────────────┘

   ENFORCEMENT (deterministic, can't be talked past — .claude/hooks/):
   pre-bash-gate.mjs  → blocks destructive SQL (Bash AND Supabase MCP doors),
                        unsafe recursive deletes, .env access, force-push,
                        lane-pushes-to-main   [fire-test suite: node
                        .claude/hooks/gate-tests.mjs — re-run + EXTEND on every hook change]
   post-edit-verify.mjs → prettier + incremental tsc after EVERY edit
```

## 2. The layers (what lives where, and why)

| Layer | Files | Nature |
|---|---|---|
| **Constitution** | `CLAUDE.md` (kept under ~500 tokens — /fleet-lint checks) | Standing facts only; auto-read every session; points everywhere else |
| **Laws** | `.claude/rules/` — parallel-work · db · live · app | Scoped truths, read before touching their area |
| **Enforcement** | `.claude/hooks/` — 2 sharp hooks | Physics, not suggestions; exit 2 blocks |
| **Procedures** | `.claude/skills/` — verify-app · ship · fleet-lint · live-test · transcript-review | The reusable, *accumulating* unit — lessons graduate INTO these |
| **Fresh eyes** | `.claude/agents/atlas-reviewer.md` | Independent grader on every merge |
| **Working memory** | `agent-memory/` (git-ignored) | Real-time, shared, recycled per feature |
| **Permanent memory** | `PROGRESS.md` · `docs/VISION.md` · `ARCHITECTURE.md` · specs/plans | Git-tracked history and maps |
| **Ops manual** | `docs/LAUNCH-KIT.md` | Worktree commands + the 3 lane opening prompts |

## 3. The memory funnel (why nothing bloats)

```
 minutes   BOARD + logs      huge churn, git-ignored, pruned/recycled
    ↓      (what mattered this session)
 session   state-<lane>.md   verified facts + lessons, "write before walking away"
    ↓      (only lessons that GENERALIZE — via supervisor, at ship)
 forever   skills / rules    procedures & laws — every future session born knowing
    ↓      (only permanent standing facts — rare)
 forever   CLAUDE.md         stays ~1 page, forever
```
Plus: every ship appends one compact entry to `PROGRESS.md` (the story), reviewer findings and
founder decisions persist as greppable `FINDING`/`DECISION` log lines (they never evaporate
into chat), nontrivial answers get FILED into docs (not spoken and lost), and **/fleet-lint**
sweeps the whole memory every few merges for drift, contradictions, and un-graduated lessons.
Knowledge climbs; noise dies at the bottom.

## 4. The feature lifecycle (lanes are SEATS, not features)

```
  founder brief ─→ brainstorm+spec ─→ opening prompt ─→ lane builds
       ▲                                                   │ small pieces:
       │                                                   ▼
  RETIRE the seat ◄── milestone founder-tested ◄── /verify-app → /ship →
  distill → PROGRESS →                             reviewer gate → merge
  archive state → reset board                          (repeat)
       │
       └─→ next feature sits down in the same seat — same rituals, sharper skills
```
The retirement ritual is codified in `/ship` ("Feature retirement" section). The machine is
feature-agnostic; the compounding survives every rotation.

## 5. The self-improvement loop (installed, running)

**Catch → Record → Distill → Inherit.** Hooks and the reviewer catch; state files record;
`/ship` distills into skills/rules; the next session inherits. Proof it works, from day one:
the environment's own audit found flaws → fixes shipped same day → the reviewer's first review
(of the branch creating it) found 5 more → also fixed pre-merge → those lessons are now
permanent. The gate blocked its own author twice during construction. The machine already
improves itself.

## 6. THE BIGGER PICTURE — this environment IS the product's blueprint

Founder's strategic insight (2026-07-02): the architecture we run for *development* maps 1:1
onto Atlas the *product*:

| Development environment (now) | Atlas product (future) |
|---|---|
| Supervisor brain — mission, gates, distills | **Atlas itself** — supervising intelligence over users' work |
| 3 lane sessions in worktrees | **Agent SDK sessions** running per-user, per-task (transcripts, watchlists, research) |
| BOARD + state files | Per-user / per-company live state |
| Skills/rules that accumulate lessons | Atlas improving its own transcripts, UX flows, agent workflows from every correction |
| The reviewer gate | Quality gates on agent outputs before they reach the user |
| The memory funnel | Per-company knowledge wiki: compiled once, kept current, contradictions flagged (Karpathy's LLM-wiki pattern) |
| Feature retirement/intake | Agent task lifecycle |

**Therefore: every pattern added here must pass the dual test — does it compound for building
Atlas AND for Atlas itself?** When Workspace/Agents development starts, this file + the
harness are the reference implementation, not just tooling.

## 7. How to resume (any future session)

1. You auto-read `CLAUDE.md` → it sends you to the board.
2. Read `agent-memory/BOARD.md` (+ the two logs) → you know the mission, every lane, what's
   in flight.
3. Your role comes from your opening prompt (lane) or "you are the supervisor" (main checkout).
4. Work by the rituals: small steps · `/verify-app` before "done" · `/ship` to finish ·
   write before walking away.
5. Improve the machine as you go: a lesson that generalizes belongs in a skill, not a chat.
