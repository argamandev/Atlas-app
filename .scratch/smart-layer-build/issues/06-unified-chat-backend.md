# B1a · Unified chat backend (server)

Status: MERGED to main 2026-08-14 (`feat/a5-followup-embedding-gate`). Nothing open.
Blocked by: 04 (landed)

**The unverified claim below is now verified.** `ANTHROPIC_API_KEY` was recorded on the founder's
word; one real call was made before the merge and it answered **HTTP 200 from `claude-sonnet-5`**.
Scope of that evidence (app.md M1): it proves the key in the LOCAL `.env.local`. The Railway value
is a separate secret nothing here has touched — check it on the first deploy of this route.

What landed: `/api/chat/v2` + `src/lib/chat2/` (`loop`, `tools`, `toolDefs`, `citations`, `fence`,
`systemPrompt`). Typed events, so error text has no code path into a `delta`; quotes verified at
write against the pool the turn's tools actually returned; round-trip cap 4 ending in a visible
degradation. **No UI calls it — that is ticket 07.**

Spec §3 + §2.2–2.5. New route: Sonnet 5 tool loop (registry minus agents-only tools),
out-of-band error/degradation framing (no in-band sentinel, no partial-as-complete),
fencing with defanged titles, citations verified at write, cache-first prompt, scope
router in Claude tokens (1.43 chars/token Hebrew). Old `/api/chat` keeps serving clients
until B2 retires it. `ANTHROPIC_API_KEY` is ALREADY SET on Railway (founder, 2026-08-14) — not a ship blocker.
Recorded on his word; nothing here has verified it, so a 401 from Anthropic is the thing to
check first rather than the last. Acceptance:
route tests — 401 path, injection fence, error framing, intake-regression simulation.
Cost: ≤ $0.06/answer.
