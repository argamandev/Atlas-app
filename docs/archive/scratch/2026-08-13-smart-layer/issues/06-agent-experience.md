# The agent experience — the product magic, end to end

Type: grilling
Status: resolved (2026-08-12)
Blocked by: 02

## Question

The end-to-end experience of a fund-created agent — the thing the founder called "the
actual magic … the most important." Walk create → assign (company / call / sector / report
/ workspace) → run (scheduled? triggered? on live calls?) → findings with citations → chat
with the agent → memory across runs. Decide: what an agent may do in V1; what its memory
contains and how the owner sees and edits it; how it reports; what trust and verification
it shows (citations law applies). Grounded in the existing frontend contract
(`src/lib/agents/data.ts`, the Agents page) and the SDK facts from ticket 02.

**Founder note (2026-08-12, verbatim):** "It is important we understand claude managed
agents service and concider it as a service aswell."

## Answer

Resolved 2026-08-12 over two grilling rounds + a final amendment ("approve, resolve the
ticket"). Every founder decision is quoted in `DECISIONS.md` (nine entries dated 2026-08-12,
prefixed "ticket 06"); the Managed Agents fact sheet is
[`research/06-managed-agents.md`](../research/06-managed-agents.md). The V1 agent
experience, end to end:

1. **Create.** Name + description + free-text mission/context in the fund's own words
   (2–3 example missions as placeholders, not templates). One mission per agent. Assignment
   per his final flow: "a sectior or company or both" — the picker offers sector, company,
   or the two combined; the other target kinds (call / report / workspace) stay per the
   existing frontend contract. Then the **"Bring agent to life"** button.
2. **The agent introduces itself — in Hebrew.** On creation it reads its mission and says
   hey: introduces its plan and goal in human vibes — when it will run, what it will check —
   and asks the fund to confirm. Confirmed → the agent exists and is armed. The plan is
   always shown, never silently guessed (classifier-visible-failure law). All agent-facing
   language is Hebrew; bidi law applies.
3. **Run.** On **Anthropic's Managed Agents** (founder decision, overriding the session's
   self-hosted recommendation; beta + server-side-retention tradeoffs accepted eyes-open with
   mitigations: findings/memory-of-record live in Supabase, Anthropic-side copies are
   deletable scratch, terms revisited at GA). Runs are **mission-driven**: scheduled, run-now,
   or check-until-the-data-lands with honest "nothing new yet" runs. Manual + schedule in V1;
   event-triggered ingestion hooks V1.5; live mid-call notes V2 — **Note Taker** in V1 runs
   on the polished transcript the moment it lands, displayed as the scheduled agent it is
   (same machinery, simple mission — no fake pipeline behind an agent face).
4. **Reads.** The shared corpus scoped to its assignment (sector → its issuers; company →
   that issuer), plus the fund's own workspace only when assigned to one. Tenancy lives in
   our tool handlers; the model never supplies identity.
5. **Produces.** Anchored findings (the `report_finding` verify-before-save contract — a
   finding that cannot prove its source cannot exist) **and file artifacts** (e.g. the
   updated Excel) worked in the run's sandbox. **Artifacts land in the agent's chat**, not
   the workspace (founder overrode the recommendation). Every run leaves a visible record,
   including "ran, found nothing new".
6. **Chat.** Like talking to a human analyst with complete memory — grounded in the agent's
   memory + findings + scope with the same tools, fresh session per conversation (robust,
   Anthropic's own recommended pattern; continuity is OUR Supabase state, not Anthropic's
   session retention). Two fidelities: side panel for "chill", expandable to full page for
   serious work — the expanded chat is a first-class frontend requirement.
7. **Memory.** The second-worker experience: standing note + findings + run summaries,
   visible and editable on the agent's profile (implementation delegated to the session;
   an agent whose memory you can't inspect is an agent you can't trust).
8. **Visible thinking.** The agent's reasoning/thought process streams visibly during runs
   and chat; the black box atop the Agents page becomes the live **reflection ticker**
   ("User is initiating agent creation…", "Agent NOTE TAKER is working…") — aesthetic
   "show" by design.
9. **Guardrails** (answering his "what can go wrong" — free-play agents parked for V2):
   per-run budget caps (native in Managed Agents), fenced source text in every tool result,
   tenancy in handlers, anchored-findings-only writes.

**Consequences handed onward:** ticket 08 absorbs the runtime change (Managed Agents
sessions + custom-tool event round-trips or tunneled MCP instead of the self-hosted worker
from ticket 02's proposed shape) — noted in its body; ticket 09 gains the Managed Agents
price dimension ($0.08/session-hour + tokens) and the founder's direct question "how much
can the costs be? how can we make them the most efficient" — noted in its body.
