# C2 · Agent run engine (Managed Agents)

Status: ready-for-agent
Blocked by: 10 — **and 07, by founder call 2026-08-14. Do not start this with 07 unbuilt.**

**Why 07 gates this one, when the map never said so.** Spec §2.2 is "one tool registry, two
drivers": chat is driver one, this engine is driver two. They share `src/lib/chat2/tools.ts`, the
citation verify-at-write contract, and the cost model — and as of 06's merge that registry had never
served a real answer to a real user, no answer had ever been priced against the $0.06 budget, and
Railway's `ANTHROPIC_API_KEY` had never been exercised. This is the most expensive and least-proven
slice in the map; 07 is the cheapest place to find out the shared machinery is wrong. The same bad
news costs one slice here and the whole run engine there.

**What you should be able to assume when you start** (check it, do not trust this list): the tool
registry has answered real questions in production, one answer has a measured price, and the Railway
key is proven. If any of those is still open, that is 07's debt arriving here — the expensive place.

Spec §2.8 + §6 C2. Managed Agents integration: agent definition, session start,
custom-tool event round-trip webhook (tenancy in handlers, identity never
model-supplied), `report_finding` verify-at-write, native 100¢ budget cap,
Anthropic-side session + memory deletion on completion, run rows incl. honest "found
nothing new". Acceptance: an end-to-end mission on a real company produces only
verifiably-anchored findings; a fabricated anchor is rejected; deletion confirmed
post-run. Cost: ≤ $0.60/run.
