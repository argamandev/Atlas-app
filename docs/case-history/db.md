# Case history — the database-level defects behind `.claude/rules/db.md`

<!-- WHAT THIS IS. `.claude/rules/db.md` states the law: what must always be true about a
     migration before it may touch Atlas's production Supabase. This file holds the STORY
     behind each one — the concrete defect, what it would actually have let a caller do, the
     prior warnings that named it and still weren't enough, and how the mechanism that now
     catches it was verified. Follows `docs/case-history/app.md`'s split and anchor
     convention exactly: the law stays short and always-on, the forensics live here and load
     on demand.

     WHY IT MOVED HERE INSTEAD OF STAYING IN db.md. `.claude/rules/*.md` load into EVERY turn
     of EVERY session (CLAUDE.md, CONTEXT.md) against a stated token budget
     (`scripts/lib/env-manifest.mjs`). The LESSON — what must be true, what enforces it, what
     to check by hand — belongs in every session's context. The STORY does not: a session
     only needs it when it hits the class of defect the law names, is about to argue with the
     law, or a reviewer asks "has this happened before?"

     WHEN TO READ IT. Same as app.md's: when you hit this class of defect and want the
     concrete failure; when you are about to argue a composite key is unnecessary somewhere;
     when a reviewer asks whether this has happened before.

     WHERE A NEW CASE GOES. The LAW goes in `.claude/rules/db.md`, short, imperative, pointing
     here with `→ #anchor`. The STORY comes HERE, under its own `##` heading. Do not grow the
     rules file back — that is what this split exists to prevent. -->

Created 2026-08-16 (ticket agents-1, round 2 of migration 032's review) when the law it holds
busted the always-on token budget on arrival. Rather than shave the law's wording to fit —
`scripts/lib/env-manifest.mjs` names that as its own failure mode, "shaving a law's wording to
hit a number is how a law gets quietly weakened by arithmetic" — the story moved here, following
the same split `app.md` already uses for exactly this reason.

---

## composite-child-fk

**The defect.** Migration 032's first draft (Agents V1's personal-layer tables: `agents`,
`agent_runs`, `agent_findings`, `agent_run_files`) keyed every child FK single-column:
`agent_runs.agent_id uuid references public.agents(id)`, and the same shape for
`agent_findings.run_id`/`.agent_id` and `agent_run_files.run_id`. Each of those four tables
correctly had the ownership FOUR points from `.claude/rules/db.md` — a real FK to `auth.users`,
RLS enabled, an owner policy on both `using` and `with check` granted to `authenticated`, and an
index on `user_id`. A cold review's sixteen-check walk of exactly those four points, table by
table, passed cleanly. The hole sat one level underneath that walk, in a place the ownership
checklist has no way to see.

**Why a single-column child FK is a hole, concretely.** PostgreSQL's referential-integrity
checker validates a foreign key by asking one question — does a row with this id exist in the
parent table — and that question is answered against the RAW TABLE, not through the querying
role's row-level-security view of it. RI checks DELIBERATELY BYPASS RLS; Postgres has to answer
"does this row exist" honestly regardless of who is asking, or FK enforcement itself would be
unreliable. So: user A creates `agents` row `agent_A` (their own, `user_id = A`). User B — who
cannot SEE `agent_A` through any normal query, because RLS's `using (auth.uid() = user_id)`
hides it — inserts into `agent_runs` with `user_id = B` (their own, satisfies `with check`) and
`agent_id = agent_A`'s id (a value B does not need to see the row to know exists — enumerate
uuids, or catch it in a URL, an API response, a support ticket). With a single-column
`agent_id → agents(id)` FK, that insert VALIDATES: the FK is satisfied (the row exists), the RLS
`with check` is satisfied (`user_id = B` is B's own id), and the two checks never talk to each
other. The row lands. B now has an `agent_runs` row silently attached to a stranger's agent —
not readable back through `agents`, but real, insertable, and (had a corresponding cascade
existed the other way) capable of surviving or interacting with data B was never meant to touch.
The composite fix closes exactly this gap: `foreign key (agent_id, user_id) references
public.agents (id, user_id)` means the FK ITSELF now asks "does a row with this id AND this
user_id exist" — and no row of `agent_A`'s exists with `user_id = B`, so the insert fails at the
database, before RLS is even in the picture. Requires the parent to carry a `unique (id,
user_id)` constraint — those exact two columns, no more and no fewer — for the child to
reference, because Postgres requires the FK's referenced column set to EXACTLY MATCH an existing
unique constraint or primary key; a wider unique constraint covering a superset of the columns
does not satisfy a narrower FK, which is precisely the mistake round 1 made prescribing a single
three-column `unique (id, agent_id, user_id)` to cover both `agent_run_files` (which needed just
`(id, user_id)`) and `agent_findings` (which needed the three-column form) at once — round 1
added the second, narrower constraint rather than ship SQL that could not apply.

**This was said twice already, and it still didn't land.** Two separate documents told this
exact build to copy the composite shape before migration 032 was drafted:
- `docs/SMART-LAYER-SPEC.md:165-166` — "**Personal layer** (copy migrations 015/016 verbatim —
  FK to `auth.users`, RLS both sides `to authenticated`, **composite child FKs**, `user_id`
  index; never the five FK-less tables)" — naming these exact tables in the very table it
  introduces `agents`/`agent_runs`/`agent_findings`/`agent_run_files`.
- `docs/archive/scratch/2026-08-13-smart-layer/research/03-foundation-review.md:115` (the
  foundation review that scoped this whole slice) — "**Personal tables (agents, agent_runs,
  memory) must copy migration 015/016, not the five FK-less tables.** Full template: FK to
  `auth.users`, RLS, owner policy both sides `to authenticated`, `user_id` index, PLUS `unique
  (id, user_id)` on the parent and a composite `(parent_id, user_id)` FK on every child
  (`20260803_016:96-108`)."

Both documents are correct, specific, and named the exact tables. Neither was read closely
enough while drafting the migration for the requirement to survive contact with the SQL. That is
the ADR-0002 shape precisely: a lesson stated in prose, twice, is not a lesson the codebase has
learned — only a mechanism that fails a battery is. This is why the law now carries a `test`
rather than another restatement in a third document.

**How the guard (`src/lib/db/compositeChildFk.test.ts`) was verified, not just written.** A test
that merely runs green against the fixed file proves nothing about whether it would have caught
the original bug — the standard M2 trap (a green test asserting nothing). So before shipping it:
the fixed `agent_runs_agent_fk` constraint was temporarily reverted to the exact original-draft
shape — `foreign key (agent_id) references public.agents (id)` — and the test was re-run in
isolation. It failed, naming the file and the offending constraint text verbatim:

```
✖ every child FK into an owner-scoped table is composite, keyed through user_id
  20260816_032_agents.sql: single-column FK into owner-scoped "agents" — foreign key (agent_id)
      references public.agents (id)
```

The fix was then restored from a scratch backup and the test re-ran green. Separately, the scan
was checked against every EXISTING single-column `references public.<table>` in the repo's
migration history to make sure it does not false-positive on the legitimate cases: single-column
refs into `companies`, `transcripts`, `company_documents`, and `scheduled_calls` all pass. For
`companies`/`scheduled_calls`/`company_documents` the reason is simple — no owner policy exists
on any of them at all. `transcripts` is the harder, more instructive case and the reason is NOT
"no owner policy exists": migration `20260801_014_transcripts_shared_corpus.sql:25-29` records
that the table's PRE-EXISTING owner policy ("users see own transcripts", `using (auth.uid() =
user_id)`) is DELIBERATELY LEFT IN PLACE and still governs INSERT/UPDATE/DELETE for any
non-service-role client — removing a policy is destructive and hook-blocked, so it could not be
dropped even if that had been wanted. What that migration adds is a SECOND policy, `for select
... using (true)`, and Postgres combines same-command RLS policies with OR, so the net effect is
SHARED READ, OWNER-RESTRICTED WRITE. The reason a single-column `transcripts` reference is safe
is specifically that a caller can already SEE any transcript row through ordinary SELECT — RLS
was never hiding it — so pointing at one by id via `workspace_items.transcript_id` exposes
nothing. That is also why `transcripts` happens to carry a `user_id` column at all (this file's
own ownership doc lists it among the tables with a real FK to `auth.users`) without being
owner-scoped for the purpose this law cares about: the column is real, the write-side policy
built on it is real, but the SELECT policy — the one that decides whether a stranger's row is
already visible — is not owner-shaped. The scan's own regex only recognises the owner-shaped
`using (auth.uid() = user_id)` form, and this repo's migrations never write that form for
`transcripts`' SELECT command specifically, so the scan's textual result (transcripts excluded
from `ownerScoped`) happens to land on the right answer — but for the right reason, not the
wrong one a first draft of this file gave it. That distinction is also why the scan keys on an
OWNER POLICY at all rather than on the mere presence of a `user_id` column — a column-presence
scan would have flagged `workspace_items.transcript_id` as a false positive regardless.

**One pre-existing violation predates this law and is grandfathered, not fixed, by this test:**
`quotes.folder_id → quote_folders(id)` (`supabase/migrations/20260614_010_quote_folders.sql:16`)
is single-column, and `quote_folders` does carry an owner policy (`using (auth.uid() =
user_id)`, same file, line 22). `quote_folders.user_id` itself carries no FK to `auth.users` at
all — it is one of the five tables this file's own ownership doc already names as "the bad
half" — so this table predates the ownership law entirely, not just this composite-key clause of
it. Fixing it needs a live-data migration against production `quotes`/`quote_folders`, which was
out of scope for the ticket that added this test; it is allowlisted in
`compositeChildFk.test.ts` by the exact `(file, referenced table)` pair, narrow on purpose, so a
NEW single-column FK into `quote_folders` in a later migration would still fail the battery.
