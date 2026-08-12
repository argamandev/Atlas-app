# Anthropic account + API key for Atlas

Type: task
Status: open

## Question

Atlas has no Anthropic account, key, or org today (the SDK research, ticket 02, flagged it:
brand-new third vendor, Evaluation-tier org until real usage). Before anything
Claude-powered can be prototyped or costed for real: create the Anthropic org for Atlas,
generate an API key, store it in the Railway environment and local `.env` (never in git),
and record the org's rate-limit tier. The founder does the signup (HITL, billing); the
session hands him a precise checklist and verifies the key works with one metered call.
Needed before the retrieval eval (07) can price Claude-side designs and before any agent
prototype.
