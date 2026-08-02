# Evidence — Projects backend, migration 015 applied + two-user ownership proof

**Branch:** `feat/workspace-backend` · **Date:** 2026-08-02 · **Lane M**
**Spec:** `docs/superpowers/specs/2026-08-02-projects-backend-design.md`

> Every number and every quoted error below is pasted from real command or query
> output. This file states literally what each artifact does and does **not**
> show, because a previous round's BLOCKER was exactly an evidence file asserting
> something the code did not do.

## 0. What is NOT proven here — read this first

- **The browser half is not done.** Everything below is proven at the database and
  at PostgREST with a real signed token. Nobody has yet logged into the app as
  user A, created a project through the UI, reloaded, and then failed to see it as
  user B. That needs the founder, and it is the remaining half of the two-user bar.
- **The signup path is not exercised.** User B was created in the Supabase
  dashboard by founder decision 2026-08-02, so the access-request +
  admin-approval flow is untested by this round. Recorded rather than glossed.
- **No screenshots.** Nothing visual is claimed.
- **`chat_conversations.project_id` is written by nothing yet.** The link column
  and its key exist and are enforced; no application code populates them, so
  `listProjectChats()` returns `[]` for every project today. The UI is honest
  about that (it renders the empty state).

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
