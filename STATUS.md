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

**The smart layer** — chat, workspace and agents as one piece of work. The wayfinder map is
charted: `.scratch/smart-layer/map.md`, ten tickets toward an architecture spec + build
sequence. Read `foundations.md` beside it before any ticket; work the frontier via
`/wayfinder`.

The workflow migration is done and merged (`chore/workflow-reset`, three tickets). One session at
a time with worktrees on demand (ADR-0001); a lesson that recurs gains a mechanism instead of a
fourth restatement (ADR-0002). `npm run ship:gate` checks what a merge owes and `git merge` onto
main runs it, so it does not depend on anyone reading `/ship`.

**Two deferred calls, filed 2026-08-12 in `DECISIONS.md`, both belonging to the self-improving
layer rather than to product work:** making `app.md`'s four meta-laws visible to the promotion
ritual, and shrinking `app.md` by cutting its 10 mechanism-backed laws to pointers at their tests.
Founder's sequencing — the product comes first. Still unspent: read the five always-on documents
end to end and time it; over ten minutes means the set regrew whatever the budget says.
