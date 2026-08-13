# C2 · Agent run engine (Managed Agents)

Status: ready-for-agent
Blocked by: 10

Spec §2.8 + §6 C2. Managed Agents integration: agent definition, session start,
custom-tool event round-trip webhook (tenancy in handlers, identity never
model-supplied), `report_finding` verify-at-write, native 100¢ budget cap,
Anthropic-side session + memory deletion on completion, run rows incl. honest "found
nothing new". Acceptance: an end-to-end mission on a real company produces only
verifiably-anchored findings; a fabricated anchor is rejected; deletion confirmed
post-run. Cost: ≤ $0.60/run.
