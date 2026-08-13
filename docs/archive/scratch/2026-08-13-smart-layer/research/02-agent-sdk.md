# Claude Agent SDK — fact sheet for the Atlas agent runtime

Research for `.scratch/smart-layer/issues/02-agent-sdk-research.md`, written 2026-08-12.
Every claim carries the primary-source URL it was read from that day. The docs live at
`code.claude.com/docs` (Agent SDK) and `platform.claude.com/docs` (API, pricing, limits) —
`docs.claude.com`/`docs.anthropic.com` now 301 there.

Frontend contract this must fill (`src/lib/agents/data.ts`): an agent = name, description,
one scope (`Call|Workspace|Company|Sector|Report`), status `idle|running`, schedule → produces
**findings, each `{ text, src }`** where `src` is a citation string ("Q1 call · 14:02 · CEO"),
plus a `lead` line and an openable chat.

---

## 1 · What the SDK actually is

- **A library that runs Claude Code's agent loop in your own process.** Package
  `@anthropic-ai/claude-agent-sdk` (TypeScript) — "the same tools, agent loop, and context
  management that power Claude Code, programmable in Python and TypeScript."
  <https://code.claude.com/docs/en/agent-sdk/overview>
- **`query({ prompt, options }) → AsyncGenerator<SDKMessage>`.** One call runs the whole loop:
  Claude plans, calls tools, reads results, repeats until done, then emits a final
  `{ type: "result" }` message with `result` text, `session_id`, `usage`, `total_cost_usd`.
  `prompt` is a string (single-shot) or an `AsyncIterable<SDKUserMessage>` (streaming input,
  multi-turn in one process). <https://code.claude.com/docs/en/agent-sdk/typescript>
- **Runtime assumption — the subprocess model.** Every `query()` **spawns a `claude` CLI
  subprocess** and talks to it over stdio; the subprocess owns a shell, a working directory,
  and JSONL session transcripts on local disk. The SDK bundles the native CLI binary as a
  platform-specific optional dependency (SDK v0.3.191 bundles Claude Code v2.1.191; updating
  the SDK is how you update the CLI). Node.js 18+.
  <https://code.claude.com/docs/en/agent-sdk/hosting>,
  <https://code.claude.com/docs/en/agent-sdk/typescript>
- **Built-in tools** are Claude Code's: Read/Write/Edit files, Bash, Glob/Grep, web search,
  subagents, etc. They can all be removed (`tools: []`) so the agent sees only your custom
  tools — that is the shape Atlas wants (§6).
  <https://code.claude.com/docs/en/agent-sdk/overview>,
  <https://code.claude.com/docs/en/agent-sdk/custom-tools>
- **System prompt**: default is a *minimal* prompt (tool calling only), NOT the Claude Code
  prompt. Options: the `claude_code` preset (± `append`), or a fully custom string. Anthropic's
  own guidance: an agent with "a different surface, identity, or permission model, or a
  non-coding agent" gets a **custom prompt string** — Atlas's case exactly.
  <https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts>
- **Auth**: subprocess reads `ANTHROPIC_API_KEY` from env. Anthropic explicitly does **not**
  allow third-party products to piggyback on claude.ai login/rate limits — API key billing it is.
  <https://code.claude.com/docs/en/agent-sdk/overview> (Note),
  <https://code.claude.com/docs/en/agent-sdk/hosting> (Auth and secrets)
- **Key `Options` fields** (TypeScript reference): `model`, `systemPrompt`, `tools`,
  `allowedTools`, `disallowedTools`, `permissionMode`, `canUseTool`, `mcpServers`, `resume`,
  `forkSession`, `continue`, `cwd`, `maxTurns`, `maxBudgetUsd`, `hooks`, `settingSources`,
  `sessionStore`, `persistSession`, `includePartialMessages`, `abortController`, `env`,
  `sandbox`. The returned `Query` object adds `interrupt()`, `setPermissionMode()`,
  `setModel()`, `close()`. A `startup()` helper pre-warms the subprocess.
  <https://code.claude.com/docs/en/agent-sdk/typescript>

### Can it run in a Next.js route handler / a Node worker on Railway?

- **Railway: yes.** Railway runs full containers, so spawning the CLI subprocess is fine (the
  thing that breaks is classic serverless where you can't hold a subprocess; the docs single
  out "a stateless environment, such as a lambda function" as the case for single-message
  mode). <https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode>
- **Inside the existing Next.js web process: technically possible, wrong shape for scheduled
  runs.** Anthropic's sizing guidance is **~1 GiB RAM, 1 CPU, 5 GiB disk per running agent**
  (a floor, not a ceiling — memory grows with session length); one session = one subprocess;
  there is **no built-in session timeout** (`maxTurns` is the only bound). A long agent run
  inside the web dyno competes with the product for RAM.
  <https://code.claude.com/docs/en/agent-sdk/hosting> (Resources, Known limitations)
- **Recommended server-side shapes** (hosting doc, verbatim patterns): *ephemeral* (container
  per task), *long-running* (persistent container holding N subprocesses behind HTTP/WS),
  *hybrid* (ephemeral containers that hydrate from a `SessionStore` and persist back — "the
  store is required for this pattern, not optional"). For Atlas the natural fit is a
  **separate long-running Railway worker service** (see Proposed shape).
  <https://code.claude.com/docs/en/agent-sdk/hosting>
- Anthropic token cost dominates infra cost "by an order of magnitude or more" (a minimal
  container ≈ $0.05/h; one long session can spend dollars in tokens).
  <https://code.claude.com/docs/en/agent-sdk/hosting> (Cost)

---

## 2 · Custom tools — how Supabase-backed tools plug in

- **`tool(name, description, zodShape, handler)`** defines a tool; handler receives args typed
  from the Zod schema and returns `{ content: [{type:'text',text}...], structuredContent?,
  isError? }`. **`createSdkMcpServer({ name, tools })`** wraps tools in an **in-process MCP
  server** — "runs in-process inside your application, not as a separate process." No network,
  no extra deployable: the handler is just an async function in the worker, so it can call
  `src/lib/db/*` directly. <https://code.claude.com/docs/en/agent-sdk/custom-tools>
- Pass servers via `mcpServers: { atlas: atlasServer }`; the tool's fully-qualified name is
  **`mcp__atlas__search_corpus`**; list names (or wildcard `mcp__atlas__*`) in `allowedTools`
  so they run without prompting. <https://code.claude.com/docs/en/agent-sdk/custom-tools>
- **Two layers**: `tools: [...]` controls *availability* (what Claude even sees; `tools: []`
  removes every built-in, "Claude can only use your MCP tools"), `allowedTools` controls
  *permission*. <https://code.claude.com/docs/en/agent-sdk/custom-tools> (Configure allowed tools)
- **Errors don't stop the loop**: throw → SDK converts to an error result Claude reads; better,
  catch and return `isError: true` with a composed message ("which request failed, what to try
  instead"). This is exactly the "visible failure" M3 wants at the tool boundary.
  <https://code.claude.com/docs/en/agent-sdk/custom-tools> (Handle errors)
- **`structuredContent`** returns machine-readable JSON alongside/instead of prose — the lever
  for making `report_finding` results exact. `annotations: { readOnlyHint: true }` lets Claude
  batch read-only tools in parallel. <https://code.claude.com/docs/en/agent-sdk/custom-tools>
- **Tool search is on by default**: tool schemas are deferred and loaded on demand; set
  `alwaysLoad: true` per tool/server to pin small tool sets into the initial prompt (Atlas has
  ~6 tools — pin them). <https://code.claude.com/docs/en/agent-sdk/custom-tools>
- External MCP servers (stdio/HTTP) are also supported but unnecessary here — in-process is
  strictly better for Supabase tools (same process = same auth context, no second service).
  <https://code.claude.com/docs/en/agent-sdk/mcp>

Sketch of an Atlas tool (shape only):

```ts
const searchCorpus = tool(
  'search_corpus',
  'Search transcripts and filings of the scoped company/sector. Returns windows with anchors.',
  { query: z.string(), limit: z.number().int().max(20).default(8) },
  async (args, _extra) => {
    // closure carries { userId, scope } — the model NEVER supplies identity (§6)
    const rows = await searchScoped(userId, scope, args.query, args.limit)
    return { content: [{ type: 'text', text: renderWindows(rows) }],
             structuredContent: { hits: rows.map(anchorOf) } }
  },
  { annotations: { readOnlyHint: true }, alwaysLoad: true }
)
```

---

## 3 · Sessions and memory

### Sessions (conversation persistence)

- Every run writes a JSONL transcript to `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
  (or under `CLAUDE_CONFIG_DIR`). Capture `session_id` from the result (or init) message;
  **`resume: sessionId`** continues with full context; **`forkSession: true`** branches;
  `continue: true` picks up the most recent session in the cwd. `persistSession: false` keeps
  a session memory-only. <https://code.claude.com/docs/en/agent-sdk/sessions>
- **`SessionStore` adapter** mirrors transcripts to your own backend so any host can resume —
  interface is just `append(key, entries)` + `load(key)` (+ optional list/delete). Anthropic
  ships **reference adapters for S3, Redis, and Postgres** (`examples/session-stores/` in the
  TS SDK repo; Postgres = one `jsonb` row per entry ordered by `BIGSERIAL`) plus a conformance
  suite. Mirror writes are best-effort (retries ×3, then `mirror_error` system message).
  <https://code.claude.com/docs/en/agent-sdk/session-storage>
- **Auto-compaction is built in**: "After auto-compaction, earlier turns are replaced by a
  summary" (a 503-entry store can resume as 18 messages) — the SDK "automatically summarizes
  previous messages when the context limit approaches."
  <https://code.claude.com/docs/en/agent-sdk/session-storage> (getSessionMessages),
  <https://claude.com/blog/building-agents-with-the-claude-agent-sdk>
- The sessions doc's own advice for durable state: **"Don't rely on session resume. Capture the
  results you need (analysis output, decisions, file diffs) as application state and pass them
  into a fresh session's prompt. This is often more robust than shipping transcript files
  around."** <https://code.claude.com/docs/en/agent-sdk/sessions> (Resume across hosts)

### Memory (knowledge that survives runs)

Anthropic's 2026 stack, strongest-fit first for Atlas:

1. **Application state in your DB** — the sessions doc's explicit recommendation above. For
   Atlas: findings, run summaries, and an agent "memory note" live in Supabase and are injected
   into the next run's prompt. Deterministic, queryable, multi-tenant by construction.
2. **The memory tool** (`{type: "memory_20250818", name: "memory"}`, GA, no beta header, all
   Claude 4+ models): Claude reads/writes files under a virtual `/memories` path, **but the
   operations are executed client-side by YOUR handler** — "The `/memories` path is a prefix
   that your handler maps onto real storage, such as a per-user directory or keys in a
   database." I.e. it can be backed by a Supabase table keyed by `(user_id, agent_id, path)`.
   The API auto-injects a memory protocol into the system prompt. Path-traversal validation is
   the handler's job. <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>
   (Note: this is a Messages-API tool; inside the Agent SDK the equivalent is simply a custom
   `mcp__atlas__*` memory tool — same idea, our storage.)
3. **CLAUDE.md / auto-memory files** — filesystem-based, loaded via `settingSources`; built for
   coding agents in a repo. Wrong fit for multi-tenant Atlas and explicitly disabled in the
   isolation recipe (§6). <https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts>
4. **Context editing** (Messages API beta `context-management-2025-06-27`): server-side
   clearing of old tool results / thinking blocks. Anthropic's stated recommendation is
   **compaction as the primary strategy for most use cases**, context editing for fine-grained
   tool-heavy control; memory tool pairs with both ("Claude can write information to memory
   before tool results are cleared"). The Agent SDK already auto-compacts, so Atlas doesn't
   touch this directly. <https://platform.claude.com/docs/en/build-with-claude/context-editing>
5. Blog-level principles: filesystem-as-context + agentic search before semantic search;
   subagents to keep the orchestrator's context clean.
   <https://claude.com/blog/building-agents-with-the-claude-agent-sdk> (2025-09-29)

---

## 4 · Scheduling — ours

The SDK offers **no scheduler**. Nothing in the Options/reference/hosting docs schedules a
query; the hosting page assumes *you* own invocation (HTTP endpoint, cron, queue).
<https://code.claude.com/docs/en/agent-sdk/hosting>. Anthropic's hosted alternative is
**Managed Agents** — "long-running or asynchronous agents without managing your own sandbox or
session infrastructure," a separate REST product billed per session-hour ($0.08/h) — an option
Atlas is not taking (own data plane, Supabase tools).
<https://code.claude.com/docs/en/agent-sdk/overview>,
<https://platform.claude.com/docs/en/about-claude/pricing> (Managed Agents)

So: **Railway cron** (or a poll loop in the worker) fires due runs from an `agent_runs` table.
The `scheduleLabel` in the frontend contract ("Jun 19" / "weekly") maps to a cron expression +
next-run timestamp we own end to end.

---

## 5 · Streaming to the web UI

- `query()` is an async generator: iterate and forward. Message stream = `system` (init,
  carries `session_id`), `assistant` (text + `tool_use` blocks — these are the "agent is doing
  X" progress events), tool results, and final `result`.
  <https://code.claude.com/docs/en/agent-sdk/typescript>
- **Token-level partials**: `includePartialMessages: true` adds `stream_event` messages
  (`SDKPartialAssistantMessage`) wrapping raw Anthropic stream events — that is the karaoke-
  grade stream if the dock chat wants it. <https://code.claude.com/docs/en/agent-sdk/typescript>
- **Streaming input mode** (prompt = AsyncGenerator) is the recommended mode for interactive
  chat: persistent session, queued messages, `interrupt()`, images.
  <https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode>
- Web plumbing is ours and standard: the worker (or a Next.js route handler for interactive
  chat) consumes the generator and re-emits over SSE — same pattern `/api/chat` already uses
  for Gemini streaming today. For *scheduled* runs the UI doesn't need token streaming at all:
  the worker updates `agent_runs.status` + appends progress events to Supabase and the page
  polls/subscribes. Two different fidelities, both served by the same message stream.

---

## 6 · Multi-tenant isolation — what the SDK gives vs what is OURS

What the SDK/docs give (per-tenant recipe, hosting doc):

- `settingSources: []` — load no filesystem settings/CLAUDE.md;
- `env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" }` — auto-memory loads regardless of
  settingSources otherwise (TS `env` REPLACES the subprocess env — spread `...process.env`);
- `CLAUDE_CONFIG_DIR` per tenant; `cwd` per tenant;
- per-tenant egress rules at a proxy.
  <https://code.claude.com/docs/en/agent-sdk/hosting> (Multi-tenant isolation)

Permission machinery: evaluation order is hooks → deny rules → ask rules → permission mode →
allow rules → `canUseTool`. For a locked-down headless agent the doc's own recipe is
**`allowedTools` + `permissionMode: "dontAsk"`** — everything not pre-approved is denied
outright, `canUseTool` never fires. `disallowedTools: ["*"]`/`tools: []` removes built-ins
entirely. A `PreToolUse` hook is the only check that runs on *every* call in every mode.
<https://code.claude.com/docs/en/agent-sdk/permissions>

**What the SDK cannot do: row-level tenancy.** Sandboxing isolates the *process*; nothing in
the SDK knows which Supabase rows a fund may see. Two consequences, both already Atlas law:

1. **Identity never comes from the model.** Tool handlers close over `{ userId, scope }`
   resolved by the worker from the `agent_runs` row (which carries the owner's `user_id` per
   `.claude/rules/db.md`). No tool takes a user id or a free company id as a model-supplied
   argument — the lying state is unrepresentable (M3.3).
2. **Every tool query is owner-scoped in application code or runs through the user client.**
   `supabaseAdmin` bypasses RLS (`rules/app.md`), so an agent tool built on it must filter by
   owner exactly like `conversations.ts` does; shared-corpus reads (`companies`, transcripts
   shared-read) are the legitimate exception per `docs/DATA-MODEL.md`.

Plus the prompt-injection edge the SDK does not solve: corpus text fed to an agent WITH tools
is more dangerous than in chat — the `<<<ATLAS-SOURCE …>>>` fencing from
`src/lib/workspace/chat/context.ts` must carry over into every tool result that quotes a
document.

---

## 7 · Cost levers and arithmetic

Pricing (Claude API, 2026-08-12 — <https://platform.claude.com/docs/en/about-claude/pricing>):

| Model (API id) | Input /MTok | Output /MTok | Cache write 5m | Cache read | Context |
| --- | --- | --- | --- | --- | --- |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | $1 | $5 | $1.25 | $0.10 | 200k |
| Claude Sonnet 5 (`claude-sonnet-5`) | $2 | $10 | $2.50 | $0.20 | 1M |
| Claude Opus 5 (`claude-opus-5`) | $5 | $25 | $6.25 | $0.50 | 1M |
| Claude Fable 5 (`claude-fable-5`) | $10 | $50 | $12.50 | $1.00 | 1M |

(Model ids/context from <https://platform.claude.com/docs/en/about-claude/models/overview>.
Note: 4.7+ models tokenize ~30% more tokens for the same text — budget Hebrew accordingly.)

Levers, strongest first:

- **Model per agent / per step.** `options.model` per query; subagents can run a cheaper model
  than the orchestrator (per-`AgentDefinition` model, and `modelUsage` on the result breaks
  cost down per model). A Haiku 4.5 scan is 10× cheaper than Fable 5 per token.
  <https://code.claude.com/docs/en/agent-sdk/cost-tracking>
- **Prompt caching is automatic in the SDK** ("You do not need to configure caching yourself");
  cache read = 0.1× input price, and **cache reads don't count toward ITPM rate limits** on
  current models. For scheduled agents with >5-minute gaps, `ENABLE_PROMPT_CACHING_1H` buys a
  1-hour TTL (2× write cost). For cross-run cache hits on the system prompt, keep it
  byte-identical (`excludeDynamicSections: true` exists for the preset; a custom static prompt
  achieves the same for free).
  <https://code.claude.com/docs/en/agent-sdk/cost-tracking>,
  <https://platform.claude.com/docs/en/api/rate-limits> (Cache-aware ITPM),
  <https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts>
- **Context hygiene**: auto-compaction (built in), small tool results (return windows with
  anchors, not whole documents — the `plan.ts` budgeting discipline applies inside tools too),
  `maxTurns` + **`maxBudgetUsd`** as hard caps (`error_max_turns` / `error_max_budget_usd`
  result subtypes). <https://code.claude.com/docs/en/agent-sdk/sessions> (Resume by ID)
- **Accounting**: read `total_cost_usd` + `modelUsage` off every result message and store them
  on the run row — but they are *client-side estimates*; authoritative billing is the Usage &
  Cost API. "Do not bill end users… from these fields."
  <https://code.claude.com/docs/en/agent-sdk/cost-tracking>
- Batch API is 50% off but has no agent loop — irrelevant to SDK runs.

**Rough arithmetic — one scheduled run, ~20 tool calls (≈22 model steps), Sonnet 5.**
Assume: static system prompt + 6 tool schemas ≈ 5k tokens; average tool result ≈ 2k tokens;
final context ≈ 50k tokens; conversation prefix cached step-over-step (SDK default).

- Cache reads: ~600k tokens × $0.20/MTok ≈ **$0.12**
- Cache writes (each step's new suffix): ~60k × $2.50/MTok ≈ **$0.15**
- Output: ~22 × 400 tok ≈ 9k × $10/MTok ≈ **$0.09**
- **≈ $0.35/run on Sonnet 5** · same shape ≈ **$0.18 on Haiku 4.5** · ≈ **$0.90 Opus 5** ·
  ≈ **$1.75 Fable 5**. Without caching the same run is ~3–4× worse (660k × $2 ≈ $1.32 input
  alone) — caching is not optional.
- Scale check: 30 funds × 1 daily Sonnet run ≈ $10.5/day ≈ **~$315/month**; the same on Haiku
  ≈ ~$160/month. Sensitive mostly to tool-result size, hence the anchors-not-documents rule.

---

## 8 · Rate and concurrency limits

<https://platform.claude.com/docs/en/api/rate-limits> — org-level, token-bucket, per-model
buckets, 429 + `retry-after` on breach, `anthropic-ratelimit-*` headers on every response.

| Tier (auto by usage) | Sonnet 5 / Haiku 4.5 / Opus 5 | Fable 5 | Monthly spend cap |
| --- | --- | --- | --- |
| Start | 1,000 RPM · 2M ITPM · 400k OTPM | 1,000 RPM · 500k ITPM · 100k OTPM | $500 |
| Build | 5,000 RPM · 5M ITPM · 1M OTPM | 2,000 RPM · 1.5M ITPM · 300k OTPM | $1,000 |
| Scale | 10,000 RPM · 10M ITPM · 2M OTPM | 4,000 RPM · 4M ITPM · 800k OTPM | $200,000 |

- **Cache reads don't count toward ITPM** (current models) — an 80% cache-hit agent fleet gets
  ~5× effective input throughput. Limits are per model, so Haiku subagents draw from a
  different bucket than the Sonnet orchestrator.
- New orgs may start in an Evaluation tier below Start; acceleration limits punish sharp
  ramps — stagger cron fan-out, don't fire 50 agents at :00.
- Hosting doc's own warning: "Large parallel-subagent fanouts can hit rate limits — break work
  into smaller batches." <https://code.claude.com/docs/en/agent-sdk/hosting>
- Concurrency on the box: one subprocess per session, RAM-bounded —
  `agents per host = (host RAM − overhead) / per-session RAM ceiling` (measure peak RSS; 1 GiB
  is the floor). A small Railway worker realistically runs **2–4 concurrent agent runs**; a
  queue with a concurrency cap is part of the runtime, not an optimization.
  <https://code.claude.com/docs/en/agent-sdk/hosting> (Scaling and concurrency)

---

## Proposed shape — the Atlas agent runtime

**Where it runs.** A new, separate Railway service: `agent-runner` — a long-lived Node worker
in this repo (`scripts/` or `services/`, own start command), NOT inside the Next.js web
process. Reasons: 1 GiB/subprocess sizing, no built-in session timeout, and the web dyno
already serves the product (same class of separation as the two live engines on :8788).
Interactive *chat with an agent* (the dock) is lighter and short-lived — it can run as a
`query()` inside a Next.js route handler streaming SSE, exactly like `/api/chat` streams
Gemini today; if RAM says otherwise it moves to the worker behind an internal endpoint.

**The loop.**

1. Railway cron (or a 60s poll in the worker) marks due rows in `agent_runs` (new table:
   `user_id` FK + RLS + owner policy + index — the db.md quartet — plus `agent_id`, scope,
   status, cost fields). Worker claims a run, caps concurrency (start: 2).
2. Executes `query()` with:
   - `systemPrompt`: custom string (not the preset) — the agent's role, its scope rendered as
     facts, the finding discipline ("every claim through `report_finding`, nothing else counts"),
     bidi/Hebrew rules. Static prefix, per-run facts at the end → cross-run cache hits.
   - `tools: []` (no built-ins — no Bash, no filesystem), `mcpServers: { atlas }`,
     `allowedTools: ['mcp__atlas__*']`, `permissionMode: 'dontAsk'`, `settingSources: []`,
     `env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }`.
   - `model` per agent kind (default `claude-sonnet-5`; scans `claude-haiku-4-5`),
     `maxTurns: ~30`, `maxBudgetUsd` per run, `abortController` wired to a wall-clock timer
     (the SDK has no deadline of its own).
3. The in-process **`atlas` MCP server** closes over `{ userId, scope }` from the run row:
   `search_corpus`, `resolve_company` (the intake bug's tool-boundary fix doubles here),
   `read_transcript_window`, `read_workspace`, `list_disclosures` (MAYA, rate-limit aware) —
   all read-only, all owner/scope-filtered in the handler — plus two writers:
   - **`report_finding`** — Zod schema REQUIRES the anchor quartet the repo already shipped in
     `workspace_doc_blocks`: `source_item_id`/line id, `source_label`, `source_quote`, text.
     The handler verifies the quote exists in the cited source before inserting the row and
     returns `isError: true` with "quote not found in source" otherwise. A finding that isn't
     anchored **cannot exist** — the fabricated-`src` failure mode of the demo data is made
     unrepresentable (M3), and `AgentFinding.src` is rendered from verified anchor parts, never
     from model prose.
   - **`update_memory`** — writes the agent's standing note (`agent_memory` row, size-capped).
4. Worker streams progress: assistant/tool_use messages → `agent_run_events` rows (UI polls or
   Supabase realtime); on `result`, stores `total_cost_usd`, `modelUsage`, `session_id`, status.

**How memory persists.** Durable memory = Supabase, not JSONL: findings + run summary + the
agent's memory note are application state injected into the next run's prompt (the sessions
doc's own recommendation). SDK sessions are used only for *conversation continuity in the
dock*: chat resumes the producing run's `session_id`; if cross-host resume is ever needed, the
Postgres `SessionStore` reference adapter points at a new additive table (through the db.md
DDL gate). Scheduled runs otherwise start fresh — cheaper, deterministic, no transcript
shipping.

**How the frontend contract gets filled.** `getAgentsPageData()` in `src/lib/agents/data.ts`
swaps to real queries: `AgentCard` ← `agents` + latest run (`status` running/idle, `task`,
`out` = "N findings", `when`); `findings[]` ← `agent_findings` rows with `src` composed from
verified anchors; `lead` ← the run's result summary; `ScheduledAgent.scheduleLabel` ← the cron
row; `FinishedTask` ← completed runs; `RecentAgentChat` ← dock threads. The page component
doesn't change — the stub module was built as the swap point.

---

## Open questions / risks

1. **New vendor, new key.** Atlas has zero Anthropic code today (foundations §1) — this adds a
   third LLM vendor, a new API key in Railway, a new org starting at Evaluation/Start tier
   ($500/mo spend cap) with no usage history. Founder decision: consolidate chat on Anthropic
   too, or run Anthropic for agents only alongside Gemini/OpenAI?
2. **Worker RAM on Railway.** 1 GiB/agent guidance vs the current Railway plan — measure peak
   RSS of a real run before choosing the concurrency cap; may force a bigger instance.
3. **Retrieval quality is a prerequisite, not an SDK feature.** `search_corpus` is only as good
   as tickets 04/05 make it (attribution cleanup, Hebrew embeddings vs term overlap — the D8
   measurement). The SDK loop amplifies a weak tool by calling it 20 times.
4. **Prompt injection with tools.** A malicious/quirky filing instructing the agent is now
   instructing something that can write findings and memory. Source fencing in every tool
   result + writer tools constrained to anchored shapes is the mitigation — needs its own
   red-team pass before launch (candidate ritual-gate item, ADR-0002).
5. **Windows dev parity.** The bundled CLI binary is platform-specific; the worker developed on
   the founder's Windows machine deploys to Linux on Railway — verify the run loop on both
   (same class of trap as the MSYS `TZ=` law).
6. **Quote-verification strictness.** `formatted_data` regenerates on re-processing (foundations
   §6) — `report_finding`'s verify-then-insert must snapshot `source_quote` like
   `workspace_doc_blocks` does, so drift renders as "drifted", not as a broken agent.
7. **Cost estimates are estimates.** `total_cost_usd` is client-side; reconcile monthly against
   the Console Usage page before any per-fund pricing decision. Hebrew's ~30% tokenizer
   overhead on 4.7+ models makes the §7 arithmetic optimistic for Hebrew-heavy runs.
8. **SDK velocity.** v0.3.x with an experimental V2 session API already added and removed
   (0.3.142) — pin the version, read the CHANGELOG before minors
   (<https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md>).
9. **Scope→corpus mapping is product work**: what exactly `Sector` scope may search (all TASE
   issuers in the sector? only workspaces the fund holds?) decides both isolation and cost —
   belongs to the agent-experience grilling (ticket 06).
