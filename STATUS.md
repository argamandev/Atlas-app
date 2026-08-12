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

**The smart layer** — chat, workspace and agents as one piece of work, via the wayfinder map
(`.scratch/smart-layer/map.md`; read `foundations.md` beside it before any ticket; work the
frontier via `/wayfinder`). The three big decisions are made, founder-approved, gists on the
map: **retrieval** (ticket 07 — hybrid + company scoping on `gemini-embedding-001`, eval gate
at `scripts/retrieval-eval/`), **the agent experience** (ticket 06 — mission-driven agents on
Anthropic's Managed Agents, Hebrew-first), and **the architecture** (ticket 08 — one brain,
two runtimes; one tool registry with web search on every surface; citations verified at
write; rewrite order Chat → Ask Atlas → Workspace, agents in parallel). The frontier now:
**cost budgets** (09, unblocked — real pricing wants the Anthropic account, ticket 11); the
**ingestion standard** (16) and **MAYA filings at scale** (17), both graduated from the fog;
founder tickets 12 (speaker-edit authz), 13 (leftovers go/no-go), 11 (Anthropic account);
task 15 (discovery eval cases). The spec (ticket 10) waits on 09/16/17.

**Two deferred calls, filed 2026-08-12 in `DECISIONS.md`, both belonging to the self-improving
layer rather than to product work:** making `app.md`'s four meta-laws visible to the promotion
ritual, and shrinking `app.md` by cutting its 10 mechanism-backed laws to pointers at their tests.
Founder's sequencing — the product comes first. Still unspent: read the five always-on documents
end to end and time it; over ten minutes means the set regrew whatever the budget says.
