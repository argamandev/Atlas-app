# Workspace backend — design
> STATUS: SHIPPED — historical record, do not execute; current truth lives in
> ARCHITECTURE.md + PROGRESS.md

**Date:** 2026-08-03 · **Lane:** M · **Branch:** `feat/workspace-tables` (off `c27995a`)
**Chapter:** the second half of the Projects · Workspace · Agents brief — the frontend shipped
2026-08-01, the backends are the open half.

**Out of scope, stated first so nothing below drifts into them:** the vector-DB retrieval
foundation, and agent EXECUTION. Agent execution needs the product deployed and the deploy comes
after this chapter, so nothing here may depend on it.

---

## 1. What Workspace is

Founder, 2026-08-03:

> a place where a user can work on different documents he's pulling from Maya and different
> transcripts. He can see them side by side … and he can start writing this big document about
> this whole workspace.

and:

> the workspace should remember how i left it. it must not open cold every time.

So: **a reading room with an output.** A user pulls in *sources* — investor-call transcripts and
Maya/corpus documents — keeps several open side by side, and writes one document about the whole
set, citing the sources. Sources are the material; the working document is the deliverable.

Two consequences that shape every table below:

1. **Sources are heterogeneous.** A transcript is not a file. The item table holds three kinds of
   provenance, not two.
2. **Layout is data, not session state.** Which sources are open, and in what order, is stored
   and returned by the same read that returns the workspace.

Today `src/lib/workspace/data.ts` persists nothing — it is a typed stub with three demo
workspaces.

---

## 2. Facts verified against the live database

Every number and shape here came from a query on 2026-08-03, not from reading code. Two of them
would have produced a migration that fails at `CREATE TABLE`.

| Fact | Value | Why it matters here |
|---|---|---|
| `transcripts.id` type | **`text`**, not `uuid` | `workspace_items.transcript_id` must be `text`. A `uuid` column would fail the FK, and "fixing" it by dropping the FK is exactly the bad half of the schema `.claude/rules/db.md` warns about |
| transcripts | **60** (56 carry `sections`) | the abundant source available today |
| company_documents | **2** | the same Tigbur PDF under two quarters |
| document_pages | **62** | |
| transcript line ids | stable strings, `L0001`… | a citation anchor into a call is a real key, not a computed offset |
| `formatted_data` shape | `{id, date, ticker, company, quarter, duration, speakers, sections:[{id, title, lines:[{id, text, speakerId, timestamp}]}]}` | |
| `transcripts` policies | `transcripts_shared_read` — `for select to authenticated using (true)`; plus an owner `for all` | transcripts are shared corpus, readable by any member |
| transcript ownership | **30 of 60 have a `user_id`** (3 distinct owners); 30 have none | see the open item in §8 |
| server version | **PostgreSQL 17.6** | column-scoped `on delete set null (col)` is available (PG15+) |

**The ratio is the point.** 60 transcripts against 2 documents means a workspace that could only
hold documents would open onto an almost-empty shelf until Maya lands. Transcripts make Workspace
useful the day it ships, with no retrieval and no upload path.

---

## 3. Founder decisions taken during this brainstorm

| Question | Decision |
|---|---|
| What can a workspace hold? | Both — a corpus pointer **or** a private file. Extended after the 2026-08-03 clarification to include **transcripts**, making it three |
| Reuse `chat_conversations` for workspace threads? | **No — its own `workspace_threads` table.** See §7 |
| Working-document shape | **Blocks as rows, citation as a real FK** — not rich-text HTML in one field |
| Does a new workspace start with anything? | **Empty.** No seeded demo content |
| Does a workspace reopen where it was left? | **Yes.** Persisted, not session state |

---

## 4. Tables

Four tables. All four points of the ownership law (`.claude/rules/db.md`) at `CREATE TABLE`: real
FK to `auth.users(id) on delete cascade`, RLS enabled, an owner policy on **both** `using` and
`with check` granted to `authenticated`, and an index on `user_id`.

### 4.1 `workspaces`

```
id            uuid pk
user_id       uuid not null -> auth.users(id) on delete cascade
name          text not null
doc_title     text not null default ''      -- the working document's title
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
unique (id, user_id)                        -- not redundant: children reference the pair
```

**No `company_id`.** A workspace's company is DERIVED from its items at render. The stub's own
demo data proves why: one workspace reads `company: 'Tigbur Group'` and another reads
`company: '3 companies'`. A stored column could not represent the second without lying.

**No `updated_label`, `initial`, `subtitle`, `file_count`.** Those are the stub's display shapes,
not data shapes (lane rule 4). `'2h ago'` is derived from `updated_at`, the avatar initial from
`name`, the count from a join.

**When `updated_at` moves, since a derived label is only as truthful as its input.** It moves when
the workspace's *content* changes — an item attached or removed, a block written, `name` or
`doc_title` edited. It does **not** move for a pure layout change (`is_open`, `position`). Opening
and closing panes is frequent and debounced; if it bumped the timestamp, "edited 2h ago" would mean
"looked at 2h ago" and the label would be quietly false. Same reasoning as `memory_updated_at` in
`20260802_015`. Maintained in `src/lib/db/workspaces.ts`, not by a trigger, matching
`patchProject`.

### 4.2 `workspace_items` — the shelf

```
id             uuid pk
workspace_id   uuid not null
user_id        uuid not null -> auth.users(id) on delete cascade

transcript_id  text -> transcripts(id) on delete cascade
document_id    uuid -> company_documents(id) on delete cascade
storage_path   text                          -- a private upload / agent artifact

name           text not null                 -- display name, snapshotted at attach
kind           text not null check (kind in ('transcript','document','file'))
is_open        boolean not null default false -- ← side-by-side survives the browser closing
position       integer not null default 0     -- ← and so does their order
created_at     timestamptz not null default now()

check (num_nonnulls(transcript_id, document_id, storage_path) = 1)
foreign key (workspace_id, user_id) -> workspaces(id, user_id) on delete cascade
```

Plus partial unique indexes so the same source cannot be attached to one workspace twice:

```sql
unique (workspace_id, transcript_id) where transcript_id is not null
unique (workspace_id, document_id)   where document_id   is not null
```

**`position` orders ALL items, not only the open ones.** A closed source keeps its position, so
reopening it restores its place on the shelf rather than appending it to the end. The side-by-side
view renders `items.filter(is_open)` in `position` order; `is_open` and `position` are independent
facts.

**Why the composite FK to `workspaces`, restating the lesson from `20260802_015`:** PostgreSQL
referential-integrity checks **deliberately bypass RLS**, so a plain `workspace_id ->
workspaces(id)` key validates happily against a stranger's workspace that RLS makes invisible.
Putting `user_id` in the key is what makes "attach my item to someone else's workspace" fail in
the database rather than in a check we remembered to write.

**Why the corpus FKs are NOT composite:** `transcripts` and `company_documents` are shared corpus
(`docs/DATA-MODEL.md`) — they have no owner to match against, and every member may legitimately
read them. A plain FK is correct there. It still does the job that matters: the column cannot hold
an id that does not exist.

**⚠️ The corpus `on delete cascade` is a real consequence and the founder should rule on it at the
DDL gate.** Deleting a corpus transcript or document removes it from every user's workspace shelf,
silently. Two things soften it, deliberately:

- **The user's writing is never destroyed by corpus maintenance.** Blocks reference the *item*
  with `on delete set null`, so the sentence survives its source vanishing — see §4.4.
- Corpus rows are removed only by an admin/script path, and Atlas ships no such UI.

The alternative is `on delete restrict`, which makes corpus maintenance fail loudly whenever any
user has the row on a shelf. That is more honest and operationally worse. Recommendation:
**cascade**, with this paragraph copied into the migration so nobody discovers it later.

### 4.3 `workspace_threads` — chat inside a workspace

Same shape as the other children: `id, workspace_id, user_id, title, messages jsonb,
created_at, updated_at`, composite FK to `workspaces(id, user_id)`, own RLS.

### 4.4 `workspace_doc_blocks` — the working document

One working document per workspace, so blocks point straight at the workspace; there is no
document table between them. Founder decision: **blocks as rows, citation as a real FK.**

```
id              uuid pk
workspace_id    uuid not null
user_id         uuid not null -> auth.users(id) on delete cascade
kind            text not null check (kind in ('heading','text','quote'))
body            text not null default ''
position        integer not null default 0

source_item_id  uuid                -- the cited shelf item
source_label    text                -- snapshot, e.g. 'תדיראן Q4 2025 · 00:12:31'
source_page     integer             -- a document page
source_line_id  text                -- a transcript line, e.g. 'L0001'
source_quote    text                -- snapshot of the quoted words

created_at, updated_at

check (num_nonnulls(source_page, source_line_id) <= 1)
check (kind <> 'quote' or source_quote is not null)
foreign key (workspace_id, user_id) -> workspaces(id, user_id) on delete cascade
foreign key (source_item_id, user_id) -> workspace_items(id, user_id)
  on delete set null (source_item_id)      -- PG15+; the DB is 17.6
```

**`on delete set null`, never cascade — this is the load-bearing decision of the whole table.**
Removing a source from the shelf must not delete the user's writing. The surviving block with a
null `source_item_id` **is** the "visibly absent" state the lane rules require: the sentence
stays, and the citation renders as broken, showing `source_label` so the absence is *informative*
rather than a dangling marker.

`on delete set null (source_item_id)` names the column explicitly because an unqualified composite
set-null would try to null `user_id` too, which is `not null` — the statement would fail at
delete time, not at migration time. This is why §2 records the server version.

**Why `source_quote` exists — the drift problem.** `formatted_data` is regenerated when a
transcript is re-processed through Gemini, so `L0004` can come back meaning a different sentence.
The citation would still *resolve* — to the wrong words. That is precisely the failure the lane
rule names: **plausible-looking, not absent.** So rendering compares the stored quote against the
text the anchor resolves to today:

| Anchor resolves | Text matches | Rendered as |
|---|---|---|
| yes | yes | a live citation |
| yes | no | **drifted** — shows the snapshot, says the source moved |
| no | — | **absent** — shows the snapshot, says the source is gone |

It is a string comparison against a row already loaded. No retrieval, no embedding, no dependency
on the out-of-scope foundation.

---

## 5. Routes

One module, `src/lib/db/workspaces.ts`, is the only thing that touches these tables, and every
function takes the **caller's own supabase client** (`createServerSupabase(cookies())`) — never
`supabaseAdmin`. That is the `src/lib/db/projects.ts` pattern and it is the point: the service-role
key bypasses RLS, so a mistake in a filter would leak another user's workspace. Through the user's
client, Postgres refuses. The older `lib/db` modules (`conversations`, `quotes`, `transcripts`, …)
still use `supabaseAdmin`; they are not the pattern to copy.

```
GET    /api/workspaces                      list for the picker
POST   /api/workspaces                      create (empty)
GET    /api/workspaces/[id]                 workspace + items + blocks   ← the warm read
PATCH  /api/workspaces/[id]                 name, doc_title
DELETE /api/workspaces/[id]                 count-first (§6)

POST   /api/workspaces/[id]/items           attach a transcript / document / upload
PATCH  /api/workspaces/[id]/items/[itemId]  is_open, position
DELETE /api/workspaces/[id]/items/[itemId]

GET    /api/workspaces/[id]/threads
POST   /api/workspaces/[id]/threads
PATCH  /api/workspaces/[id]/threads/[threadId]

POST   /api/workspaces/[id]/blocks
PATCH  /api/workspaces/[id]/blocks/[blockId]
DELETE /api/workspaces/[id]/blocks/[blockId]
```

### 5.1 The auth shape is not optional

`src/lib/apiAuthBoundary.test.ts` (merged to main in `fix/api-security`) **auto-discovers every
handler** under `src/app/api` and fails any whose auth result is not bound to a variable *and*
acted on. New routes are covered the moment they exist — nothing to register. The accepted shape,
which `/api/projects/route.ts` already uses:

```ts
const supabase = createServerSupabase(cookies())
const user = await resolveUser(supabase)
if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
```

Stated limit, from that test's own header: it proves each handler resolves a caller and has a
refusal path — **not** that the caller may touch the specific row it goes on to read. Ownership
filtering is a separate obligation, and here it is discharged by querying through the user's
client so RLS enforces it.

### 5.2 "It must not open cold" is one GET

`GET /api/workspaces/[id]` returns the workspace, its items **with `is_open` and `position`**, and
the document's blocks in order. One round trip, so the server's first paint already shows the room
as it was left — no second fetch, and no flash of an empty workbench.

That last part is deliberate. The empty-state flash filed against `ChatHistory` in
`docs/evidence/fix-projects-honesty/` is the same bug — a confident empty state that is not yet
true — and this surface must not ship with it.

### 5.3 The layout write is small

Opening a source, closing it, dragging one before another: each is a `PATCH` of one row's
`is_open`/`position`, debounced, never a save of the whole workspace. A reorder sends only the rows
whose position actually changed.

---

## 6. Deleting, and the count-first obligation

Lane rule 3: the first delete UI anywhere, including Workspace's, must show the count of what it
is about to destroy **before** it destroys it. Deleting a workspace cascades to its items, its
threads (whose `messages` are inline `jsonb`, so the history goes with the row) and its blocks —
the entire working document.

So `src/lib/db/workspaces.ts` ships `countWorkspaceContents(supabase, id)` returning
`{items, threads, blocks}`, and the delete path must call it first. As with projects, `DELETE` is
already reachable without any UI — the `for all` owner policy covers it, so an owner can delete
straight through PostgREST with the browser's anon key. The helper exists so the obligation is one
call away rather than one thing to remember.

---

## 7. Why `workspace_threads` rather than reusing `chat_conversations`

The founder chose this against my recommendation, and he was right. Verified afterwards:
`chat_conversations` stores `messages` as an inline `jsonb` column, has `user_id NOT NULL` **with
no foreign key at all**, and carries 7 rows whose owner no longer exists in `auth.users` — which is
also why `20260802_015` could not give it a key. Reusing it would have made Workspace inherit that
shape permanently. A separate table lets Workspace be built on the good pattern: real FK, RLS,
owner policy on both sides, composite key to its parent.

Cost: `/api/chat` is stateless, so a workspace thread needs its own persistence path. That is a
route, not a redesign.

---

## 8. Replacing the stub

`src/lib/workspace/data.ts` keeps its display **types** and loses its three demo workspaces. A
mapper turns rows into those shapes, deriving every label at render: `updatedLabel` from
`updated_at`, `initial` from `name`, `company` from the items, the file count from a join. The
stub's transient `live?: boolean` — "the file the workspace is currently centred on" — is replaced
by the persisted `is_open`/`position` pair.

`src/lib/demo/seedDocument.ts` is **not** persisted. It contains a fabricated Hebrew quote
attributed to a named real TASE executive; founder decision is that it does not enter the database.
A quote taken from a real transcript line is a real citation, so with transcripts on the shelf
there is nothing left to fabricate.

---

## 9. Open item, inherited — not introduced by this chapter

`transcripts_shared_read` (`for select to authenticated using (true)`, from migration
`20260801_014`) means every signed-in member can already read every transcript. **30 of the 60
have an owner**, across 3 users; the other 30 have none. So a workspace lets a user attach a call
another user personally uploaded through the old Timlul YouTube flow.

This chapter neither introduces nor changes that — it is the shared-corpus decision in
`docs/DATA-MODEL.md`. It is filed here because "pull in any transcript" is the first surface that
exercises it at scale, and if those 30 personal uploads were never meant to be corpus, the place to
decide is before Workspace makes them browsable. **Awaiting a founder ruling; no code here depends
on the answer** — if the answer is "personal uploads are not corpus", the fix is a policy change on
`transcripts`, not a change to any table above.

---

## 10. Verification bar

The lane bar is **two users, not one**. An ownership feature verified with a single account is not
verified.

**Milestone:** a user signs in, creates a workspace, puts a real transcript in it, writes in the
working document with a citation pointing at a real line, closes the browser, comes back — and it
is all still there, still theirs, and provably invisible to another account.

1. **User A** creates a workspace, attaches a transcript, opens two sources side by side, writes a
   citation block.
2. **Reload, and reopen from cold** — a fresh browser session. Same sources open, same order. This
   is the "must not open cold" proof and it needs a genuinely new session, not an F5.
3. **User B** signs in: the workspace is absent from the list, and `GET /api/workspaces/<A's id>`
   returns 404 (not 403 — RLS makes it *not there*, which is the correct answer).
4. **The anon key directly**, outside the app: `select * from workspaces` through PostgREST with
   the publishable key returns zero rows. Proving RLS only through the app proves the app's
   filters, not the policy.
5. **Both locales.** Alignment is physical (`ml-auto`, `rounded-br`); direction is not (`dir="auto"`
   / `<bdi>` stay). A line mixing Hebrew and Latin — a Hebrew workspace name beside a `L0001`
   anchor or a `.pdf` name — gets `<bdi>` per run, never `dir` on the line.
6. **A broken citation is photographed**, in both locales, in the state where its source was
   removed. The gate's standing complaint about this branch's predecessor was that error paths
   were written blind; the drifted/absent citation is this chapter's error path.

Evidence goes to `docs/evidence/feat-workspace-tables/`.

---

## 11. Build order

DDL is reviewed **before** it is applied (`.claude/rules/db.md`) — narrowing a policy afterwards
needs `DROP`/`ALTER`, both hook-blocked, so a reviewer verdict of "narrow that policy" is
unactionable once it is live.

1. Write `supabase/migrations/20260803_016_workspaces.sql` as a **file**. Do not apply.
2. Push the branch; run the reviewer **on the file**; founder rules on the cascade in §4.2 and the
   open item in §9.
3. Append to `agent-memory/cross-cutting.md`, **then** apply.
4. `src/lib/db/workspaces.ts` — user client throughout.
5. Routes, in the §5.1 shape.
6. Replace the stub; wire the warm read.
7. Verify to the §10 bar; evidence; `/ship`; append to the ready queue. Never push main.
