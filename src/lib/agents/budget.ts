// ─────────────────────────────────────────────────────────────────────────────
// THE ONE PLACE THE RUN BUDGET IS SPELLED. Founder-approved 2026-08-16: $1.00
// hard cap per run, ~$0.50 typical (spec §6).
//
// Anthropic enforces this as a PRE-REQUEST gate: before each model request it
// checks consumed list cost against the cap and pauses the session if reached.
// The request that crosses the cap completes, so the final figure can exceed the
// cap by at most one model request. It is a bound on NEW work, not an exact stop.
//
// `amount` is MINOR UNITS (cents) as an INTEGER STRING — a string so no float
// rounding is ever applied. "1.00" is rejected by the API; so is the number 100.
// That trap is why this is a function with a test rather than an inline literal.
// ─────────────────────────────────────────────────────────────────────────────

export const RUN_BUDGET_CENTS = 100

export function runBudget() {
  return {
    type: 'limit' as const,
    max_list_cost: { amount: String(RUN_BUDGET_CENTS), currency: 'USD' as const },
  }
}
