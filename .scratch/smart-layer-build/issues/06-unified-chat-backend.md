# B1a · Unified chat backend (server)

Status: ready-for-agent
Blocked by: 04

Spec §3 + §2.2–2.5. New route: Sonnet 5 tool loop (registry minus agents-only tools),
out-of-band error/degradation framing (no in-band sentinel, no partial-as-complete),
fencing with defanged titles, citations verified at write, cache-first prompt, scope
router in Claude tokens (1.43 chars/token Hebrew). Old `/api/chat` keeps serving clients
until B2 retires it. `ANTHROPIC_API_KEY` is ALREADY SET on Railway (founder, 2026-08-14) — not a ship blocker.
Recorded on his word; nothing here has verified it, so a 401 from Anthropic is the thing to
check first rather than the last. Acceptance:
route tests — 401 path, injection fence, error framing, intake-regression simulation.
Cost: ≤ $0.06/answer.
