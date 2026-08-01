# Evidence — `fix/transcripts-shared-corpus` (migration `20260801_014`)

Verification of the one branch in this repo that mutated a database shared with deployed
production. Every figure below is pasted query output, not recalled. Queries were read-only,
run through the sanctioned Supabase MCP.

## 1. The policy set on `public.transcripts` after applying

```
policyname               | permissive | cmd    | roles           | comment
-------------------------+------------+--------+-----------------+--------------------------
transcripts_shared_read  | PERMISSIVE | SELECT | {authenticated} | "Shared corpus: any signed-in
                         |            |        |                 |  user may read any transcript…"
users see own transcripts| PERMISSIVE | ALL    | {public}        | null
```

Three things this closes, each of which the reviewer was right to refuse to take on trust:

- **Both policies are `PERMISSIVE`.** The whole "shared read, owner-restricted write" conclusion
  depends on it: permissive policies are combined with **OR**. Had the older policy been
  `RESTRICTIVE`, the two would be **AND**ed, the migration would have granted nothing, and the
  docs + commit message would assert a database state that does not exist.
- **`cmd` scopes are as documented** — the new policy is `SELECT`-only, so `UPDATE`/`DELETE`
  remain governed solely by the old owner-scoped policy. The old policy has no `WITH CHECK`, so
  Postgres reuses its `USING` as the check: `INSERT` also stays owner-scoped.
- **The `comment on policy` statement really applied** (the migration file contains **two**
  statements, not one — the pre-apply disclosure in `cross-cutting.md` said "one statement",
  corrected there by a dated append).

## 2. Blast radius — measured on the RIGHT table this time

The first pass measured `public.profiles` (3 rows) and concluded the exposure was nil. That was
the wrong table: the population granted read by `TO authenticated` is **`auth.users`**, of which
`profiles` is only a trigger-maintained mirror (`handle_new_user()`). A single auth user missing
a profile row — trigger failure, manual deletion — would have been invisible to the original
measurement while still gaining read on all 60 transcripts, including the full `raw_transcript`
of 30 personal Timlul-era recordings.

Filed as a BLOCKER by the reviewer. Closed by running the query that was never run:

```
auth_users_total            | 3
profiles_total              | 3
auth_users_without_profile  | 0
have_signed_in              | 3
newest_signup               | 2026-06-02
```

**The exposed population is exactly the 3 known accounts, all the founder's own, and none is
unaccounted for.** Recorded honestly: the conclusion was right, the original method was not.
No new signup in two months, so the old product is not acquiring users behind this change.

## 3. Row shape at the time of the change

```
bucket                              | rows | with_company
------------------------------------+------+-------------
no owner (user_id IS NULL)          |  30  |      2
owned (3 distinct users)            |  30  |      3
```

Note for anyone reading the earlier draft: the 30 null-owner rows were labelled "Atlas's shared
company calls", which **overstates** them — only 2 carry a `company_id`, so only 2 are reachable
through `listCompanyTranscripts()`. They are better described as un-owned rows, most of which no
company page currently surfaces.

## 4. What the change does NOT do

- It does not touch the **service-role bypass**. `supabaseAdmin` bypasses RLS by design, and every
  server route still uses it; RLS here is the second line of defence, not the first.
- It does not touch `getSession()` (`docs/V1-SECURITY-AND-LAUNCH-NOTES.md` item 0).
- It does **not** make `user_id` unused. Reads ignore it; **writes still depend on it** —
  `src/app/api/transcripts/route.ts:82` and `:149` stamp `user_id` on insert, and
  `src/app/api/transcripts/[id]/route.ts:104` grants edit rights via
  `session.user.id === row.user_id` with an admin fallback. Dropping the stamp would silently
  revoke every non-admin's ability to edit their own transcript (`null === uuid` is false → 403).

## 5. Process failure to record, because it is the reusable lesson

**The migration was applied to the live shared database BEFORE the review gate ran.** Narrowing or
removing a policy needs `DROP POLICY`/`ALTER POLICY`, both matched by the destructive-SQL hook — so
a reviewer verdict of "narrow the scope" would have been *unactionable by design*. The gate was
inverted for the single irreversible class of change in this repo.

The rule that follows: **for DDL against the shared database, the review gate runs on the migration
file BEFORE it is applied**, not after. Everything else in this repo can be reviewed post-hoc
because it can be reverted; this cannot.

## 6. Battery

`npm test` 125/125 · `npx tsc --noEmit` clean · `npm run build` green (supervisor checkout,
after clearing a stale `.next` left by an unrelated merge-preview build). The reviewer
independently re-ran `npm test` and confirmed 125/125.
