# Spec — Projects backend: persistence + ownership (2026-08-02)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in
> ARCHITECTURE.md + PROGRESS.md

> **Status:** design APPROVED by the founder 2026-08-02 in the Lane M brainstorm. Chapter:
> "make Workspaces, Projects and Agents real". This spec covers **Projects only** — the first
> of the three, by founder decision the same day.

## 1. The one-sentence goal

A project a user creates today is still theirs tomorrow, and is provably invisible to any other
account.

## 2. Founder decisions this spec encodes

All four were taken in the 2026-08-02 brainstorm and are filed in `agent-memory/cross-cutting.md`.

| # | Decision | Rejected alternative |
|---|---|---|
| 1 | **Projects is the FIRST backend**, ahead of Workspace and Agents | Workspace first (what Milestone 1's wording names); all three in one migration |
| 2 | A project's context layer is **typed notes only** | User file uploads; pinning existing Atlas documents |
| 3 | Instructions and memory are **both user-written** | Atlas auto-accumulating memory after each chat |
| 4 | Project sources **get a real body** the user types into | Cutting sources; storing name-only rows with no content |

Decision 4 carries a consequence worth stating plainly: it needs a textarea that does not exist in
Lane F's imported UI. It is a small addition following the existing instructions/memory
edit-and-save pattern — not a redesign.

## 3. Scope

**IN**
- The `projects` and `project_sources` tables, with ownership and RLS correct at `CREATE TABLE`.
- A `project_id` link on the existing `chat_conversations`.
- API routes for create / read / update of projects and their sources.
- Real read/write paths replacing the `src/lib/projects/data.ts` stub.
- The `getSession()` → `getUser()` auth fix (its own commit — see §8).
- Injecting a project's context into chats inside that project (§7).
- A source-body editor in `ProjectView` (consequence of decision 4).

**OUT** — explicitly, and none of these may be designed into as a dependency
- Workspace and Agents backends (later chapters this one deliberately unblocks).
- The Maya/TASE integration — the founder connects that API separately.
- The vector-DB retrieval foundation — approved, but its own chapter.
- Agent execution — an agent is a saved definition, not a running process.
- File uploads and pinned corpus documents (decision 2).
- Atlas-written project memory (decision 3).
- **Deleting** a project or a source: the imported UI has no such affordance. Recorded as a known
  gap in §11 rather than invented here.

## 4. Schema

Both new tables satisfy all four points of the Ownership law (`.claude/rules/db.md`) at creation,
because retrofitting ownership on this database means a backfill dance on live shared data.

```sql
create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  pinned            boolean not null default false,
  instructions      text not null default '',
  memory            text not null default '',
  memory_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id)
);

create table public.project_sources (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  body        text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);
```

### Why the composite foreign key

`unique (id, user_id)` on `projects` looks redundant beside the primary key, and for uniqueness it
is — `id` alone already guarantees it. It is there because a foreign key must reference a uniquely
constrained column set, and `project_sources` references the **pair**. Without it the composite key
below cannot be created. It is deliberate, not a leftover.

`project_sources` carries **both** its own `user_id` and a key to its parent. The Ownership law
permits either route; carrying both buys two things:

1. RLS stays a plain column comparison — no subquery per row.
2. The composite key `(project_id, user_id) → projects(id, user_id)` makes it **impossible at the
   database level** for a note's owner to differ from its project's owner. Not "the app checks it".

That is the same instinct as the foreign key `chat_conversations` never got — applied where it
still can be. See §10.

### RLS

```sql
alter table public.projects        enable row level security;
alter table public.project_sources enable row level security;

create policy projects_owner on public.projects
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy project_sources_owner on public.project_sources
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index projects_user_id_idx           on public.projects (user_id);
create index project_sources_project_id_idx on public.project_sources (project_id);
create index project_sources_user_id_idx    on public.project_sources (user_id);
```

Granted to `authenticated`, not `public`. `WITH CHECK` as well as `USING`, so a row cannot be
written to someone else's id. This is deliberately **not** the `USING (true)` shape banned in
`rules/db.md`, and deliberately not the legitimate shared-corpus read shape either — Projects is
personal-layer data per `docs/DATA-MODEL.md`.

### The link on `chat_conversations`

> **⚠️ SUPERSEDED AT THE DDL GATE, 2026-08-02.** The single-column key below was **rejected**
> before it was ever applied: `project_id → projects(id)` does not constrain *whose* project it
> is, so a row could point at another account's project and the "ownership chain" this section
> claimed would be unenforced. The applied migration (`20260802_015_projects.sql:130-143`) uses
> a **composite** key instead. This block is kept as the record of what was designed and why it
> changed — read the migration, not this snippet.

**What was designed (rejected — DO NOT RUN):**

Every line below is commented out on purpose. It was previously published as live,
copy-pasteable SQL sitting under a line reading `-- APPLIED (migration 20260802_015)`,
which is two untruths at once: this shape was never applied, and the database it would
have run against is shared with deployed production Timlul. `~~strikethrough~~` does not
render inside a fenced block, so the only safe way to publish rejected DDL is to make it
non-executable.

```sql
-- REJECTED AT THE DDL GATE — NOT APPLIED, NOT SAFE TO RUN.
-- The single-column key does not constrain WHOSE project is referenced.
--
-- alter table public.chat_conversations
--   add column project_id uuid references public.projects (id) on delete cascade;
```

**What was actually applied** (`20260802_015_projects.sql:129-146`) — the column bare, then
the composite key separately, because `add column if not exists` cannot carry one:

```sql
alter table public.chat_conversations
  add column if not exists project_id uuid;

create index if not exists chat_conversations_project_id_idx
  on public.chat_conversations (project_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_conversations_project_fk'
  ) then
    alter table public.chat_conversations
      add constraint chat_conversations_project_fk
      foreign key (project_id, user_id)
      references public.projects (id, user_id)
      on delete cascade;
  end if;
end $$;
```

*(Transcribed from `20260802_015_projects.sql`, not from memory — a first pass at this block
invented the constraint name `chat_conversations_project_owner_fkey`, which does not exist.)*

**What was applied:** a bare nullable `project_id` column plus a two-column foreign key
`(project_id, user_id) → projects (id, user_id)`, which is why `projects` carries the otherwise
redundant `projects_id_user_id_key unique (id, user_id)` (a foreign key must reference a uniquely
constrained column set). `MATCH SIMPLE` — the default — lets a NULL `project_id` satisfy the
constraint, so the 19 pre-existing rows are unaffected. The pair makes it impossible to file a
conversation under a project belonging to someone else: the database checks both halves.

`ADD COLUMN` is additive and allowed. The column is nullable: all 19 existing rows predate
Projects and stay unaffected, which also keeps Timlul (which shares this table) working — it
simply ignores a column it does not select. `MATCH SIMPLE` skips a NULL `project_id`, so every
existing row validates, including the 7 whose owner no longer exists.

**Ownership of a project chat runs through the project, not through `chat_conversations.user_id`.**
That table's `user_id` has no foreign key and cannot be given one (§10), so the design does not
lean on it: the composite key ties the pair to `projects (id, user_id)`, and `projects.user_id`
is a real FK to `auth.users(id)`. If an account is ever removed, its projects and their chats go
with it — the exact failure that left 7 orphan rows behind.

**Founder decision, 2026-08-02:** `ON DELETE CASCADE` was countersigned, i.e. **deleting a project
permanently deletes every conversation inside it.** It was signed against a description in which
no such conversation could exist yet; commit `9f5da70` made them real and `1b3ac49` made them
reachable, so the consent was re-confirmed at merge. See the CORRECTION block in
`docs/evidence/feat-workspace-backend/2026-08-02-projects-m1-verification.md`.

`chat_conversations` already has RLS enabled with `chat_conversations_owner` (`ALL`,
`auth.uid() = user_id` on **both** `USING` and `WITH CHECK`), verified 2026-08-02. Project chats
are therefore protected the moment they exist. Reads that list a project's chats still filter on
`project_id` **and** `user_id`, so a row whose two owners disagree can never surface.

## 5. Facts are stored; labels are derived

The stub types are display shapes. Persisting them would freeze a relative label in the database
forever. Every row below is computed at render from the columns in §4.

| Stub field | Source of truth | Rendered as |
|---|---|---|
| `updatedLabel` | `updated_at` | "2h ago" |
| `memWhen` | `memory_updated_at` (`null` ⇒ never) | "Last updated 2 days ago" / "Never updated" |
| `capacity` | characters used ÷ budget (§7) | "14% of project capacity used" |
| `meta` (`"6 lines"`) | the note's own `body` | "6 lines" |
| `kind` (`XLSX`/`PDF`/`TEXT`) | constant `TEXT` this chapter | the TEXT badge |
| `subtitle` | `name` + counts | composed |

`kind` gets **no column**. When pinned corpus documents arrive they get their own table
referencing `company_documents` — a real relationship, not a discriminator string that would let a
row claim to be a PDF while holding nothing.

## 6. Modules and their boundaries

| Module | Purpose | Depends on |
|---|---|---|
| `src/lib/db/projects.ts` | the only place that talks to the two tables | supabase client, types |
| `src/lib/projects/data.ts` | unchanged public shape, now backed by the DB | `db/projects.ts` |
| `src/lib/projects/derive.ts` | pure label derivation (§5), no I/O, no React | nothing |
| `src/app/api/projects/**` | HTTP surface, auth, validation | `db/projects.ts` |
| `src/components/projects/**` | rendering + the new source-body editor | the API |

`derive.ts` being pure and DOM-free is what lets the label rules be unit-tested under `node:test`
(this repo has no DOM test infrastructure), the same constraint `src/lib/demo/reducer.ts` works to.

**The routes query with the user's own session client (`createServerSupabase`), not
`supabaseAdmin`.** Verified 2026-08-02: that client uses the anon key plus the request cookies, so
`auth.uid()` resolves and RLS is enforced. This is a deliberate departure from the existing routes,
which use the service-role client and therefore bypass RLS entirely. It means a mistake in a
`WHERE` clause cannot leak another user's project — the database refuses it. RLS becomes
load-bearing rather than decorative, which is the whole point of the chapter.

## 7. Context injection, and the budget that makes `capacity` honest

A project's `instructions`, `memory` and source bodies are injected into every chat inside that
project. This is direct injection, not retrieval — the founder brief says so explicitly, and the
supervisor's read agrees the user-written layer is small enough not to need RAG. Cross-archive
retrieval remains out of scope and unaffected.

`PROJECT_CONTEXT_BUDGET` is a real character ceiling enforced in the injection path. `capacity` is
that ratio. Two consequences that are requirements, not nice-to-haves:

- If a project exceeds the budget, the UI **says so**. It must never silently truncate the user's
  instructions and answer anyway — that is the silent-degradation class in `.claude/rules/app.md`.
- If injection is cut for time, the instructions/memory UI must state that they are not yet applied.
  Stored-but-ignored instructions are the same defect wearing a different hat.

**Amended 2026-08-02 after review.** "That ratio" has to mean the ratio of what is actually sent,
not of the raw fields — the first implementation summed `instructions + memory + bodies` and missed
the framing header, the label line per section and every source name, so a project could read 97%
while the server was already cutting it, and the over-capacity warning never fired for the people
who needed it. The meter now calls `buildProjectContext()` itself and reads its `fullLength`, so
the number the user sees and the number the server enforces are one function and cannot drift.
Two further consequences of the same principle, both now implemented:

- A note with an empty body is skipped by the injector, so it is neither charged to the budget nor
  counted in "*n* sources in context". Clicking **+** used to raise that count without changing
  anything the model received.
- Truncation and a failed context load are both reported to the client on `x-project-context` and
  rendered on the answer itself. The first version set a header no client read, which is
  indistinguishable from not reporting at all.

## 8. The auth fix — separate commit, founder awake

`getSession()` reads the user out of the cookie: a shape check plus an `expires_at` the cookie
itself supplies. No signature check, no network call. A forged cookie carrying a known user UUID
passes, and the routes then query with `supabaseAdmin`, which bypasses RLS. Every table this spec
creates is per-user data behind RLS, and RLS is worth nothing when the user id is attacker-supplied.

The fix is `getUser()`, which revalidates the token against Supabase — exactly what
`src/middleware.ts` already does.

**Four call sites, not three** (verified 2026-08-02; the board and the brief both say three):

1. `src/lib/auth.ts:23` — `getRequestUserId`
2. `src/lib/auth.ts:40` — `getCurrentUser`
3. `src/app/api/admin/requests/route.ts:8` — a local `requireAdmin`
4. `src/app/api/transcripts/[id]/route.ts:132` — a second, separate local `requireAdmin`

It changes the auth path of every authenticated request, so: its own commit, its own tests, and
surfaced to the founder before it lands. Known cost: `getUser()` makes a network call per request
where `getSession()` did not. Correctness first; if latency shows up it is measured, not guessed at.

## 9. Testing and the verification bar

Unit tests (`node:test`, added to the explicit list in `package.json` — this repo's `test` script
is a file list, not a glob):

- `derive.ts` — every row of §5, including `memory_updated_at = null` → "Never updated", and the
  over-budget case.
- Validation of the API payloads.
- Injection: budget enforcement and the over-budget signal.
- The auth fix: a forged/invalid token is rejected where `getSession()` would have accepted it.

**The bar is TWO USERS, not one.** An ownership feature verified with a single account is not
verified. Evidence goes to `docs/evidence/feat-workspace-backend/`.

1. As user A: create a project, add instructions/memory/a note, reload, confirm it survived.
2. As user B: confirm A's project is not visible.
3. **Prove RLS at the database, not only through the app** — query as the `anon` key, and with a
   second user's JWT claims set, confirming zero rows. The app agreeing with itself is not proof;
   a route could be filtering correctly while RLS is off.

**Known dependency:** step 2 needs a second real account. Only 3 exist in `auth.users`, all the
founder's. Creating a test account on a database shared with production Timlul is the founder's
call, not the lane's — flagged, not assumed. Step 3 needs no new account and runs regardless.

## 10. What this spec does not fix, and why

`chat_conversations` holds 19 rows; **7 belong to an account that no longer exists in
`auth.users`** (created Jun 14–16 2026, one distinct id). Verified by query 2026-08-02 and filed to
cross-cutting. That is the concrete cost of the missing foreign key `rules/db.md` calls the "bad
half" — a real key with cascade-on-removal would have taken them with the account.

The key **cannot** be retrofitted: it would fail against those 7 rows, and clearing them is
destructive, hook-blocked, and the table is shared with Timlul production. So the design routes
around it (§4) rather than inheriting it. The rows are inert under RLS — `auth.uid()` never equals
a nonexistent id — and no lane should act on them without the founder and a Timlul check.

## 11. Known gaps carried out of this chapter

- No delete for projects or sources (the imported UI has no affordance; §3).
- Non-project chats keep the weak `chat_conversations` shape. Pre-existing, not created here.
- `kind` is always TEXT until pinned corpus documents get their own table.
- Workspace and Agents still persist nothing — unchanged by this chapter, and their surfaces must
  not start claiming otherwise.

## 12. Process constraints this chapter runs under

- **DDL is reviewed BEFORE it is applied** (`rules/db.md`). The migration file is written, the
  branch is pushed, the reviewer runs on the file, and only then is it applied. A verdict of
  "narrow that policy" arrives unactionable if the policy is already live, because narrowing needs
  `DROP`/`ALTER` and both are hook-blocked. The 2026-08-01 migration inverted this gate; this one
  does not.
- APPEND to `agent-memory/cross-cutting.md` before applying, and before changing any shared type.
- Lanes never push `main`. Finish via `/ship`, append to the ready queue.
