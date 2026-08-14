# C2 · Agent run engine (Managed Agents)

Status: ready-for-agent
Blocked by: 10

**What you should be able to assume when you start — check it, do not trust this list.** Spec §2.2 is
"one tool registry, two drivers": chat is driver one, this engine is driver two, and they share
`src/lib/chat2/tools.ts`, the citation verify-at-write contract and the cost model. Under the strict
order (07 → 08 → 09 → 10 → 11) that registry will have served real users across four surfaces before
you get here, so you should arrive with: the tool loop exercised against the real 98K-chunk corpus,
at least one answer priced against the $0.06 budget, and Railway's `ANTHROPIC_API_KEY` proven by a
real deploy. **If any of those is still open when you start, it is debt arriving at the most
expensive slice in the map — stop and close it here rather than building on top of it.**

Spec §2.8 + §6 C2. Managed Agents integration: agent definition, session start,
custom-tool event round-trip webhook (tenancy in handlers, identity never
model-supplied), `report_finding` verify-at-write, native 100¢ budget cap,
Anthropic-side session + memory deletion on completion, run rows incl. honest "found
nothing new". Acceptance: an end-to-end mission on a real company produces only
verifiably-anchored findings; a fabricated anchor is rejected; deletion confirmed
post-run. Cost: ≤ $0.60/run.
