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
`foundations.md` beside it before any ticket; work the frontier via `/wayfinder`). The big
decisions are made, founder-approved, gists + full records on the map: retrieval (07), agent
experience (06), architecture (08), cost budgets proposed (09), Anthropic key live (11),
speaker edits = admin-only corpus curation (12 — the write-authorization law is in
`docs/DATA-MODEL.md`), Timlul leftovers all-go (13 — iron rule #1 now reads "Atlas
PRODUCTION"; three small execution missions listed in its Answer: cleanup, policy
narrowing, PUT admin-gate). The frontier now: task 15 (discovery eval cases), the
**ingestion standard** (16) and **MAYA filings at scale** (17). The spec (ticket 10)
waits on 16/17 and closes the map.

**Two deferred calls, filed 2026-08-12 in `DECISIONS.md`, both self-improving-layer, after the
product:** making `app.md`'s meta-laws visible to the promotion ritual, and shrinking `app.md`'s
mechanism-backed laws to pointers at their tests — the set sits at its 9,000-token budget edge,
so the next always-on addition pays for itself by that shrink first.
