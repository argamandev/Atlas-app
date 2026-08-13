# Cost budgets — numbers, not vibes

Type: research
Status: resolved (2026-08-12)
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

## Answer

Resolved 2026-08-12 by a research subagent; both price sources verified against the live
pages that day. Full fact sheet with every line of arithmetic:
`research/09-cost-budgets.md`. **The budget numbers are PROPOSED, not approved — the
founder's veto/approve happens in the spec grilling (ticket 10), per the map's founding
note ("derived by research, approved by the founder").**

Headlines (Sonnet 5, public list rates — no Anthropic account yet, ticket 11):

- **A chat answer ≈ $0.04–0.06 typical** (any surface: pinpoint, search mode, Ask Atlas,
  workspace); stuffed first turns up to ~$0.11, follow-ups ~$0.02 once cached. Proposed:
  ≤ $0.05 typical, ≤ $0.15 hard cap.
- **An agent run ≈ $0.39** (~22 steps, ~5 min on Managed Agents), **≈ $0.50 with the +30%
  Hebrew tokenizer overhead**. The $0.08/session-hour fee is ~2% of a run — tokens dominate
  ~50:1, and `idle` waits on our tool round-trips are unbilled. Proposed: ≤ $0.50 typical,
  ≤ $1.00 hard cap enforced by the platform's native per-session budget.
- **Ingestion is a non-story**: filing pages embed at ~$0.11/1,000; even the High MAYA
  backfill (~600K pages, 5 yrs) ≈ $67 of embeddings. The real open ingestion cost is the
  Hebrew PDF extraction pipeline ($0 plain-text … ~$360 one-time if LLM blurbs are adopted
  — and the blurbs' retrieval gain is still unmeasured; measure before paying) → ticket 17.
- **Monthly ≈ $32/fund typical** (10 answers + 2 runs/day) → 5 funds ≈ $160, 30 ≈ $960,
  100 ≈ $3,200/mo; cheap/heavy bands roughly ×⅓/×3. Proposed envelope: ~$35/fund/mo,
  alert at $100.
- **Efficiency levers, ranked**: caching (3–4× on agents — build the chat loop cache-first),
  scope routing (already decided), anchored-windows-not-documents tool results, Haiku for
  mechanical steps only, native per-run caps, Batch API (50%, ingestion only).

Facts that update earlier tickets:

- **Sonnet 5's $2/$10 is now permanent** (the Sept-1 increase was cancelled) — retires
  ticket 02's intro-pricing sensitivity.
- **gemini-embedding-001 $0.15/M is VERIFIED** (batch $0.075/M) — closes the eval's
  unverified-price caveat.
- **Web search's real cost is context, not the $0.01 fee** — searched content bills as
  input tokens in every later turn; archive-first (ticket 08) is itself a cost control.
- **Start-tier collision → ticket 11**: a new org's $500/mo spend cap binds at ~15 funds
  typical; the account setup must plan the Build→Scale tier path, not just get a key.
