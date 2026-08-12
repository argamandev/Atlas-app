# Working notes — the workflow reset (closed 2026-08-12)

The `.scratch/workflow-reset/` folder, moved here **verbatim** when the last of its three
tickets merged. This is the eviction ritual the third of those tickets built: working notes
become history in the same motion as the merge, never in a sweep that runs later.

Nothing here was re-authored. Each file's "What landed" section was written by the session
that did the work, before the merge, and is left exactly as it was — including the parts
that record what the cold review caught.

| File | What it is |
|---|---|
| `spec.md` | The founder-agreed spec for retiring the 4-seat agent fleet. |
| `issues/01-the-machinery.md` | The enforcement layer, built before anything was removed: the checkout-agnostic safety gate, `src/lib/environment.test.ts`, `npm run env:health`. |
| `issues/02-the-retirement.md` | The board, queue, logs and state files to history; `COLLISIONS.md`; the retired vocabulary made unable to return. |
| `issues/03-the-rituals.md` | Eviction and promotion as mechanisms: `npm run ship:gate`, the merge door in `pre-bash-gate.mjs`, the generated manual-verification checklist. |

The decisions these tickets rest on are `docs/adr/0001-retire-the-agent-fleet.md` and
`docs/adr/0002-a-lesson-is-not-learned-until-it-is-enforced.md`. What shipped is in
`PROGRESS.md`; the apparatus they retired is verbatim in
`docs/archive/agent-memory-snapshots/2026-08-12-fleet-retired/`.
