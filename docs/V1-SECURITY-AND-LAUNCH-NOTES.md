# V1 Frontend — Security posture & launch checklist

_From the multi-agent review of `feat/v1-frontend` (2026-06-13)._

## Current posture: PAGES GATED (2026-08-01), API AUTH STILL NOT TRUSTWORTHY

Until 2026-08-01 the V1 product under `/app/*` was **deliberately public** so it could be
viewed without an auth wall. That is no longer true, and the rest of this file predates the
change — read the dates. Current state:

- ✅ **`/app/*` and `/print/*` ARE in the `src/middleware.ts` matcher** and require a session
  (`fix/app-login-gate`, 2026-08-01). `/print/[id]` had been server-rendering whole transcripts
  to anyone holding the URL; `GET /api/live/finished-call/[id]` returned the same payload as
  JSON and was closed with it.
- 🔴 **But a session is not verified** — see item 0 below. The gate uses `getUser()`, and the
  `Authorization: Bearer` branch of `getRequestUserId` genuinely verifies too; but every
  COOKIE-based auth check — which is every browser request — goes through `getSession()`, which
  believes the cookie. So the product is
  no longer *open*, but it is not yet *secure*. Do not read the gate as launch-ready.
- Everything below this line still stands unless marked otherwise:
- `POST /api/chat` is **unauthenticated, unbounded, and uncapped** (expensive Opus calls).
- `/api/quotes` and `/api/calls/follow` fall back to a shared `DEMO_USER_ID` via the
  service-role client (`supabaseAdmin`), so anonymous reads/writes share one bucket.
- The new RLS policies (migration `20260613_007`) are correct but **bypassed** because the
  routes use `supabaseAdmin`.

## Must-fix BEFORE launch (security)

0. **🔴 `getSession()` verifies nothing — switch `lib/auth.ts` and `requireAdmin` to `getUser()`.**
   THE top security item (found 2026-08-01). `getRequestUserId` :23, `getCurrentUser` :40 and
   `requireAdmin` (`/api/admin/requests`) all resolve the user via `supabase.auth.getSession()`,
   which in auth-js 2.105.4 reads the session out of the COOKIE — shape check plus an
   `expires_at` the cookie itself supplies, no signature check, no network call. A forged cookie
   carrying a known user UUID passes, and the routes then query with `supabaseAdmin`, which
   bypasses RLS. Until this lands, every "auth-gated" API route is gated in intent only, and
   nothing below this line can be considered done.
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
   STILL OPEN from this item: the user-scoped API routes (`/api/quotes`, `/api/calls/follow`,
   `/api/chat`) plus `PATCH …/speakers`, `PATCH …/diarization` and `POST /api/live/finish`
   (the last spends money per call). A page gate does not cover direct API calls.
2. **Lock down `/api/chat`.** Require auth, add a per-user rate limit, cap `message`/`history`
   size, and restrict transcript context to the user's permitted companies — today
   `getChatContext` falls back to "the most recent completed transcript across ALL companies,"
   which would let an unauthorized user read any transcript through the LLM.
3. **Drop the `DEMO_USER_ID` fallback** in `/api/quotes` + `/api/calls/follow`; resolve the real
   user and use the cookie (anon) Supabase client so RLS actually enforces per-user isolation —
   or keep `supabaseAdmin` but hard-require a real `userId`.
4. **Apply migration `20260613_007`** (quotes + followed_calls) and delete the in-process
   fallback in `src/lib/db/quotes.ts` (it's per-process; quotes vanish on redeploy).
5. **`/api/chat` POST is unauthenticated** (pre-existing; transcript context exposed to anon
   callers) — documentRef grounding is now auth-gated in-route (2026-07-14, Lane M); decide at
   the security pass whether the whole route should be gated.

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
