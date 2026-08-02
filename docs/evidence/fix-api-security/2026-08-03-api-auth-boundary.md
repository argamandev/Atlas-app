# API auth boundary — verification

Branch `fix/api-security`, commit `438ee97`, off main `bba0a21`. Supervisor-held chapter under
the founder's sequential-mode decision (2026-08-03).

**The bar for this chapter is BOTH directions: signed-in passes AND anonymous is refused.**
The anonymous 401 is the deliverable, so it is measured below, not asserted.

## 0. What was actually open, measured rather than quoted

The board and `docs/V1-SECURITY-AND-LAUNCH-NOTES.md` described the anonymous-fallback hole as
"the `DEMO_USER_ID` fallbacks in `/api/calls/follow` and `/api/conversations`" — two routes.

```
$ grep -rn "?? DEMO_USER_ID" src/app/api | wc -l
16
$ grep -rln "DEMO_USER_ID" src/app/api | wc -l
8
```

**16 call sites across 8 route files.** The documented count was wrong because it came from
another document instead of a command — the third recorded instance of that failure in this
repo (`.claude/rules/app.md` already carries the rule: *a count in a document comes from a
command, never from another document*). Both documents are corrected in this branch.

Separately, three route methods had **no auth of any kind**: `POST /api/chat` (resolved a user
only when a document or snip was attached), `GET`+`POST /api/live/finish`, and the two
`PATCH /api/transcripts/[id]/{speakers,diarization}` mutations.

## 1. Anonymous vs signed-in, probed in the founder's own browser

Run from the page context on `http://localhost:3000`, same origin, two fetches per route:
`credentials:'omit'` (no cookie) and `credentials:'include'` (the founder's real session).

| route | anonymous | signed in |
|---|---|---|
| `GET /api/quotes` | **401** | 200 |
| `GET /api/quote-folders` | **401** | 200 |
| `GET /api/conversations` | **401** | 200 |
| `GET /api/calls/follow` | **401** | 200 |
| `GET /api/live/finish` | **401** | 200 |
| `GET /api/transcripts` | **401** | 200 |
| `PATCH /api/transcripts/<id>/speakers` | **401** | not probed — mutating |
| `PATCH /api/transcripts/<id>/diarization` | **401** | not probed — mutating |
| `POST /api/chat` | **401** | 200, Hebrew answer, `x-chat-source` present |
| `GET /api/companies` | 200 | 200 | 
| `GET /api/calls` | 200 | 200 |

The last two are deliberate: reference data (the company directory and the scheduled-calls
list), allowlisted in the guard with their reason.

`POST /api/chat` signed in returned `200`, body `שלום`, 4 chars — a real model answer through
the real key, so the gate does not merely refuse, it still serves.

**`POST /api/live/finish` was NOT fired anonymously, deliberately.** If the guard had failed,
the request would have started the Gemini finish pipeline and written `status: 'processing'` to
the shared production database. `GET` on the same file returns 401, which proves the module
compiled with the guard in place, and `POST`'s guard is the identical two lines at the top of
the same handler. Stated rather than glossed: this one is verified by GET + code, not by firing
it.

### A 500 that is not ours
`GET /api/quotes?companyId=x` returns 500 signed in. `x` is not a UUID, so Postgres refuses the
comparison. Without the parameter the same route returns 200 with real rows. Pre-existing, not
introduced here — but worth noting that the failure surfaces as an **empty** 500 body, which is
the "degradation must be VISIBLE" class. Filed, not fixed in this branch.

## 2. The guard can actually fail

A test that cannot fail is decoration, so it was made to fail on purpose. Auth was removed from
`GET /api/quotes`, the guard was run, and it named the exact handler:

```
✖ every API route method resolves a user, or is an explicit public exception
  AssertionError: these API handlers are reachable with no signed-in user:
    /quotes GET
```

Restored → 3/3 pass. The guard splits every `route.ts` under `src/app/api` into its exported
HTTP handlers and checks each one independently, so a file whose `GET` authenticates and whose
`PATCH` does not is caught — that per-method blindness is exactly how the drift happened.

## 3. Battery

- `npm test` → **194/194** (191 before this branch; +3 from `apiAuthBoundary.test.ts`)
- `npx tsc --noEmit` → exit 0
- Pages loaded signed in with zero console errors: `/app/home`, `/app/calendar`, `/app/chat`,
  `/app/company/[id]` — the last one being the page whose `CompanyOverview` polls
  `/api/live/finish`, i.e. the surface most likely to break from this change. RTL layout intact.
- `npm run build` — see the ship entry; run with the dev server stopped per the rule at `7d98d5a`.

## 4. What this does NOT close, stated so nobody reads it as finished

1. **`GET /api/live/{state,pcm}` remain anonymous.** They proxy the live engine on `:8788` and
   serve real captions and audio. They are listed in the guard's allowlist as an **OPEN ITEM**,
   not as "by design". Bounded for now: both proxy a localhost-only engine, so a deployed Atlas
   cannot reach it and they return nothing regardless of caller. Must be revisited **before LIVE
   is deployed**, which is a later gate than Atlas being deployed. Closing them safely needs a
   live run with the engine up (`.claude/rules/live.md`) and a latency measurement on `/pcm`,
   which is polled continuously.
2. **`POST /api/conversations` keeps its `DEMO_USER_ID` fallback**, listed as a dated exception
   in the guard. Lane M's in-flight `fix/projects-honesty` rewrites those exact lines into
   `src/lib/db/conversationScope.ts`; editing them here would be a merge conflict for no gain.
   Closes when that branch merges — the exception entry is deleted then and the guard reports
   whether the fallback is genuinely gone.
3. **Authentication is not authorisation.** Every route now proves *who* is calling. Whether
   that caller may touch the specific row it goes on to read is a separate obligation living in
   the `lib/db` modules, most of which still query through `supabaseAdmin` and therefore bypass
   RLS (`.claude/rules/app.md`). The guard's own header says this so it is not mistaken for more
   than it is.
4. **`NEXT_PUBLIC_SITE_HOST` is still missing from `.env.example`** — founder-only (shell access
   to `.env*` is hook-blocked for the assistant). Needed at Railway or the login redirect sends
   users to the internal `localhost:8080`. Carried into the Railway chapter, not this one.
