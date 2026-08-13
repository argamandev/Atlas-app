# Claude Agent SDK as the engine for fund-created agents

Type: research
Status: resolved

## Question

Can the Claude Agent SDK power Atlas's user-created agents — and how, concretely? Facts
needed: how the SDK runs server-side (Node/TypeScript on Railway alongside Next.js 14); how
custom tools are defined; how sessions and memory persist across runs; scheduling patterns;
streaming results to a web UI; multi-tenant isolation (one fund's agent must never see
another fund's data); model tiers and pricing levers; rate/concurrency limits.

The frontend contract already exists (`src/lib/agents/data.ts`): an agent = name,
description, scope target among Call/Workspace/Company/Sector/Report, status, findings each
with a source string. The research must say how the SDK fills that contract.

Deliverable: an SDK fact sheet + a proposed shape for the agent runtime, sharp enough for
the agent-experience grilling (ticket 06) and the architecture decision (ticket 08).

## Answer

Full fact sheet, every claim cited against the current primary docs:
`../research/02-agent-sdk.md`. The SDK fits, with a clear runtime shape:

- **Where it runs:** a separate long-lived Railway worker service (`agent-runner`), NOT
  inside the Next.js process — the SDK spawns a `claude` CLI subprocess per session (~1 GiB
  RAM guidance each, no built-in timeout). Interactive dock chat can stay in a Next.js route
  handler streaming SSE. The SDK has no scheduler — Railway cron + an `agent_runs` table
  (db.md ownership quartet) drive due runs.
- **Tools:** one in-process MCP server (`createSdkMcpServer`) with Zod-schema tools —
  `search_corpus`, `resolve_company`, `read_transcript_window`, `read_workspace`,
  `list_disclosures`, plus writers `report_finding` and `update_memory`. Built-ins removed,
  `permissionMode: 'dontAsk'`, `settingSources: []`.
- **Tenancy is ours, not the SDK's:** tool handlers close over `{userId, scope}` from the
  run row — identity never comes from the model, and every query is owner-scoped
  (supabaseAdmin bypasses RLS).
- **Memory:** durable memory is application state in Supabase (findings, run summary, agent
  memory note injected into the next prompt) — the sessions doc's own recommendation. SDK
  session resume only for dock-conversation continuity.
- **Citations made unrepresentable-to-fake (M3):** findings exist only through
  `report_finding`, whose schema requires the `workspace_doc_blocks` anchor quartet and
  whose handler verifies the quote against the source before insert — `AgentFinding.src` is
  composed from verified anchors, never model prose.
- **Cost:** ~$0.35 per 20-tool-call run on Sonnet with the SDK's automatic caching (~$0.18
  Haiku, ~$1.75 Fable); caching is mandatory (3–4× worse without). Start-tier limits are
  ample for dozens of daily agents; concurrency is RAM-bound (~2–4 runs per small worker).
- **Risks flagged:** Anthropic is a brand-new third vendor (no key, no org — graduated to
  ticket 11); retrieval quality gates everything (tickets 05/07); prompt injection into a
  tool-wielding agent needs a red-team pass; Hebrew's ~30% tokenizer overhead makes the cost
  math optimistic.
