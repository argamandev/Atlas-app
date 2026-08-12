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

- [Retrieval methods for a Hebrew financial corpus](issues/01-retrieval-methods-research.md) —
  founder's hypothesis confirmed with refinements: page-as-chunk for filings, ~200–400-token
  line-windows on speaker seams for transcripts (anchors preserved), don't embed MAYA data
  (build the alias table instead), deterministic context prefixes before paying for LLM
  contextualization, hybrid search pending the Hebrew-lexical measurement; three candidate
  designs A/B/C ready for the eval (07). Full findings: `research/01-retrieval-methods.md`.
- [Claude Agent SDK as the engine for fund-created agents](issues/02-agent-sdk-research.md) —
  the SDK fits: separate Railway worker (subprocess-per-session), in-process MCP tools with
  tenancy enforced in our handlers, durable memory as Supabase state, findings only through
  a `report_finding` tool that verifies anchors (fabricated citations unrepresentable),
  ~$0.35/run on Sonnet with mandatory caching. Full fact sheet: `research/02-agent-sdk.md`.
- [Foundation review — is the ground safe to build on?](issues/03-foundation-review.md) —
  yes, if the right templates are copied: auth primitives, ownership migrations 015/016/017
  and the workspace-chat pattern (RLS-load-bearing, honest degradation) are the standards;
  the anchor quartet is inherited as SHAPE only — nothing verifies anchors at write, drift
  detection is unwired, line ids renumber, the "minute" doesn't exist. `/api/chat` persists
  partial/sentinel answers as complete (pre-rewrite threads are suspect data); fencing must
  close before any prompt gains tools; retrieval's real failure is selection policy + query
  construction, and vectors are a new subsystem, not a scorer swap; agents need append-only
  turns, not the whole-jsonb thread PUT. Live authz defect in speaker edits → ticket 12.
  Full reports: `research/03-foundation-review.md`.
- [Corpus cleanup — only what serves Atlas](issues/04-corpus-cleanup.md) — the 55 unattributed
  Timlul transcripts are exported (verified, `Desktop\Atlas-cold-storage\`) and deleted; 5
  attributed remain, app verified clean eyes-on, zero collateral. Leftovers inventoried into a
  per-class go/no-go menu for the founder (ticket 13); iron rule #1's premise is stale — the DB
  is no longer shared with anything, it IS Atlas production.

- [Retrieval eval — measured, not assumed](issues/07-retrieval-eval.md) — founder-approved
  2026-08-12: hybrid + deterministic metadata prefix + company scoping on
  `gemini-embedding-001` @1536, routed by scope size; OpenAI embeddings ruled out on
  measured Hebrew quality (2/15 vs 7/15). His amendments folded in: structured-facts lookup
  for filings' known numerics (→ ticket 14), @company mentions as scoping UX, and a visible
  Chat search mode for market-wide discovery with per-company-diversified leads answers
  (→ tickets 08/15). Harness kept at `scripts/retrieval-eval/` — the standing quality gate.
  Full record: `research/07-retrieval-eval-results.md`.
- [The eval set — real questions with known answers](issues/05-eval-set.md) — approved:
  18 anchored cases at `docs/eval/retrieval-eval-set.md` (the standing quality gate that
  outlives this map); two MUST-PASS gates (intake regression, בז"א alias), "cannot ground →
  say so" policy, mis-attributed content never speaks for the company; six corpus warts
  W1–W6 documented, incl. the Zim hearing carrying Tigbur's `company_id` (→ ticket 13) and
  all-zero timestamps (line id is the only citation anchor). Ticket 07 unblocked.

## Not yet specified

- How and when MAYA filings join the searchable corpus at scale — Hebrew PDF extraction
  pipeline, ingestion triggers, freshness (no publication-date column exists today).
  Sharpens after the MAYA structured-data facts (ticket 14) and the architecture (08).
- The ingestion standard: how a new transcript/document is born attributed, chunked,
  embedded, anchored — now explicitly including dedup at birth (the `PyuMxe88e8g_live`
  lesson) and the structured-facts extraction step if ticket 14 makes it ours to build.
  Depends on the architecture ticket (08).
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
