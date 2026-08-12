# Atlas data model — the shared corpus and the personal layer

> **Founder decision, 2026-08-01.** This is the architecture. Anything that contradicts it is a
> bug, not a variation. Verified against the live Supabase the same day; every number below came
> from a query, not from memory.

## The rule, in one line

**Reference data about companies is the same for every user. Everything a user makes is theirs.**

| | **Shared corpus** — one copy, all users | **Personal layer** — per user |
|---|---|---|
| What | investor call transcripts · company profiles · company reports & PDFs (Maya) · upcoming calls / calendar | chat conversations · projects · workspaces · agents |
| Written by | the ingestion pipelines (Maya API, Recall, IVRIT/RunPod) — server-side only | the user, through the app |
| Read by | any signed-in user | **only its owner** |
| Key | `company_id`; **new** shared tables get no `user_id` at all | `user_id NOT NULL REFERENCES auth.users(id)` |
| If it leaks | that's the product working | that's a breach |

Founder's words: *"investor transcripts need to be accessible to anyone… this is not a user
specific type of data. The user specific type of data is in the chat section… projects, obviously,
workspace, obviously, and agents, obviously."*

## Writes to the shared corpus are CURATION — admin-only (founder decision, 2026-08-13)

Ticket 12 of the smart-layer map settled the write side of the table above (his call, recorded in
`DECISIONS.md` [2026-08-13]):

1. **Editing a fact about shared-corpus content — a speaker's name, a diarization — is a curation
   act, gated `requireAdmin`.** It changes what every user sees, so it is the same class of write
   as deleting a transcript, not a personal edit. It is NOT owner-gated and NEVER open to any
   signed-in user (that was a live defect, not a design).
2. **Personal rows are written only by their owner** — the existing personal-layer rule, restated
   here because the exception below is easy to over-read.
3. **The one sanctioned exception: corrections flow from corpus curation into derived personal
   data.** When an admin renames a speaker, every user's saved quotes on that call get the
   corrected name (`renameSpeakerInQuotes`) — a quote's speaker label is *inherited* from the
   corpus, and leaving it stale would be exactly the plausible lie the citation rules exist to
   prevent. This propagation is legitimate only when triggered by a properly gated curation write;
   it is not a license for one user's action to touch another user's rows in any other shape.

Every new smart-layer route that writes is judged against these three lines. The routes that got
this wrong (`PATCH /api/transcripts/[id]/speakers`, `.../diarization`) passed the auth boundary
test while missing the authorization check — the boundary test proves a user was *resolved*, not
that the right user was *allowed*. The mechanism is `src/lib/curationAuthz.test.ts`, in two
halves: a unit test executes every branch of the gate's decision (`curationVerdict` — including
non-admin → forbidden → 403), and a structural guard fails the battery unless every listed
curation route delegates to `requireAdmin`. The IO seam between them (resolving the caller,
reading `profiles.role`) is structural-only — verified by hand and by the anonymous-401 probe,
not by a test that executes it.

**Known standing bypass, recorded 2026-08-13, decision owed:** `PUT /api/transcripts/[id]` is
owner-or-admin and replaces the whole `formatted_data` — so a non-admin OWNER can still rewrite
speaker names on a shared transcript through the PUT, around the admin-only PATCH gates.
Queried 2026-08-13: of the 5 corpus rows, 3 are owned by the one admin and 2 have no owner
(owner-equality fails → admin-only), so no non-admin holds the PUT on any current row; the
founder call this needs is in `docs/open-findings.md`.

## Why this matters (it is not a preference)

1. **It is what makes Atlas a platform instead of a transcription tool.** The shared archive *is*
   the product. Per-user transcripts is precisely what the old repo (Timlul) is, and the whole
   point of Atlas is that there is one archive, not one pile per person.
2. **The smart layer is only possible because the corpus is shared.** "Which company talked about
   M&A last quarter?" searches *everything*. If transcripts were user-scoped, that question could
   only ever search what that user personally uploaded — which is not a product, it's a filing
   cabinet. The cross-archive question IS the value.
3. **Cost scales with documents, not with documents × users.** The corpus gets embedded and
   indexed ONCE and serves every user. Per-user data would mean re-embedding the same 60
   transcripts for every signup.
4. **Security becomes one rule per bucket instead of a judgment call per query.** Two buckets, two
   rules. Ambiguity is where leaks come from, and the two directions are not symmetrical: showing
   a user someone else's project is a breach; showing them a public transcript is the feature.
5. **The personal layer is the moat.** Anyone can scrape Maya — the corpus is not defensible. What
   is defensible is that Atlas knows *this* user: their projects, their workspaces, their agents,
   the questions they keep asking. That is per-user by definition.

## The smart layer sits on top and crosses both

```
              ┌─────────────────────────────────────────────────────────┐
              │  SMART ATLAS LAYER                                      │
              │  retrieval over the whole archive + memory of this user │
              │  "which company talked about M&A last quarter?"         │
              └───────────┬─────────────────────────┬───────────────────┘
                  READS   │                         │   READS + WRITES
                  (all)   │                         │   (owner only)
              ┌───────────▼───────────┐   ┌─────────▼─────────────────┐
              │  SHARED CORPUS        │   │  PERSONAL LAYER           │
              │  transcripts          │   │  chat_conversations       │
              │  companies            │   │  projects                 │
              │  company_documents    │   │  workspaces               │
              │  document_pages       │   │  agents                   │
              │  scheduled_calls      │   │                           │
              │  + Maya reports/PDFs  │   │  user_id → auth.users(id) │
              │  + embeddings index   │   │  RLS: auth.uid() = user_id│
              │                       │   │                           │
              │  no user_id           │   └───────────────────────────┘
              │  read: any signed-in  │
              │  write: server only   │
              └───────────────────────┘
```

**The load-bearing property: the smart layer READS shared and WRITES personal.** The embedding
index over the corpus is built once and shared. What is per-user is the *question*, the *answer
saved into a workspace*, the *citation trail*, and what Atlas remembers about the person asking.
An agent that reads twelve companies' filings and writes one finding into one workspace is the
normal shape — cross-corpus read, single-owner write.

Corollary worth stating because it is easy to get wrong: **embeddings of shared documents belong
to the shared corpus, not to the user who happened to trigger the indexing.**

## Current state, verified 2026-08-01 (queried, not assumed)

**Already correct** — no `user_id` column at all, exactly the shared shape:
`companies` · `company_documents` · `document_pages` · `scheduled_calls`.
Maya ingest should EXTEND these, not invent a parallel set.

**Already correct** — owner-scoped with a real FK and an `auth.uid() = user_id` policy:
`watchlist` · `notification_prefs` · `sent_alerts` · `profiles`.

**RESOLVED 2026-08-01 (migration 014, below) — `transcripts` had been two products in one table:**

| | rows |
|---|---|
| total | 60 |
| no owner (`user_id IS NULL`) — Atlas's shared company calls | **30** |
| owned (3 distinct users) — Timlul's personal transcriptions | **30** |
| linked to a company | 5 |
| owned AND not linked to any company (clearly Timlul-era) | 27 |

Until migration 014 its only policy was `users see own transcripts` — `USING (auth.uid() =
user_id)`. Against a NULL `user_id` that expression is NULL, therefore not true, **so the 30
shared transcripts were invisible to every user under RLS.** Atlas displayed them only because
every server route queries with `supabaseAdmin` (service role), which bypasses RLS entirely — i.e.
for the shared corpus RLS was contributing nothing and the application was the only gate.

The database now encodes Atlas's model rather than Timlul's: **for READS the whole table is the
shared corpus**, owner or not.

> ⚠️ **`transcripts.user_id` is still load-bearing for WRITES — do not remove or stop setting it.**
> `transcripts` is the one shared-corpus table that carries a `user_id` (history, not design), so
> it is the exception to the "no `user_id`" shape above; **new** shared tables must not copy it.
> `src/app/api/transcripts/route.ts:82` and `:149` stamp `user_id` on insert, and
> `src/app/api/transcripts/[id]/route.ts:104` grants edit rights via
> `session.user.id === row.user_id` (admin fallback beneath it). A lane that reads "the split is
> no longer meaningful" and drops the stamp would silently revoke every non-admin's ability to
> edit their own transcript — `null === uuid` is false, so the route falls straight through to
> its 403. Reads ignore ownership; writes do not.

Caveat on the label above: the 30 null-owner rows are called "Atlas's shared company calls", but
only **2** of them carry a `company_id`, so only 2 are reachable through `listCompanyTranscripts()`.
They are more accurately just un-owned rows.

**Also inconsistent** — `user_id NOT NULL` but NO foreign key to `auth.users`:
`chat_conversations` · `quotes` · `quote_folders` · `user_quotes` · `followed_calls`.
`chat_conversations` is the table Projects builds on, so Projects must not inherit that shape.
The four-point rule for new tables lives in `.claude/rules/db.md` → "Ownership law".

## APPLIED 2026-08-01 — migration `20260801_014_transcripts_shared_corpus.sql`

Founder ruling that settled it: *"change the transcript to fit perfectly in what i described.
timlul is the old product — it is not relevant now!! transcripts need to not be user specific at
all!"* So the scope is **all** transcripts, not just the null-owner ones an earlier draft proposed.

```sql
create policy transcripts_shared_read
  on public.transcripts for select to authenticated using (true);
```

Additive (`CREATE POLICY`), no data touched. The older `users see own transcripts` policy is
deliberately **left in place** — removing a policy is destructive and hook-blocked — and because
RLS policies combine with **OR**, that lands exactly on the target model:

- **SELECT** — every signed-in user reads the whole corpus.
- **INSERT / UPDATE / DELETE** — still owner-scoped for any non-service-role client.

**Shared read, owner-restricted write.** Verified after applying: both policies present,
`transcripts_shared_read` = `SELECT / {authenticated} / USING (true)`.

Blast radius — and the first measurement of it was **methodologically wrong**, so both the fix and
the mistake are recorded. `TO authenticated` grants read to everyone in **`auth.users`**, not to
everyone in `public.profiles`; `profiles` is only a trigger-maintained mirror
(`handle_new_user()`), so an auth user missing a profile row would gain full read while being
invisible to a `profiles`-based count. Caught by the reviewer as a BLOCKER. The query that closes
it: `auth.users` = **3**, `profiles` = **3**, **0** auth users without a profile, newest signup
2026-06-02. The exposed population is exactly the 3 known accounts, all the founder's own — so the
conclusion held, but only by luck of the numbers. Full output:
`docs/evidence/fix-transcripts-shared-corpus/2026-08-01-policy-verification.md`.

Verified after applying (same evidence file, pasted output — not asserted): both policies present,
**both `PERMISSIVE`**, which is what makes the OR combination above true. Had the older policy been
`RESTRICTIVE` the two would be AND-ed and this migration would have granted nothing.

**Not the same thing as the `USING (true)` anti-pattern in `.claude/rules/db.md`.** That rule bans
`USING (true) WITH CHECK (true)` on `FOR ALL` policies granted to `public`, which silently opens a
table to anyone holding the anon key. This policy is `SELECT`-only, granted to `authenticated`, on
data that is *deliberately* shared — the same shape migration `20260611_006` already uses for
`companies` and `scheduled_calls`. Read the two together before "fixing" either.

**Process note, recorded because it must not repeat:** this migration was applied to the live
shared database **before** the review gate ran. Since narrowing a policy needs `DROP`/`ALTER`
(both hook-blocked), a reviewer verdict of "narrow the scope" would have been unactionable. For
DDL against the shared database the gate must run on the migration file **first**.

What this does **not** do, stated plainly: it does not address the service-role bypass (that key
is *meant* to bypass RLS) and does not touch `getSession()`. What it buys is that the day the read
routes move onto the user's own session, the shared corpus keeps working while per-user tables stay
private — instead of the archive going dark.

**App-side half, same change:** `getUserTranscripts()` in `src/lib/transcripts.ts` — the "admins
see all, others see their own" reader — was **deleted**. It was dead code (the only consumer of
that module is the company page, which calls the already platform-wide `listCompanyTranscripts`),
and leaving it would have left the wrong model sitting there to be copied.

**DECIDED 2026-08-01 (founder): Maya reports ARE `company_documents`.** Founder's words: *"maya
reports is company documents."* The Maya/TASE ingest extends `company_documents` +
`document_pages` — both already company-scoped with no `user_id` — rather than creating a parallel
set of tables. Lane I's integration spec starts from that table, not a blank page.

**Deferred by the founder to a dedicated session** — *"we will touch on how the product actually
connects one to each other in a detailed better session about atlas's intelligence and once we
connect to the maya api."* So the retrieval/agent wiring (how a question reaches the corpus, what
the agent reads and writes, how citations thread back to source PDFs) is explicitly NOT designed
here. This document fixes only the ownership shape underneath it.

**Open, and genuinely undecided:**
- Where do embeddings live — one `document_embeddings` table keyed by source, or per-source-type
  tables? Whichever wins, it is SHARED corpus, no `user_id`.
- Should the shared corpus be readable by `anon` (public marketing/SEO surface) or only by
  `authenticated`? Written above as `authenticated`, which is the safer default and matches the
  login gate shipped 2026-08-01.
