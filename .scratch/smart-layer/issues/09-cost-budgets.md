# Cost budgets — numbers, not vibes

Type: research
Status: open
Assignee: claude (session 2026-08-12, claimed)
Blocked by: 07, 08 (both resolved — this ticket is on the frontier)

## Question

Put numbers on "cost per answer is a design constraint": price the chosen architecture —
model tiers per surface, embedding + contextual-retrieval preprocessing per document, the
arithmetic of a chat answer and of an agent run — and propose per-surface budgets for the
founder to veto or approve. Every build slice in the spec must show its arithmetic against
these budgets.

**Added by ticket 06 (2026-08-12):** agent runs are priced on **Managed Agents** —
$0.08/session-hour of running time (beta pricing) on top of normal token costs; see
`research/06-managed-agents.md` and ticket 02's §7 levers (caching mandatory, model tier
per agent kind, small tool results, per-run budget caps). The founder's direct question to
answer: *"regarding costs, how man can the costs be? how can we make them the most
efficient."*
