# The unified context & tool architecture

Type: grilling
Status: open
Blocked by: 01, 02, 03, 07 (all resolved — this ticket is on the frontier)

## Question

The one architecture serving all four front doors. Decide: the tool-calling architecture
(which tools exist — resolve-company, search-corpus, fetch-filing, read-workspace, …); how
each surface grounds (what Ask Atlas injects on a company page vs a live call vs a
workspace); the citations contract end to end; how the new standard replaces `/api/chat`'s
one-transcript stuffing and the workspace planner's term-overlap scoring; where retrieval
runs; what tables (embeddings/chunks) are added under `docs/DATA-MODEL.md`'s shared-corpus
law. Constrained by: citations-as-law, cost-as-design-constraint, one brain (Claude), and
the foundation review's findings (ticket 03). The intake bug is the acceptance test: a
design where a mid-conversation correction cannot reach the resolver is wrong by
construction.

**Settled inputs from ticket 07 (2026-08-12, founder-approved):** the retrieval shape is
decided — hybrid + deterministic prefix + company scoping on `gemini-embedding-001`, scope-
size router (see `research/07-retrieval-eval-results.md`). New constraints from the founder's
amendments: Chat carries a **visible search mode** (deterministic @-mention scoping, leads-
style per-company-diversified answers — never a hidden classifier guess); a **structured-
facts lookup layer** for filings' known numerics (feasibility via ticket 14); the alias
table is the first build item.
