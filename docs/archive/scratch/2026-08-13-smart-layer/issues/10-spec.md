# The smart-layer spec + build sequence

Type: grilling
Status: resolved
Blocked by: 06, 07, 08, 09, 16, 17 (all resolved 2026-08-13 — unblocked, the map's last open ticket)

**Carried in from ticket 09 (2026-08-12):** the cost budgets in `research/09-cost-budgets.md`
§5 are PROPOSED, not approved — this grilling includes the founder's veto/approve on them,
and every build slice in the spec shows its arithmetic against the approved numbers.

## Question

Write the smart-layer architecture spec and its build sequence of small shippable slices
(first slice fully specified), folding in every decision on this map, and get the founder's
approval. Resolving this ticket is reaching the destination — after it, building starts
with zero fog, one slice per session, through the normal `/ship` ritual.

## Answer

**Resolved 2026-08-13 — approved in one round.** The spec lives at
**`docs/SMART-LAYER-SPEC.md`** (moved out of this folder so it survives the map's
archival): the architecture assembled from tickets 01–17, the cost budgets recomputed at
the measured 1.43 chars/token Hebrew figure (answer ≤ $0.06 typical / $0.15 cap · agent
run ≤ $0.60 / $1.00 cap · ~$40/fund/mo · demo backfill $5–8), and the build sequence —
Phase A (corpus searchable: migrations → resolver → birth sequence → backfill + harness
re-run as the gate → MAYA demo backfill), Phase B (Chat → Ask Atlas → Workspace,
eval-gated), Phase C (agents, parallel after A4), Phase D (accounting) — slice A1 fully
specified.

The founder's approval, verbatim: *"It looks good. Let's build and finish Atlas v1 …
Right now - from our current standpoint - we have no way to know if things will be built
correctly unless we build them … So, let's do it."* — filed in `DECISIONS.md`. His
eyes-open framing is part of the record: problems found later (search quality, agent
behavior) are fixed later, smarter.

**The map's destination is reached.** Zero fog remains; the carried question (budget
veto/approve from ticket 09) is settled. Build tickets created at
`.scratch/smart-layer-build/issues/` — one per slice, `ready-for-agent`, blocking edges
per the spec's phases; building happens in normal sessions via `/ship`, outside this map.

## Comments

**2026-08-13 — draft written, founder approval pending.** The spec is at
`.scratch/smart-layer/spec.md`: architecture assembled from tickets 01–17 (nothing
re-decided), cost budgets RECOMPUTED at the measured 1.43 chars/token Hebrew figure
(ticket 11's instruction) — answer ≤ $0.06 typical (was $0.05), agent run ≤ $0.60 typical
(was $0.50), ~$40/fund/mo (was $35), caps unchanged — and a build sequence of 12 slices in
four phases (corpus → surfaces → agents-in-parallel → accounting), slice A1 (foundations
migrations) fully specified. Awaiting the founder's grilling on: (1) the spec as
architecture of record, (2) the recomputed budgets, (3) the build order. Resolution needs
his approval — this ticket is HITL and stays claimed until he speaks.
