# Status

**Rewritten, never appended. Intent and next move only — no history, no war stories.**
If you are tempted to add a dated entry, it belongs in `PROGRESS.md` or `docs/case-history/`.
Anything here that has landed gets removed, not struck through.

_Last rewritten: 2026-08-13_

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

**The smart layer** — via the wayfinder map (`.scratch/smart-layer/map.md`; read
`foundations.md` beside it before any ticket; work the frontier via `/wayfinder`). **Every
decision ticket is resolved and founder-approved** — gists + full records live on the map's
Decisions-so-far, not here. Standing artifacts already landed: the ingestion standard
(`docs/INGESTION-STANDARD.md`), the eval gate (`docs/eval/retrieval-eval-set.md`), the
write-authorization law (`docs/DATA-MODEL.md`), cost budgets proposed pending approval in
the spec. Three small execution missions wait outside the map (ticket 13's Answer: cleanup,
policy narrowing, PUT admin-gate). The frontier now: **the spec (10)** — the map's last
open ticket; resolving it reaches the destination and building starts.

**Two deferred calls, filed 2026-08-12 in `DECISIONS.md`, both self-improving-layer, after the
product:** making `app.md`'s meta-laws visible to the promotion ritual, and shrinking `app.md`'s
mechanism-backed laws to pointers at their tests — the set sits at its 9,000-token budget edge,
so the next always-on addition pays for itself by that shrink first.
