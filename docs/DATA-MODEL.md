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
| Key | `company_id`, no `user_id` | `user_id NOT NULL REFERENCES auth.users(id)` |
| If it leaks | that's the product working | that's a breach |

Founder's words: *"investor transcripts need to be accessible to anyone… this is not a user
specific type of data. The user specific type of data is in the chat section… projects, obviously,
workspace, obviously, and agents, obviously."*

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

The database now encodes Atlas's model rather than Timlul's. Note the split is no longer
meaningful going forward: **the whole table is the shared corpus**, owner or not.

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

Blast radius, measured rather than assumed: `profiles` holds 3 rows (1 admin), the transcripts'
3 distinct owners are exactly those 3 profiles, and 0 rows are owned by anyone outside them — the
entire user base is the founder plus two of his own accounts, so no third party's data changed
visibility.

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
