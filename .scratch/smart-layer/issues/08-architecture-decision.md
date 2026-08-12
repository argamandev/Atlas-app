# The unified context & tool architecture

Type: grilling
Status: open
Blocked by: 01, 02, 03

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
