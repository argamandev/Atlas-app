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

- [The agent experience — the product magic, end to end](issues/06-agent-experience.md) —
  the V1 experience is decided, in Hebrew: free-text mission, one mission per agent
  (sector/company/both picker), "Bring agent to life" → the agent introduces its plan in
  human vibes and asks to confirm; runs are mission-driven on **Anthropic's Managed Agents**
  (founder decision, tradeoffs accepted; findings/memory-of-record stay in Supabase);
  anchored findings + file artifacts delivered into the agent's two-fidelity chat (side
  panel ↔ full page); visible/editable memory, visible reasoning, the reflection ticker;
  Note Taker = post-call notes in V1, live mid-call notes V2, free-play agents V2. Runtime
  consequences → ticket 08; cost question → ticket 09.
- [The unified context & tool architecture](issues/08-architecture-decision.md) — decided,
  founder-approved 2026-08-12: one brain, two runtimes (chat surfaces call Claude Sonnet 5
  directly from our server; agents run on Managed Agents via custom-tool round-trips); one
  tool registry — resolve/search/lookup-facts/read-source/workspace/MAYA + **web search on
  all four surfaces** (archive-first, visibly distinct citations) + agents-only
  report_finding/update_memory + sandbox built-ins; citations **verified at write**
  everywhere with drift rendering and real per-line timestamps; pgvector + shared-corpus
  chunk/alias/facts tables, personal agent tables with append-only turns; rewrite order
  Chat → Ask Atlas → Workspace (eval-gated) with agents in parallel; Anthropic-side scratch
  deleted post-run. Full record in the ticket's Answer.
- [Cost budgets — numbers, not vibes](issues/09-cost-budgets.md) — priced at verified public
  list rates (no account yet): a chat answer ≈ $0.04–0.06, an agent run ≈ $0.39–0.50 (Hebrew
  +30% included), ingestion negligible (High MAYA backfill ≈ $67 embeddings), ≈ $32/fund/mo
  typical (5/30/100 funds ≈ $160/$960/$3,200); budgets PROPOSED (answer ≤$0.05/$0.15 cap,
  run ≤$0.50/$1.00 cap, ~$35/fund/mo) — founder veto/approve rides with the spec (ticket 10);
  caching is the #1 lever (3–4×); Start-tier $500/mo cap binds at ~15 funds → ticket 11.
  Full fact sheet: `research/09-cost-budgets.md`.
- [Anthropic account + API key for Atlas](issues/11-anthropic-account.md) — key live and
  verified with a metered Sonnet-5 call (in `.env.local`; Railway waits for the first
  Claude ship); org tier of record: **Evaluation** — the Start→Build→Scale path is still
  ahead, 80K OTPM is the prototyping constraint; Hebrew measured at **1.43 chars/token**
  (~47% over the `plan.ts` estimator, more than research/09's +30%) — ticket 10 recomputes
  costs. Fact sheet: `research/11-key-verification.md`.
- [Speaker-edit authorization — corpus curation or personal write?](issues/12-speaker-edit-authorization.md) —
  founder 2026-08-13: speaker attribution is corpus curation, **admin-only** (both PATCH
  routes get `requireAdmin`); renames legitimately propagate into all users' saved quotes;
  the general law is filed in `docs/DATA-MODEL.md` (shared-corpus writes = admin curation,
  personal rows = owner-only, curation→derived-data propagation the one exception); the
  live hole is fixed now as its own small mission, with non-admin→403 route tests.
- [Timlul leftovers + iron rule #1 — founder go/no-go](issues/13-leftovers-go-no-go.md) —
  all-go 2026-08-13: drop the 5 empty tables, delete orphaned storage + dormant correction
  code, Zim hearing exported-then-deleted (ZIM isn't a TASE issuer; re-attribution impossible);
  iron rule #1 reworded to "Supabase is Atlas PRODUCTION" (mechanisms unchanged, done);
  `profiles`/`access_requests` policy narrowing scheduled; PUT `/api/transcripts/[id]` ruled
  admin-only (curation, closing the open-findings question). Execution = three small missions
  listed in the Answer, outside this map.
- [What does MAYA already provide structured?](issues/14-maya-structured-data.md) — more than
  expected: every Israeli-track quarterly/annual report carries a public `.xbrl` (ISA ת930) with
  the 26 core financials (revenue→net profit, EPS, BS/CF totals, exact periods, ILS) verified by
  live parse; publication date is on every `by-issuer` row (one additive column closes the gap);
  EBITDA/segments/non-GAAP stay PDF-only (the residual extraction scope), dividends pending a
  corporate-actions portal-spec read; structured-facts V1 = XBRL parser in `ingestFiling()`, no
  LLM. Fact sheet: `research/14-maya-structured-data.md`.

- [Discovery eval cases — broad questions with known leads](issues/15-discovery-eval-cases.md) —
  two founder-worded discovery cases live as class G in the eval set (מילואים costs, AI),
  leads anchor-verified, `mode: "discovery"` scoring in the harness (pass = all lead
  companies in the diversified top-5); measured: the decided C-gemini design passes both,
  the dense-only and OpenAI designs each fail a case — search mode's quality is now
  gated, not assumed.

## Not yet specified

- When and how user memory (cross-surface) joins agent memory.
- Webinars as a corpus source.

<!-- Graduated 2026-08-12 on ticket 08's resolution: the ingestion standard → ticket 16;
     MAYA filings at scale → ticket 17. The migration-path item was DECIDED inside ticket 08
     (Chat → Ask Atlas → Workspace, eval-gated, agents in parallel). -->

## Out of scope

- A full codebase audit — this map carries only the smart-layer-scoped foundation review
  (ticket 03). A general audit is its own later effort.
- Building user memory in V1 — design for it, don't build it (founding decision).
- A developer-facing public API for funds — superseded 2026-08-12: funds create agents
  in-product, not via API.
- The self-improving layer (app.md meta-laws, law shrinking) — deferred by the founder
  2026-08-12, after the product.
