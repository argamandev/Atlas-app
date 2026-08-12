# Claude Agent SDK as the engine for fund-created agents

Type: research
Status: claimed

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
