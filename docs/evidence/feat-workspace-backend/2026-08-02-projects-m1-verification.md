# Evidence — Projects backend, migration 015 applied + two-user ownership proof

**Branch:** `feat/workspace-backend` · **Date:** 2026-08-02 · **Lane M**
**Spec:** `docs/superpowers/specs/2026-08-02-projects-backend-design.md`

> Every number and every quoted error below is pasted from real command or query
> output. This file states literally what each artifact does and does **not**
> show, because a previous round's BLOCKER was exactly an evidence file asserting
> something the code did not do.

## 0. What is NOT proven here — read this first

- ~~**The browser half is not done.** Everything below is proven at the database and
  at PostgREST with a real signed token. Nobody has yet logged into the app as
  user A, created a project through the UI, reloaded, and then failed to see it as
  user B. That needs the founder, and it is the remaining half of the two-user bar.~~
  ✅ **CLOSED 2026-08-02 — see §12.** Done in the founder's own signed-in Chrome:
  his account lists exactly one project while the database holds two across two
  owners, so B's is invisible to him through the app, not just through PostgREST.
- **The signup path is STILL not exercised.** User B was created in the Supabase
  dashboard by founder decision 2026-08-02, so the access-request +
  admin-approval flow is untested by this round. Recorded rather than glossed.
- ~~**No screenshots.** Nothing visual is claimed.~~ ✅ **CLOSED — §12**, three
  committed under `shots/`, both locales, with what each does and does not show.
- ~~**`chat_conversations.project_id` is written by nothing yet.** The link column
  and its key exist and are enforced; no application code populates them, so
  `listProjectChats()` returns `[]` for every project today. The UI is honest
  about that (it renders the empty state).~~

> **CORRECTION — supervisor, 2026-08-02, at merge.** The struck bullet was true when
> this file was written and **false three commits later**, which is why it is struck
> here rather than quietly reworded: an evidence file that has been wrong must show
> that it was.
>
> Commit `9f5da70` wires the write. `ChatView` → `POST /api/conversations` →
> `createConversation()` stamps `project_id` on every conversation started inside a
> project, and `listProjectChats()` returns real rows. Commit `1b3ac49` then made
> those rows openable. So the column is populated, the chats are reachable, and the
> founder-countersigned `ON DELETE CASCADE` is **live on user-visible content**.
>
> **What that means in plain language, because the cascade was countersigned against
> the description above rather than against this one:** deleting a project now
> permanently deletes every conversation held inside it. At the time of signing,
> the stated model was that no such conversation could exist. It can. The database
> constraint is already applied and is not reversible without hook-blocked SQL, so
> this correction exists to make the consent informed after the fact — the founder
> was asked to re-confirm at merge (`agent-memory/cross-cutting.md`, 2026-08-02).
>
> ~~**Still not exercised:** no artifact in this file deletes a project that owns a
> chat and shows the result. That remains owed, and it is the one claim about the
> cascade that is asserted from the schema rather than demonstrated.~~
>
> ✅ **CLOSED — Lane M, 2026-08-02, after the merge.** It is exercised in §11: a
> project holding a real note and a real conversation, deleted, in a transaction
> that rolls back. And the write path is now measured rather than reasoned about:
>
> ```
> conversations_with_project        4      -- written by real app traffic
> project_chats_owner_matched       4      -- every one owned by its project's owner
> project_chats_with_real_messages  4      -- max 2 messages, i.e. real exchanges
> global_recents_rows              22      -- project_id IS NULL, untouched
> ```

## 1. The gate ran before the migration was applied

`rules/db.md` requires DDL against this production-shared database to be reviewed
as a file first. It was, and it paid for itself — the reviewer found that the
chat link's comment asserted an ownership chain the SQL did not enforce.

Verdict and findings: `ready-queue.md` `[2026-08-02] VERDICT supervisor/feat-workspace-backend @9d89bd5`.
Applied only after the required edit landed (`4266b64`) and the founder
countersigned the cascade.

## 2. Applied shape, queried rather than assumed

Policies:

```
tablename        | policyname             | cmd | qual                   | with_check             | roles
project_sources  | project_sources_owner  | ALL | (auth.uid() = user_id) | (auth.uid() = user_id) | {authenticated}
projects         | projects_owner         | ALL | (auth.uid() = user_id) | (auth.uid() = user_id) | {authenticated}
```

Both sides present, granted to `authenticated` — not `public`, and not the
banned `USING (true)` shape.

Constraints:

```
chat_conversations | chat_conversations_project_fk | FOREIGN KEY (project_id, user_id) REFERENCES projects(id, user_id) ON DELETE CASCADE
project_sources    | project_sources_project_fk    | FOREIGN KEY (project_id, user_id) REFERENCES projects(id, user_id) ON DELETE CASCADE
project_sources    | project_sources_user_id_fkey  | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
projects           | projects_id_user_id_key       | UNIQUE (id, user_id)
projects           | projects_user_id_fkey         | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
```

Both composite keys are in place — the `chat_conversations` one is the gate's
required edit.

## 3. The shared table survived intact

```
convs_total | convs_unlinked | projects | sources | pg_version
19          | 19             | 0        | 0       | 17.6
```

All 19 pre-existing conversations still there, all with `project_id IS NULL`, so
`MATCH SIMPLE` validates every one of them — including the 7 whose owner no
longer exists in `auth.users`. Timlul is unaffected: it cannot reference a column
that postdates its code.

## 4. Ownership isolation, forced-context proof

Users: **A** = `74ef4fbf…` (`sagi.arg@gmail.com`) · **B** = `52641cad…`
(`barelyknowingyou@gmail.com`, created 2026-08-02 00:19).

A project was created **as B**, through an authenticated context so `WITH CHECK`
was exercised on the way in: `a2345bd1-28c4-4b23-8ae8-65c88afb3e32`.

| perspective | `select count(*) from projects` |
|---|---|
| B (the owner) | **1** — `RLS proof — owned by user B` |
| A (the founder) | **0** |
| `anon` | **0** |

## 5. The three attacks, all refused by the database

**B writing a row owned by A** — refused by `WITH CHECK`:

```
ERROR: 42501: new row violates row-level security policy for table "projects"
```

**A attaching a chat to B's project** — refused by the composite key:

```
ERROR: 23503: insert or update on table "chat_conversations"
violates foreign key constraint "chat_conversations_project_fk"
DETAIL: Key is not present in table "projects".
```

**Why that second one is the whole point of the gate.** PostgreSQL
referential-integrity checks deliberately bypass RLS, so the original
single-column key would have validated against a row RLS hides. Demonstrated
directly, in a transaction that was rolled back (0 probe tables remain):

```
a_can_SEE_bs_project | a_could_REFERENCE_bs_project
0                    | 1
```

User A cannot see B's project, but through a single-column foreign key A
**could** reference it. That is the defect the gate caught, reproduced.

## 6. Same proof again with a REAL SIGNED JWT

§4–5 force the identity with `set local request.jwt.claims`, which proves the
policy logic but simulates the user. This run uses a genuinely signed token, the
anon key, and PostgREST — the same door the browser uses. B's session was
obtained without a password (`admin.generateLink` → `verifyOtp`), per the
founder + supervisor credential rule.

Script: `scripts/verify-rls-two-user.ts` (re-runnable; prints no token values).

```
=== REAL SIGNED JWT FOR USER B (no password used anywhere) ===
user id      : 52641cad-f85b-4b8d-95ee-aad0ed16194c
email match  : true
token length : 800 (value deliberately not printed)

=== WHAT B SEES THROUGH A REAL TOKEN ===
rows visible : 1
  - RLS proof — owned by user B  (owner B ok)
rows NOT owned by B: 0 (correct)

=== B WRITING A ROW OWNED BY A, VIA A REAL TOKEN ===
refused      : YES
reason       : new row violates row-level security policy for table "projects"

=== ANON KEY (the one that ships in the browser bundle) ===
rows visible : 0
```

## 7. The application reaches the tables

Before the migration, the running app returned `500` with
`Could not find the table 'public.projects' in the schema cache` — rendered
honestly in the UI as *"Could not load your projects — …"* rather than as an
empty list. After applying:

```
unauth GET /api/projects -> HTTP 401
{"error":"unauthorized"}
```

`401`, not `500`: the route resolves the table and gates on the verified user.
This shows the endpoint is reachable and auth-gated. It does **not** show a
successful authenticated read — that is the browser half in §0.

## 8. Battery

`191/191 · tsc clean · build green`, all four `/api/projects` routes compiled,
Middleware 81.8 kB intact. Counts pasted from `npm test` / `npm run build`.

## 9. Obligations from the cascade decision

The founder chose `on delete cascade` knowingly: deleting a project deletes its
conversations, and because `messages` is inline `jsonb` that destroys history
rather than unlinking it.

1. **The delete path must show how many conversations it will destroy, first.**
   Atlas ships no delete affordance, but DELETE is already reachable through
   PostgREST via the `for all` owner policy. `countProjectChats()` exists in
   `src/lib/db/projects.ts` so the obligation is one call away, and the migration
   comment points any future delete path at it.
2. **The migration comment now states plainly that project deletion deletes
   chats** — one clause governs two very different events, and it previously
   described only account deletion.

## 10. Carried, not closed

- No `updated_at` trigger: only two code paths maintain it, so a future writer
  could silently make "2h ago" a lie. Left for its own review because it changes
  runtime behaviour.
- `position` on `project_sources` is written by nothing yet.
- Raw Postgres error text reaches the UI (useful now, should become a plain
  sentence with detail in the server log before launch).
- Test artifact `a2345bd1…` ("RLS proof — owned by user B") is left in place so
  the browser half can use it. It belongs to the test account, not the founder's.
## 11. The cascade, actually exercised (added 2026-08-02, closes the BLOCKER)

§9 described the cascade. Describing it is what let it be countersigned against a
world where nothing wrote `project_id` — so here it is run, on the real database,
inside a transaction that **rolls back**, with a project holding a real note and a
real conversation. The owner is picked by the database (`select id from auth.users
order by created_at limit 1`) so no live user id enters a script or a transcript.

Appended to `cross-cutting.md` before touching the database, per `rules/db.md`.

```
stage  | project_rows | source_rows | conversation_rows
-------+--------------+-------------+------------------
BEFORE |            1 |           1 |                 1
AFTER  |            0 |           0 |                 0
```

`conversation_rows` is counted **by the conversation's own id**, not by
`project_id` — so this shows the row was DESTROYED, not unlinked. Its `messages`
jsonb went with it. That is the sealed-container model the founder chose, and it
is now demonstrated rather than described.

Rollback confirmed by a separate query afterwards: `leftover_projects 0 ·
leftover_conversations 0 · leftover_sources 0`. Nothing was committed.

**What this obliges, restated because it is now proven rather than theoretical:**
Atlas still ships no delete affordance, so no user can reach this today. The
first one that exists must show the count from `countProjectChats()` before it
deletes, or it silently destroys chat history — `rules/app.md`, degradation must
be visible.

## 12. The signed-in browser pass (added 2026-08-02 — the half that was owed)

§0 said "the browser half is not done" and "no screenshots". Both are now closed.
Driven through the founder's own signed-in Chrome, which is the sanctioned path
(`/verify-app`): no password, no magic link, no credential anywhere.

His browser is set to **Hebrew**, so this pass is the RTL one for free; EN was
checked by toggling the locale and toggling back (verified after:
`htmlDir rtl · htmlLang he · locale=he`).

**Authenticated, not redirected.** `GET /app/chat/projects 200` in the dev log —
a 307 would have meant an anonymous probe and a worthless screenshot, which is
the false pass the login gate has produced twice.

| Claim | What was seen |
|---|---|
| The project page renders at all | `/app/chat/projects/[id]` **200**, full render. The Server-Component crash that 500'd every project page is gone. |
| **Isolation, through a browser** | The founder's account lists **exactly one** project — his own — while the database holds **2 across 2 distinct owners**. User B's project is invisible to him. This is the browser half of the two-user bar. |
| Persistence | `RECENTS 4`, matching `conversations_with_project = 4` in the database, with real titles and derived times. |
| A project chat is reachable | Clicking a Recents row **opened the conversation** and loaded its messages. Those rows were inert `<div>`s at `@904030a`, and they are the only route back in. |
| The bubble side | The user bubble sits on the **physical right in the Hebrew RTL interface** — main's founder decision (`bff0242`) survives this branch's merge. Hebrew reads RTL inside it. |
| Degradation is visible | Real send, real answer, and under it: *"ההקשר של הפרויקט היה ארוך מדי ונחתך, ולכן אטלס לא ראה את כולו."* in the alert colour. |
| The source count | `0 מקורות בהקשר` / `0 sources in context` on a project with no sources — the count now follows the injector, not the row list. |
| Console | Zero errors, zero exceptions. |

Screenshots (durable, in this folder): `shots/2026-08-02-project-page-he.jpg` ·
`shots/2026-08-02-project-page-en.jpg` ·
`shots/2026-08-02-project-chat-truncation-notice-he.jpg`.

**Stated plainly, because how a thing was verified matters as much as the result:**

- The `x-project-context: failed` path was proven against the **real server** — a
  `POST /api/chat` carrying a nonexistent project id returned `200` with
  `x-project-context: failed`, i.e. the model answered and the server said so.
- The **rendering** of that notice was exercised by patching `window.fetch` in the
  page to set the header on an otherwise real response, then sending a real
  message through the real composer. The React path, the dictionary lookup and
  the RTL layout are therefore genuinely verified; the specific pairing of a
  server-side failure with its own rendered notice in one continuous run is not.
  The two halves are each proven, the seam between them is inference.
- This pass appended one real exchange ("שלום") to one of the founder's own
  project conversations. It is his account and his project; recorded rather than
  glossed.

## 13. Second fix round — the two WARNINGs from the merge verdict (@1b3ac49)

The merge went in with known debt. Two items on its NEXT list were the founder's
stated red line — the UI must not say something untrue — and both are closed
here, verified in the browser rather than reasoned about.

**`ChatView.tsx:381` — a dead click on an empty conversation.**
`{embedded && messages.length === 0 ? embedded : content}` keyed the whole
decision on message count, so opening a conversation that resolves with ZERO
messages re-rendered the project page unchanged: no navigation, no error,
nothing. Such rows are genuinely creatable — `db/conversations.ts` inserts the
row before the first exchange is saved, so a failure in between leaves a real,
permanently dead row in a project's list, and that row is the only route to it.
Now gated on a separate `conversationOpen` flag set only after a SUCCESSFUL
fetch, so opening one always lands you in the conversation with a composer.

Seen: `shots/2026-08-02-empty-conversation-opens-he.jpg` — the click that
previously did nothing now shows the chat surface (greeting, composer,
suggestions). Produced by patching the conversation fetch to resolve with
`messages: []` against an otherwise real request, so **no empty row was created
in the founder's project** to stage it.

**`ProjectView.tsx:210-218` — the banner showed the wrong failure.** It picked
`saveError` first and neither path cleared the other's state, so an open failure
arriving after a save failure rendered the SAVE sentence carrying the OPEN
error's text — wrong in both halves — and the open failure was invisible. Both
are now rendered, each with its own line; there is no precedence left to get
wrong, and the `||`/`??` mismatch that made an empty-string error render a
dangling em dash went with it.

Also in this round, from the same verdict's NITs: `ChatHistory` typed `onOpen` as
returning `void` and called it uncaught, so a failure in the global sidebar was
an unhandled rejection with a row that appeared to do nothing — the same
silent-failure class as the project rows, one panel over. It now catches and
shows the same `ErrorLine`. And `ErrorLine` itself no longer drops the tail of a
two-placeholder template or jams the error onto a template with none.

Battery after this round: **201/201 · tsc exit 0**.
