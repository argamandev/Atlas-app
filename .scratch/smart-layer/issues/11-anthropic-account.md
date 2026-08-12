# Anthropic account + API key for Atlas

Type: task
Status: claimed

## Question

Atlas has no Anthropic account, key, or org today (the SDK research, ticket 02, flagged it:
brand-new third vendor, Evaluation-tier org until real usage). Before anything
Claude-powered can be prototyped or costed for real: create the Anthropic org for Atlas,
generate an API key, store it in the Railway environment and local `.env` (never in git),
and record the org's rate-limit tier. The founder does the signup (HITL, billing); the
session hands him a precise checklist and verifies the key works with one metered call.
Needed before the retrieval eval (07) can price Claude-side designs and before any agent
prototype.

**Added by ticket 09 (2026-08-12):** plan the rate-limit tier path, not just the key — a
new org's Start tier carries a **$500/month spend cap**, which binds at ~15 funds on
typical usage (~$32/fund/mo); 30 funds needs Build ($1,000), 100 needs Scale. Also on the
checklist once the key exists: re-baseline the Hebrew token arithmetic with `count_tokens`
on real prompts (the +30% overhead in `research/09-cost-budgets.md` is a pricing-page
figure, not our measurement).
