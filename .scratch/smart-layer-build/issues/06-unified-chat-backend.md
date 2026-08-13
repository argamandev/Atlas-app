# B1a · Unified chat backend (server)

Status: ready-for-agent
Blocked by: 04

Spec §3 + §2.2–2.5. New route: Sonnet 5 tool loop (registry minus agents-only tools),
out-of-band error/degradation framing (no in-band sentinel, no partial-as-complete),
fencing with defanged titles, citations verified at write, cache-first prompt, scope
router in Claude tokens (1.43 chars/token Hebrew). Old `/api/chat` keeps serving clients
until B2 retires it. `ANTHROPIC_API_KEY` goes to Railway with this ship. Acceptance:
route tests — 401 path, injection fence, error framing, intake-regression simulation.
Cost: ≤ $0.06/answer.
