# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

`.scratch/` is **not** git-ignored: tickets are committed, so they travel with the
branch and the worktree that is working them.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- **A folder whose every ticket is closed leaves `.scratch/` at the next merge**, copied to
  `docs/archive/scratch/<date>-<feature-slug>/` verbatim and never re-authored. `npm run ship:gate`
  refuses the merge until it does, and `git merge` onto main runs the gate. Closed means the
  `Status:` line reads one of `done` · `shipped` · `closed` · `merged` · `archived` · `resolved` ·
  `wontfix`; anything else, including a missing `Status:` line, is open. Eviction is bound to the
  merge because the sweep that runs "later" is how the retired apparatus reached 2.8 MB.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## Switching to GitHub later

Deliberately deferred, not rejected (2026-08-12). The ceiling to watch for: no native
blocking edges between tickets, and nothing visible off this machine. When either starts
to bite — or when a second person joins — re-run `/setup-matt-pocock-skills` and pick
GitHub. Tickets are text; the migration is mechanical.
