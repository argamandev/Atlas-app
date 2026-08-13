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
| Agents | **Stub.** The page and `src/lib/agents/data.ts` exist; no machinery behind them. |

## What is being worked on right now — BUILDING the smart layer

The spec of record is `docs/SMART-LAYER-SPEC.md` — read it before any smart-layer work. Build
tickets: `.scratch/smart-layer-build/issues/` (14 slices, `Blocked by:` edges; take the
lowest-numbered unblocked ticket, one per session, branch per slice, `/ship`). Standing gates:
`docs/INGESTION-STANDARD.md`, the eval harness (`scripts/retrieval-eval/` vs
`docs/eval/retrieval-eval-set.md`), approved cost budgets (spec §5).

**Slices A1 (foundations migrations) and A2 (company resolver) are LIVE in production** —
pgvector, `document_chunks`, `filing_facts`, `publication_date`, transcripts identity, and
`company_aliases` seeded (246 rows / 234 companies; `resolveCompany()` green offline incl.
the בז"א MUST-PASS). Standing consequences: an unattributed transcript insert FAILS at the
DB (the born-attributed law; A3 builds the single birth door, A4 VALIDATEs the check), and
user language now reaches the `company_id` retrieval filter. **Next up: slice A3 — birth
sequence** (one shared chunker, single transcript birth door, line-timestamp alignment,
XBRL facts + publication date in `ingestFiling()`, global MAYA limiter).

Three small execution missions also open (map ticket 13): leftover cleanup,
`profiles`/`access_requests` policy narrowing, PUT admin-gate.

**Two deferred calls, filed 2026-08-12 in `DECISIONS.md`, both self-improving-layer, after the
product:** making `app.md`'s meta-laws visible to the promotion ritual (its Verified-line
shape is gate-covered), and shrinking `app.md`'s mechanism-backed laws to pointers at their tests —
the set sits at its 9,000-token budget edge, so the next always-on addition pays for itself by
that shrink first.
