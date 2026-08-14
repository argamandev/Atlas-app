# B3 · Workspace chat on the new retrieval

Status: ready-for-agent — third in the V1 order, and **the one slice that may honestly fail its own
gate**. A measured "the planner won, workspace left alone" is a COMPLETED ticket, not a blocker: it
must not stall ticket 10 and the agents chain behind it.
Blocked by: 08

**Read the gate as a real question, not a formality (founder call 2026-08-14).** "Ships only once the
new retrieval measurably beats the planner" is a comparison **nobody has ever run** — and the side
that has to win got measurably worse at A5's corpus size
(`docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`). Two reasons the planner might legitimately
hold: term overlap across a handful of documents in ONE workspace is a different problem from ANN over
98,000 chunks, and a workspace-scoped dense search is exactly the filtered-scan case that can hit
`hnsw.max_scan_tuples` (ticket 05's owed items) — a thin answer that does not announce itself.
**If the planner wins, the correct outcome is to leave workspace chat alone and file the measurement**
(app.md M2: never let a swap be justified by a gate you re-scored to pass). Workspace chat works today.

Spec §6 B3. Swap the planner's term-overlap scoring for the retrieval subsystem; defang
the workspace fence line (titles/labels — the slice-2 BLOCKER); keep
`truncated[]`/`omitted[]` honesty. **Gated: ships only once the new retrieval measurably
beats the planner on the eval set.** Acceptance: the measured win + workspace honesty
states verified in browser. Cost: ≤ $0.06/answer.
