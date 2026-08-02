# V1 Frontend — Security posture & launch checklist

_From the multi-agent review of `feat/v1-frontend` (2026-06-13)._

## Current posture: PAGES GATED (2026-08-01) · SESSIONS VERIFIED (2026-08-02) · API AUTH ENFORCED BY TEST (2026-08-03)

Until 2026-08-01 the V1 product under `/app/*` was **deliberately public** so it could be
viewed without an auth wall. That is no longer true, and the rest of this file predates the
change — read the dates. Current state:

- ✅ **`/app/*` and `/print/*` ARE in the `src/middleware.ts` matcher** and require a session
  (`fix/app-login-gate`, 2026-08-01). `/print/[id]` had been server-rendering whole transcripts
  to anyone holding the URL; `GET /api/live/finished-call/[id]` returned the same payload as
  JSON and was closed with it.
- ✅ **Sessions are now verified** (2026-08-02, merged with `feat/workspace-backend`) — every
  cookie-based check goes through `getUser()`, which revalidates the token. See item 0 below.
  That closes the forged-cookie hole, but it does not make the product launch-ready on its own:
  the items below this line are untouched by it, and `supabaseAdmin` still bypasses RLS
  everywhere except the projects data layer.
- ✅ **Every API handler now requires a signed-in user, and a TEST enforces it** (2026-08-03,
  `fix/api-security`). `src/lib/apiAuthBoundary.test.ts` splits every `route.ts` under
  `src/app/api` into its exported methods and fails the battery for any that resolves no user.
  Verified in both directions in a real browser — anonymous 401, signed-in 200 — see
  `docs/evidence/fix-api-security/2026-08-03-api-auth-boundary.md`. Two allowlisted exceptions
  with stated reasons: `GET /api/live/{state,pcm}` (proxy the localhost-only live engine; revisit
  before LIVE deploys) and `POST /api/conversations` (until Lane M's `fix/projects-honesty` lands).
- Everything below this line still stands unless marked otherwise:
- ~~`POST /api/chat` is **unauthenticated**~~ — auth ✅ 2026-08-03. **Still unbounded and uncapped:**
  no rate limit, no size cap on `message`/`history`, and `getChatContext` still falls back to the
  most recent transcript across ALL companies. See item 2 — only its first clause is done.
- ~~`/api/quotes` and `/api/calls/follow` fall back to a shared `DEMO_USER_ID`~~ — ✅ 2026-08-03,
  and the count in that sentence was wrong: it was **16 call sites across 8 route files**
  (`grep -rn "?? DEMO_USER_ID" src/app/api | wc -l`), not two routes. They still query through
  `supabaseAdmin`, so RLS remains bypassed — auth was the prerequisite, not the whole job.
- The new RLS policies (migration `20260613_007`) are correct but **bypassed** because the
  routes use `supabaseAdmin`.

## Must-fix BEFORE launch (security)

0. ✅ **DONE 2026-08-02 — `getSession()` replaced by `getUser()` everywhere.** Was THE top
   security item (found 2026-08-01). All FIVE call sites converted on `feat/workspace-backend`
   and verified at merge: `git grep -n "auth\.getSession()" -- src` returns nothing. The shared
   helper is now `src/lib/auth/verifyUser.ts` (unit-tested). Kept here rather than deleted for
   two reasons. The bug: in auth-js 2.105.4 `getSession()` read the session out of the COOKIE —
   shape check plus a cookie-supplied `expires_at`, no signature check, no network call — so a
   forged cookie carrying a known user UUID passed, and the routes then queried with
   `supabaseAdmin`, which bypasses RLS. The process failure: this was recorded as THREE call
   sites in four separate documents until someone finally ran the grep, and the two missed ones
   were the load-bearing PUT edit-rights check in `api/transcripts/[id]`. **A count in a document
   comes from a command, never from another document.**
0b. **🔴 `public.profiles` is effectively world-writable — and this DB is shared with DEPLOYED
   production Timlul.** Found 2026-08-01 while grounding the new chapter's ownership model; NOT
   introduced by any Atlas branch. A policy named `Service role full access on profiles` is
   `cmd=ALL, roles={public}, USING (true), WITH CHECK (true)`. RLS policies combine with **OR**,
   so it nullifies the three correct owner-scoped policies beside it, and `anon` +
   `authenticated` both hold SELECT/INSERT/UPDATE/DELETE grants on the table. The anon key is
   public by design (it ships in Timlul's browser bundle), so in principle anyone holding it can
   read every profile and UPDATE any row — **including `role='admin'`, the exact column
   `requireAdmin` trusts**. `access_requests` carries the same always-true policy. Both are
   flagged by Supabase's own linter (`rls_policy_always_true`). The service-role key bypasses RLS
   and never needed a policy, so these grant nothing but exposure.
   **NOT FIXED DELIBERATELY:** removing a policy is destructive, hook-blocked, and Timlul shares
   this database. **Check before any fix:** does Timlul write `profiles`/`access_requests` with
   the ANON key rather than the service-role key? If yes, removing the policy breaks production.
   Lower priority from the same sweep: `public.handle_new_user()` is `SECURITY DEFINER` and
   callable by `anon` via `/rest/v1/rpc/`; leaked-password protection is disabled in Auth.
1. ~~**Gate the product.**~~ **PAGES DONE 2026-08-01** — `src/middleware.ts` gates `/app/*` and
   `/print/*` (the latter server-rendered whole transcripts to anyone with the URL), redirect
   origin derived from `x-forwarded-host`/`x-forwarded-proto` per the Railway gotcha, host and
   scheme both allowlisted. **DEPLOY REQUIREMENT: set `NEXT_PUBLIC_SITE_HOST` to the public
   hostname** (e.g. `atlas.example.com`) — it is not in `.env.example` yet. Unset behind a proxy,
   the gate falls back to the server's bound origin and redirects anonymous users to
   `http://localhost:8080/…`, making login unreachable in production.
   ~~STILL OPEN from this item: the user-scoped API routes…~~ **✅ API HALF DONE 2026-08-03**
   (`fix/api-security`) — all of them, plus the ones this line failed to list. A page gate does
   not cover direct API calls; a per-method test now does.
2. **Lock down `/api/chat`.** ✅ **Auth done 2026-08-03** — the route 401s without a session
   (it previously resolved a user only when a document or snip was attached, so a plain question
   ran anonymously). **STILL OPEN, and this item is NOT closed:** no per-user rate limit, no cap
   on `message`/`history` size, and `getChatContext` still falls back to "the most recent
   completed transcript across ALL companies" — now reachable only by a signed-in user, which
   narrows it from anonymous to any-member but does not fix it. Company-scoping that fallback is
   the remaining work.
3. ~~**Remove the `DEMO_USER_ID` fallback** in `/api/quotes` + `/api/calls/follow`~~ — ✅ DONE
   2026-08-03, across all 16 sites in 8 files (the two named here were an undercount). Routes now
   hard-require a real `userId`, which is the second option this item offered. **The first option
   is still owed:** they continue to use `supabaseAdmin`, so RLS is bypassed and ownership is
   enforced in application code. Moving them to the cookie client is separate, unstarted work —
   `lib/db/projects.ts` is the pattern.
4. **Apply migration `20260613_007`** (quotes + followed_calls) and delete the in-process
   fallback in `src/lib/db/quotes.ts` (it's per-process; quotes vanish on redeploy).
5. ~~**`/api/chat` POST is unauthenticated**~~ — ✅ CLOSED 2026-08-03. The decision this item
   deferred to "the security pass" was taken there: the WHOLE route is gated, not just the
   documentRef grounding. Duplicate of item 2's first clause; kept so the trail is readable.

## Fixed in this review pass (committed)

- **Calendar timezone:** day-bucket key now uses local date components (was UTC-sliced) so calls
  near midnight render on the correct grid cell. (`CalendarView.tsx`)
- **Completed-transcript karaoke:** transcripts without word timings now render as a clean read
  view (no stuck active-word cursor). (`TranscriptBody.tsx` / `LiveTranscriptView.tsx`)
- **Chat history:** the trimmed history can no longer start with an assistant turn (the Anthropic
  API requires a leading user message — previously errored after ~4 turns). (`api/chat/route.ts`)
- **@-mention in Hebrew:** the trigger regex now matches non-ASCII, so Hebrew company names filter
  the dropdown. (`ChatView.tsx`)
- **Company search injection:** user input is stripped of PostgREST `.or()` metacharacters
  (`, ( ) * %`) before building the filter. (`db/companies.ts`)
- **Nav double-highlight:** Profile no longer claims the active state alongside Settings.
  (`NavRail.tsx`)
- **Player keyboard a11y:** keyboard-activated scrubber clicks no longer seek to 0.
  (`MediaPlayer.tsx`)
- **Quote-save guard:** saving with no resolved company shows a message instead of a 400.
  (`LiveTranscriptView.tsx`)
- **Error disclosure:** `/api/chat`, `/api/calls`, `/api/companies` return generic errors and log
  details server-side (no raw SDK/HTTP strings to the client).

## Cleanup follow-ups (non-blocking)

- Duplicate `formatDate`: legacy `src/lib/utils.ts` (he-IL hardcoded) vs locale-aware
  `src/lib/i18n/format.ts`. V1 imports the i18n one explicitly; consider renaming the legacy one
  to `formatDateHe` to remove the auto-import footgun.
- `resolveCompanyLogo` hardcodes a TASE-id → logo map. Once the Supabase MCP is connected, set
  `companies.logo_url = '/logos/tamis.png'` for תמיס and delete the fallback map.
- `DEMO_LIVE_CALL` is special-cased in 3 places. When Core 2 (real live calls) lands, route it
  through a single `listLiveCalls()` adapter that returns the demo only when nothing is live.
- Extract a shared `LiveCallRow` (red dot + LIVE + quarter) — duplicated in Home + Company.
