# 01 — The machinery

**What to build:** The enforcement layer the rest of the migration is proved by — built
*before* anything is removed, and landing green against the environment exactly as it is
today.

Two halves. First, the destructive-SQL safety gate stops depending on the agent fleet's
worktree layout, so that later removals cannot open a window where it points at paths that
no longer exist. Its protections do not change; only how it locates itself does. This guards
a database shared with live production Timlul, so it goes first.

Second, the environment gains a test in the ordinary battery. It knows exactly which
documents load on every session, refuses to let that set change by accident, holds it to a
token budget, caps the status file, and fails any law that declares neither a mechanism nor
an honest reason for having none. A single command reports how many laws are unenforced —
the number this whole change exists to drive down.

Prior art to copy deliberately: the API auth boundary test, which enumerates every route
from the filesystem, asserts a structural property across all of them, and carries an
allowlist where each exception must state its reason. This is that move, applied to the
workflow instead of to routes — so the workflow is not exempt from the rule it imposes on
the product (ADR-0002).

**Blocked by:** None — can start immediately.

**Status:** done

- [x] The safety gate no longer references fleet worktree paths, and its fire-test matrix passes
- [x] The matrix is extended to cover the new form, and still blocks every statement it blocked before — verified by running it, not by reading it
- [x] An environment test runs as part of the ordinary test battery
- [x] The always-on set is declared explicitly; a document joining or leaving it fails the test until the declaration is updated
- [x] The always-on set is held to a stated token budget, and the budget number is visible in the failure message
- [x] `STATUS.md` is held under a hard line cap
- [x] Every law declares its enforcement: a mechanism, or an explicit `UNENFORCEABLE` marker with a stated reason. A bare law fails the test
- [x] Honest marking is sufficient to pass — this ticket does not require building new mechanisms, only declaring their absence truthfully
- [x] One command reports the count of unenforced laws
- [x] Every document referenced by the always-on set exists
- [x] The battery is green locally and under `TZ=UTC`, with the timezone verified from inside the run rather than assumed from the command line
- [x] Nothing is removed in this ticket; it lands green describing the environment as it is today

## What landed

**The gate.** `pre-bash-gate.mjs` recognised the supervisor's checkout by a hard-coded
absolute path. It now asks git whether the checkout is primary or linked
(`--git-dir` vs `--git-common-dir`), and fails CLOSED when git cannot answer — the
same direction the old constant failed in. `gate-tests.mjs` builds three real
checkouts in a temp dir instead of pointing at two fleet worktrees. **77/77 pass**,
every previously-blocked statement included; run it, do not read it.

**The environment test.** `src/lib/environment.test.ts` (14 tests, in `npm test`) over
`scripts/lib/env-manifest.mjs`, which holds the declared always-on set, the token
budget and the law parser. `npm run env:health` prints the same numbers from the same
module, so the metric and the guard cannot disagree.

**The baseline it measured** (regenerate with `npm run env:health`; do not restate it
from here): 5 always-on documents against a 10k budget, 26 laws in `app.md`, 10 of them
carrying a mechanism. The unenforced count is the number ticket 03 and everything after
it has to move. Eleven laws previously declared nothing at all; they now say, honestly,
what is missing and what would close it. Four of the five always-on files state their
rules as prose and are exempt from the scan — named in `LAW_FORM_EXEMPT` and printed by
`env:health`, so the count is never read as covering more than it does.

**Found by cold review, before merge, and fixed:**
- `isPrimaryCheckout` handed a missing `cwd` straight to `execSync`, which inherits the
  hook's own directory — fail-OPEN on exactly the input its docblock promised was safe.
  Two matrix cases now measure it.
- The reason attached to `ENFORCED none` was read to the end of the law block, so a bare
  declaration borrowed the `VERIFY` paragraph below it and the "states why" test could
  not go red. Bounded to the declaration, with a fixture that proves it.
- `discoverAlwaysOn` hard-coded the root `CLAUDE.md`; a nested one joined the always-on
  set silently. Both halves are discovered now.
- The token estimate counted CRLF, making the budget ~280 tokens larger on the founder's
  machine than in a fresh clone. Normalised.
- A "~8.8k" measurement hand-carried into a comment was stale on arrival — the exact
  defect `app.md` records itself committing three times. Replaced with the command.
