# Status

**Rewritten, never appended. Intent and next move only — no history, no war stories.**
If you are tempted to add a dated entry, it belongs in `PROGRESS.md` or `docs/case-history/`.
Anything here that has landed gets removed, not struck through.

_Last rewritten: 2026-08-12_

## Where the product is

Live on Railway at `www.timlul-ai.com` since 2026-08-08. A mistake on `main` is no longer local.

| Surface | State |
| --- | --- |
| Live calls | Works, presents well. Two engines (Recall / IVRIT) share `:8788`. |
| Companies | Works. MAYA connected; sector + description populated for 234/234 companies. |
| Chat / Ask Atlas | Works across every surface. |
| Workspace | Works — intake, tables, chat over the document set. |
| Agents | **Stub.** The page and `src/lib/agents/data.ts` exist; there is no agent machinery behind them. |

## What's next — the smart layer

Make chat, workspace and agents *good*, not merely present. These three are one piece of work,
not three: the same grounding, memory and retrieval serve all of them, and building them
separately is how you get three mediocre versions of the same thing.

Agents is the surface that does not exist yet, so it is the one that decides the shape.

## What is being worked on right now

**Migrating the workflow itself** — branch `chore/workflow-reset`.

The 4-lane agent fleet is being retired in favour of one session at a time, with worktrees
created on demand (ADR-0001), and lessons that recur must gain an enforcement mechanism rather
than a fourth restatement (ADR-0002). Product work resumes when this lands.

Not yet started: the smart layer above. Do not begin it on this branch.
