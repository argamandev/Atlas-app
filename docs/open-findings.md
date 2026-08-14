# Open findings — NOT laws. Do not cite these as invariants.

Moved out of `.claude/rules/app.md` on 2026-08-12: these are open items, not invariants, and
`CONTEXT.md` reserves the always-on set for law. An agent touching the code an entry names should
read it; nothing else needs it loaded.

Each needs a decision or a window, not a drive-by fix. Re-verified 2026-08-10.

- **`GET /api/live/{state,pcm}` are unauthenticated** (boundary-test allowlist, marked OPEN there
  too). The mitigation once written for them is false and was refuted the same day: both read
  `process.env.LIVE_ENGINE_URL || 'http://localhost:8788'`, and that variable exists precisely to
  point a deploy at a tunnelled engine. They are inert on `www.timlul-ai.com` only because it is
  unset — one dashboard field wide. **⇒ Gate them in the SAME change that sets it. A follow-up is
  not a plan, it is the window.** → `#api-auth-boundary-test`
- **`.gitattributes` is absent while `core.autocrlf=true`** (both confirmed 2026-08-10).
  `* text=auto eol=lf` would close the CRLF trap structurally, but it is a repo-wide behavioural
  change and must not ride in on a feature merge. Founder decision. → `#crlf`
- **One UTC leak, not user-visible:** `api/workspaces/[id]/intake/route.ts:542` (UTC `{TODAY}`;
  `{Y0}`/`{Y1}` server-local at 543–544). The second leak this entry used to list —
  `src/lib/maya/events.ts`'s `getUTCFullYear` labelling a fiscal year — was closed by slice A5's
  `periodFor` rewrite (Israel time via `israelDayKey`, 2026-08-14). → `#timezone-israel`
- **`PUT /api/transcripts/[id]` is a standing route around the admin-only curation gates**
  (recorded 2026-08-13, reviewer finding on `fix/speaker-edit-admin-gate`). The PUT is
  owner-or-admin and replaces the whole `formatted_data` — speaker names included — so a
  non-admin OWNER can rewrite speaker attribution that the PATCH gates now reserve for admins
  (docs/DATA-MODEL.md, "Writes to the shared corpus are CURATION"). Not exposed today: queried
  2026-08-13, 3 corpus rows are owned by the one admin and 2 are ownerless (→ admin-only).
  **DECIDED 2026-08-13 (ticket 13): the PUT becomes admin-only** — full-content transcript
  edits are curation like speaker renames, no owner-exception. Awaiting execution as a small
  mission: `requireAdmin` on the PUT + non-admin→403 route tests. Closes when that lands.
- **`profiles`/`access_requests` `USING (true)` policies narrowing is approved and scheduled**
  (2026-08-13, ticket 13 — the "check Timlul first" blocker dissolved with the corpus cleanup).
  Its own small mission through the DDL gate (DROP/ALTER POLICY is hook-blocked): migration
  file → review → apply. See db.md's ownership-law section for the banned shape.
- **`public.atlas_search_chunks` (migration 029) is orphaned once slice A5 deploys** (recorded
  2026-08-14, pre-apply review of migration 031). 031 adds `atlas_search_chunks_v2` under a new
  name because Postgres refuses to widen a `returns table` via `create or replace`, and removing
  the old function is hook-blocked SQL — so it costs a founder round-trip (the `probe_idf_tsquery`
  pattern in `COLLISIONS.md`). Leaving it in place is also what keeps the deployed build working
  while 031 is applied ahead of the merge. **After A5 is deployed and verified** it has no caller:
  `src/lib/corpus/retrieve.ts` is retrieval's one door and it calls `_v2`. Removal is a
  founder-run statement in the Supabase SQL editor, and it is not urgent — an unreferenced
  invoker-rights function granted only to `authenticated`/`service_role` is inert.
  **Not a law, and not a reason to hold the slice.**
