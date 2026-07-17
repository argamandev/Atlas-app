# V1 Frontend — Security posture & launch checklist

_From the multi-agent review of `feat/v1-frontend` (2026-06-13)._

## Current posture: intentionally OPEN for the demo

The V1 product under `/app/*` is **deliberately public** in this build so it can be viewed
and tested without an auth wall. This is fine for a private demo, **not** for the
institutional launch. Specifically:

- `/app/*` routes are **not** in the `src/middleware.ts` matcher → reachable with no session.
- `POST /api/chat` is **unauthenticated, unbounded, and uncapped** (expensive Opus calls).
- `/api/quotes` and `/api/calls/follow` fall back to a shared `DEMO_USER_ID` via the
  service-role client (`supabaseAdmin`), so anonymous reads/writes share one bucket.
- The new RLS policies (migration `20260613_007`) are correct but **bypassed** because the
  routes use `supabaseAdmin`.

## Must-fix BEFORE launch (security)

1. **Gate the product.** Add `/app/:path*` and the user-scoped API routes
   (`/api/quotes`, `/api/calls/follow`, `/api/chat`) to the `middleware.ts` matcher and require
   a session. (Also: the middleware redirect derives origin from `request.url` — switch to
   `x-forwarded-host`/`x-forwarded-proto` per the Railway gotcha in CLAUDE.md.)
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
