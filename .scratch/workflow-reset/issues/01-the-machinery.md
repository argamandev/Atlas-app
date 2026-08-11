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

**Status:** ready-for-agent

- [ ] The safety gate no longer references fleet worktree paths, and its fire-test matrix passes
- [ ] The matrix is extended to cover the new form, and still blocks every statement it blocked before — verified by running it, not by reading it
- [ ] An environment test runs as part of the ordinary test battery
- [ ] The always-on set is declared explicitly; a document joining or leaving it fails the test until the declaration is updated
- [ ] The always-on set is held to a stated token budget, and the budget number is visible in the failure message
- [ ] `STATUS.md` is held under a hard line cap
- [ ] Every law declares its enforcement: a mechanism, or an explicit `UNENFORCEABLE` marker with a stated reason. A bare law fails the test
- [ ] Honest marking is sufficient to pass — this ticket does not require building new mechanisms, only declaring their absence truthfully
- [ ] One command reports the count of unenforced laws
- [ ] Every document referenced by the always-on set exists
- [ ] The battery is green locally and under `TZ=UTC`, with the timezone verified from inside the run rather than assumed from the command line
- [ ] Nothing is removed in this ticket; it lands green describing the environment as it is today
