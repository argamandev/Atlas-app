# Anthropic Managed Agents — fact sheet for ticket 06

Gathered 2026-08-12 by a docs-reading subagent (sources: `platform.claude.com/docs/en/managed-agents/*`),
to weigh the founder's ask: *"It is important we understand claude managed agents service and
concider it as a service aswell."* Compared against the self-hosted Claude Agent SDK shape from
`research/02-agent-sdk.md`.

## What it is

A **hosted agent runtime**: Anthropic runs the agent loop, an isolated Linux sandbox per session
(Ubuntu 22.04, up to 8 GB RAM / 10 GB disk), session lifecycle, event stream, and server-side
persistence. You define an agent (model, system prompt, tools, MCP config) via API and start
sessions against it. **Beta** — requires the `managed-agents-2026-04-01` beta header; memory
stores require `agent-memory-2026-07-22`; no documented SLA.

## The facts that matter for Atlas

1. **Custom tools are webhook-shaped.** Tools with `type: "custom"` do NOT run in the sandbox:
   the agent emits an `agent.custom_tool_use` event, our backend executes it and returns a
   `user.custom_tool_result` event. Tenancy would still be enforced in OUR handler — same as
   self-hosted — but every tool call becomes a network round-trip through their event stream.
   Alternatively remote/tunneled MCP servers (tunnels = research preview).
2. **Memory is document-oriented, not a database.** Memory stores: up to 8 per session, ≤2,000
   memories per store, ≤100 kB per memory, read/written by the agent as files under
   `/mnt/memory/…`, versioned with an audit trail. Fine for a standing note; wrong shape for
   queryable findings with verified anchors (ours live in Supabase and feed the UI directly).
3. **Native cron exists.** Scheduled deployments: POSIX cron + IANA timezone, minute granularity,
   pause/unpause/archive, manual trigger API, per-run budget caps, run history — up to 1,000
   deployments per org. This is the one thing self-hosting has to build itself (Railway cron +
   `agent_runs` table).
4. **Data retention.** Session history, sandbox state and memory-store files are persisted
   server-side by Anthropic; the service is explicitly **not eligible for Zero Data Retention**.
   Data residency undocumented (likely US; would need a sales conversation).
5. **Pricing (beta, may change).** $0.08 per session-hour of `running` time, plus normal token
   costs. No batch pricing. For our ~5-minute scheduled runs the runtime fee is cents — token
   cost dominates either way (matches ticket 02's arithmetic).
6. **Sandbox** ships full dev tooling (Python/Node/Go/…, git, curl, limited Docker); networking
   `unrestricted` or allowlisted. Rate limits: 300 create-ops/min, 1,200 read-ops/min per org.

## What it buys vs what it costs (vs self-hosted SDK on Railway)

**Buys:** no Railway worker to run or size (the 1 GiB/agent problem disappears), native
scheduling with run history and per-run budget caps, sandbox isolation as a service.

**Costs:** beta with no SLA as the runtime of the product's flagship feature; our corpus text and
findings retained server-side outside our Supabase (no ZDR); every Supabase-backed tool becomes
an event-stream round-trip instead of an in-process function; memory the wrong shape for
queryable, anchor-verified findings; a second integration surface to learn while the Agent SDK
path reuses the repo's existing patterns (SSE streaming, Supabase state, in-process tools).

**Unknowns:** data residency; GA pricing; session timeout ceilings; multiagent coordination
maturity.

## Recommendation carried into the grilling

Self-hosted Agent SDK on a Railway worker for V1 (ticket 02's proposed shape), Managed Agents
re-evaluated at GA — the deciding facts are the beta status, server-side retention of fund
research data, and findings-as-database being load-bearing for the Agents UI. The founder
decides (ticket 06, Round 1 addendum Q11).
