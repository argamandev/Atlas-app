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

**The conflict — `transcripts` is two products in one table:**

| | rows |
|---|---|
| total | 60 |
| no owner (`user_id IS NULL`) — Atlas's shared company calls | **30** |
| owned (3 distinct users) — Timlul's personal transcriptions | **30** |
| linked to a company | 5 |
| owned AND not linked to any company (clearly Timlul-era) | 27 |

Its only policy is `users see own transcripts` — `USING (auth.uid() = user_id)`. Against a NULL
`user_id` that expression is NULL, therefore not true, **so the 30 shared transcripts are
invisible to every user under RLS.** Atlas displays them only because every server route queries
with `supabaseAdmin` (service role), which bypasses RLS entirely.

**Consequence to be honest about: for the shared corpus, RLS is currently doing nothing. The
application is the only gate.** That is survivable today (nothing is deployed, RLS is a second
line of defence and the app is the first) but it means the database does not yet encode the
architecture above — it encodes Timlul's.

**Also inconsistent** — `user_id NOT NULL` but NO foreign key to `auth.users`:
`chat_conversations` · `quotes` · `quote_folders` · `user_quotes` · `followed_calls`.
`chat_conversations` is the table Projects builds on, so Projects must not inherit that shape.
The four-point rule for new tables lives in `.claude/rules/db.md` → "Ownership law".

## Proposed, NOT applied — needs founder sign-off and a cross-cutting append first

Make the database enforce the shared-corpus half **additively**, without touching Timlul's rows:

```sql
-- Shared company transcripts become readable by any signed-in user.
-- Scoped to user_id IS NULL, so Timlul's 30 personal rows keep "own only" untouched.
CREATE POLICY transcripts_shared_read ON public.transcripts
  FOR SELECT TO authenticated
  USING (user_id IS NULL);
```

This is `CREATE POLICY` — additive, allowed under `rules/db.md`, and it cannot widen access to
Timlul's personal transcripts because they all have a non-null `user_id`. It does **not** fix the
service-role bypass (nothing can; that key is meant to bypass RLS) — it means that the day a route
is rewritten to use the user's own session, the shared corpus keeps working and the private rows
stay private.

**Open, and genuinely undecided:**
- Do Maya reports land in `company_documents` (already company-scoped, already the right shape) or
  in new Maya-specific tables? Prefer extending unless the shape genuinely differs.
- Where do embeddings live — one `document_embeddings` table keyed by source, or per-source-type
  tables? Whichever wins, it is SHARED corpus, no `user_id`.
- Should the shared corpus be readable by `anon` (public marketing/SEO surface) or only by
  `authenticated`? Written above as `authenticated`, which is the safer default and matches the
  login gate shipped 2026-08-01.
