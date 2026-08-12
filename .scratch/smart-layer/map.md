# Smart Layer — Wayfinder Map

Label: wayfinder:map

## Destination

An architecture spec for the smart layer — grounding, retrieval, memory, tools and agents
serving Chat, Workspace chat, Ask Atlas and Agents — plus a build sequence of small shippable
slices. The map is done when building can start with zero fog: every big decision resolved,
cost budgets approved, and the first slice fully specified.

## Notes

- Domain: institutional research over the Israeli public market. Corpus = call transcripts +
  MAYA company data + ingested filings. The founder is a non-engineer — work HITL tickets in
  plain language; file his decisions in `DECISIONS.md`, quoted.
- Skills to consult per ticket: grilling + domain-modeling (HITL tickets), research (AFK
  research tickets), prototype (the eval harness, ticket 07).
- **Read `foundations.md` (same folder) before any ticket** — the 2026-08-12 codebase survey
  of the ground the smart layer sits on.
- New smart-layer vocabulary is NOT yet promoted to `CONTEXT.md` — the always-on set is 189
  under its budget, so terms go to the glossary only when the spec settles them, as one
  deliberate edit through the env-manifest gate.
- Founding decisions (2026-08-12 grilling; filed in `DECISIONS.md`):
  - The destination is a SPEC, not a build. Building happens in normal sessions afterward.
  - One brain: Claude powers every reasoning surface (Chat, Workspace chat, Ask Atlas,
    Agents) with one tool-calling architecture; Gemini/IVRIT/Whisper keep transcription
    and polish.
  - The retrieval method is decided by research + a measured eval on our own Hebrew corpus,
    never by opinion. The founder's RAG research is the hypothesis menu, not the answer.
  - Citations are a founding law: every claim points at its source (call · minute · line /
    filing · page); an answer that cannot be grounded says so visibly.
  - Memory V1 = agent memory. Storage designed so user memory can join later without rebuild.
  - Timlul is dead: database and codebase keep only what serves Atlas. The 55 unattributed
    transcripts are exported then deleted; every new transcript is born attributed.
  - The magic is fund-created agents in the Agents page (name, context, mission, assignment
    to company/call/sector/report/workspace). In-product surface — no developer API.
  - Cost budgets are numbers in the spec, derived by research, approved by the founder.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

(none yet — tickets are open)

## Not yet specified

- How and when MAYA filings join the searchable corpus at scale — Hebrew PDF extraction
  pipeline, ingestion triggers, freshness (no publication-date column exists today).
  Sharpens after the retrieval decision (tickets 01/07/08).
- The ingestion standard: how a new transcript/document is born attributed, chunked,
  embedded, anchored. Depends on the architecture ticket (08).
- What agents do on LIVE calls (note-taking mid-call) and file-working abilities (Excel,
  cross-referencing). Sharpens after the agent-experience grilling (06).
- When and how user memory (cross-surface) joins agent memory.
- Migration path: how the four existing front doors move onto the new standard without
  breaking what works today.
- Webinars as a corpus source.

## Out of scope

- A full codebase audit — this map carries only the smart-layer-scoped foundation review
  (ticket 03). A general audit is its own later effort.
- Building user memory in V1 — design for it, don't build it (founding decision).
- A developer-facing public API for funds — superseded 2026-08-12: funds create agents
  in-product, not via API.
- The self-improving layer (app.md meta-laws, law shrinking) — deferred by the founder
  2026-08-12, after the product.
