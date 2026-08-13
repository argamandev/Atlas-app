# The unified context & tool architecture

Type: grilling
Status: resolved (2026-08-12)
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

**Founder directive (2026-08-12, ticket 06 postscript):** agents are handed the FULL
toolset their mission needs — "full access over completing his task (in order to recive
the right context etc etc) we can also create tools for excels and more" — i.e. the tool
list this ticket decides is a floor for agent capability, not a cage; sandbox built-ins
(files/code/spreadsheets) stay enabled for agents alongside our Atlas data tools.

**Settled inputs from ticket 06 (2026-08-12, founder-decided):** the agent runtime is
**Anthropic's Managed Agents**, not the self-hosted worker sketched in ticket 02's proposed
shape — that section of `research/02-agent-sdk.md` is superseded as a runtime (its tool/
tenancy/memory/cost analysis stands). The architecture must decide: how our Supabase-backed
tools reach a hosted session (custom-tool event round-trips vs tunneled MCP — tunnels are
research preview); the Anthropic-side deletion policy (sessions/memory stores are retained
server-side until we delete; findings/memory-of-record live in Supabase); where artifacts
(files produced in the sandbox) are stored so they render in the agent's chat; how the
reasoning stream reaches the UI (visible thinking + the reflection ticker); per-run budget
caps; and Hebrew as the agent-facing language end to end.

**Settled inputs from ticket 07 (2026-08-12, founder-approved):** the retrieval shape is
decided — hybrid + deterministic prefix + company scoping on `gemini-embedding-001`, scope-
size router (see `research/07-retrieval-eval-results.md`). New constraints from the founder's
amendments: Chat carries a **visible search mode** (deterministic @-mention scoping, leads-
style per-company-diversified answers — never a hidden classifier guess); a **structured-
facts lookup layer** for filings' known numerics (feasibility via ticket 14); the alias
table is the first build item.

## Answer

Resolved 2026-08-12 over two grilling rounds; founder decisions quoted in `DECISIONS.md`
(three entries dated 2026-08-12, prefixed "ticket 08"). The architecture:

### 1 · One brain, two runtimes, one toolset

- **Interactive surfaces** (Chat, Ask Atlas, workspace chat) call the Claude Messages API
  **directly from our Next.js server**, streaming, with the tool loop running in our route —
  no sandbox, no session-hour fee, chat-grade latency.
- **Agents** run on **Anthropic Managed Agents** (settled in ticket 06). Our Supabase-backed
  tools reach hosted sessions via **custom-tool event round-trips** (founder-approved over
  tunneled MCP, which stays research-preview): the agent emits `agent.custom_tool_use`, our
  backend executes with tenancy enforced in the handler, returns the result event. Sandbox
  built-ins (files, code, spreadsheets) stay enabled for agents — the founder's "tools for
  excels and more".
- **One tool registry, two drivers.** Tools are defined once (schema + handler over
  `src/lib/db/*`), exposed in-process to the chat loop and via the event webhook to Managed
  Agents. Model default **Sonnet 5** everywhere; Haiku only for mechanical internal steps,
  never for answering the user; per-agent step-up allowed later. Exact monthly numbers →
  ticket 09.

### 2 · The V1 tool roster (founder-approved; the floor of agent capability, not a cage)

`resolve_company` (alias table; callable EVERY turn — the intake-bug fix by construction) ·
`search_corpus` (the measured hybrid, company/sector-scoped or market-wide-diversified;
returns windows WITH anchors) · `lookup_facts` (XBRL structured facts per ticket 14) ·
`read_source` (open a transcript window / filing page by anchor) · `read_workspace` (only
when assigned one) · `list_disclosures` (MAYA, rate-limit aware) · `web_search` (**all four
surfaces** — founder overrule — under the archive-first instruction) · agents-only:
`report_finding` (the single door for findings; verifies the quote exists in the cited
source before saving — an unanchorable finding cannot exist) and `update_memory`.

Laws at the tool boundary: identity is never model-supplied — handlers close over
`{userId, scope}` from the run/request; every tool result quoting a document is fenced
(`<<<ATLAS-SOURCE>>>`) **with titles and labels defanged** — the slice-2 BLOCKER closes
before any prompt gains tools; tool errors are visible (`isError` + what to try), never
silent empties.

### 3 · Grounding per surface (founder-approved recipe)

- **Chat**: starts blank. `@company` → pinpoint mode scoped to it (scope-size router: small
  scope → stuff whole docs; big → top-k retrieval). No resolvable company → **search mode**,
  visibly shown, one tap to switch, answers as leads grouped per company (per-company
  diversified top-k). Mode is deterministic, never a hidden classifier guess.
- **Ask Atlas on a live call / transcript**: that call injected whole (6–18K tokens), tools
  for anything beyond.
- **Ask Atlas on a company page**: scoped to that company — calls, filings, MAYA facts via
  tools.
- **Workspace chat**: scoped to the shelf + `read_workspace`.
- **Everywhere**: honesty machinery — truncated/omitted/unanswerable states visible, in
  Hebrew; "cannot ground → say so" (eval-set policy).

### 4 · The citations contract, end to end (founder-approved as law)

- **Corpus anchor** points directly at corpus rows — `transcript_id` + line range, or
  `document_id` + page — plus `source_label` and **`source_quote` snapshot**. (The workspace
  quartet's SHAPE is inherited; its workspace-item indirection is not — a corpus-grounded
  claim must not die when a user tidies a shelf.)
- **Verified at write, on every surface**: the quote must exist in the cited source or the
  claim is rejected and the model told to fix it. The slice-4 BLOCKERs (no write-time
  verification, unwired drift detection) are closed by construction at this choke point.
- **Drift renders honestly**: re-processed transcripts show "drifted", never a plausible lie.
- **The minute becomes real**: the pipeline starts emitting real per-line timestamps
  (today all `00:00:00`), so citations read "Q1 call · 14:02 · L0031" per the founding law.
- **Web citations**: link + page title + the exact quote **verified against the page text
  fetched at that moment**; later change renders "changed since cited". Web claims render
  visibly distinct from archive anchors, so a fund always sees which parts of an answer
  stand on the verified archive vs the open web.

### 5 · Retrieval subsystem and new tables

- **pgvector** installed via the DDL gate (file → review → COLLISIONS.md → apply) — now
  justified by measurement (ticket 07).
- **Shared corpus** (no `user_id`; copy the `20260714_012`/`20260801_014` RLS shape):
  `company_aliases` (the first build item), `document_chunks` (chunk identity + anchor
  columns + verbatim `content` separate from prefixed `embedding_input` + embedding
  @1536), `filing_facts` (XBRL numerics, ticket 14), plus the additive publication-date
  column on `company_documents`. `transcripts.id` is TEXT — FKs typed accordingly.
- **Personal layer** (copy migrations 015/016 verbatim — FK to `auth.users`, RLS both
  sides, composite child FKs, `user_id` index): `agents`, `agent_runs`, `agent_findings`
  (anchored), `agent_memory`, and **append-only turn rows for agent chat** — never the
  whole-jsonb thread PUT (slice-2 MAJOR). Artifacts → owner-scoped Supabase Storage bucket,
  rendered in the agent's chat.
- Retrieval executes in the Next.js server at query time (hybrid RRF over pgvector + the
  Postgres lexical channel, deterministic metadata prefix); chunks are written at ingestion
  — born attributed, deduped at birth, timestamped.

### 6 · The chat rewrite and migration order (founder-approved)

A new unified chat backend replaces `/api/chat` — the slice-1 BLOCKERs are fixed by
construction: errors and degradation move **out-of-band** (no in-band Hebrew sentinel, no
partial-persisted-as-complete, DB failure ≠ "no transcripts"), source fencing from day one,
`streamChat`'s two callers updated in the same change. Order: **(1) Chat** (debuts search
mode + @mentions) → **(2) Ask Atlas surfaces** → **(3) Workspace chat** — only once the new
retrieval measurably beats the planner on the eval set → **(4) Agents built in parallel**
(they replace nothing). Each step ships alone; `main` stays working.

### 7 · Managed Agents integration specifics

- **Deletion policy (founder-approved)**: the Anthropic-side session and memory store are
  deleted as soon as a run completes and its findings/artifacts land in Supabase; agent
  memory is re-created from Supabase each run. Nothing of a fund's research accumulates
  outside our database.
- **Reasoning stream**: run events (thinking, tool use, progress) are forwarded to
  `agent_run_events` rows → the UI's visible thinking + the Agents-page reflection ticker.
- **Budget caps**: native per-run caps + our `maxBudget` accounting on the run row; numbers
  → ticket 09. **Hebrew end to end** per ticket 06; bidi law applies to every new surface.

### 8 · Acceptance gates

The intake regression (a mid-conversation correction MUST reach the resolver — closed by
construction via per-turn `resolve_company` + @mentions) and the בז"א alias case — both
MUST-PASS in `docs/eval/retrieval-eval-set.md`; the standing harness at
`scripts/retrieval-eval/` is the quality gate for every retrieval change.

**Consequences handed onward:** ticket 09 (cost budgets) is unblocked — Sonnet-5-default
arithmetic, Managed Agents session-hours, web-search pricing, embedding costs; the
ingestion standard and MAYA-filings-at-scale graduate from fog into their own tickets
feeding the spec (ticket 10).
