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

> This section records the FIRST version of the guard, including its assertion text, which has
> since changed. It proved the guard could fail; it did not prove the guard was strong enough.
> §5 is where that was tested properly, and the answer was no.

## 3. Battery

- `npm test` → **194/194** (191 before this branch; +3 from `apiAuthBoundary.test.ts`)
- `npx tsc --noEmit` → exit 0
- Pages loaded signed in with zero console errors: `/app/home`, `/app/calendar`, `/app/chat`,
  `/app/company/[id]` — the last one being the page whose `CompanyOverview` polls
  `/api/live/finish`, i.e. the surface most likely to break from this change. RTL layout intact.
- `npm run build` — see the ship entry; run with the dev server stopped per the rule at `7d98d5a`.

## 4. What this does NOT close, stated so nobody reads it as finished

1. **`GET /api/live/{state,pcm}` remain anonymous.** They proxy the live engine and serve real
   captions and audio. Listed in the guard's allowlist as an **OPEN ITEM**, not as "by design".
   ~~Bounded for now: both proxy a localhost-only engine, so a deployed Atlas cannot reach it and
   they return nothing regardless of caller.~~

   > **CORRECTION — 2026-08-03, at review.** That mitigation was false and the reviewer refuted it
   > from the routes themselves. Both read `process.env.LIVE_ENGINE_URL || 'http://localhost:8788'`,
   > and `live/state/route.ts`'s own comment says that variable exists to "point the deploy at a
   > tunnelled local engine". So the bound holds ONLY while `LIVE_ENGINE_URL` is unset — a
   > deploy-time configuration, not a property of the code. Setting it on Railway would open both
   > routes to the world in the same action. **⇒ Gate them BEFORE `LIVE_ENGINE_URL` is ever set in
   > a deployed environment.** Struck rather than reworded, because an evidence file that was
   > wrong must show that it was.

   Closing them safely still needs a live run with the engine up (`.claude/rules/live.md`) and a
   latency measurement on `/pcm`, which is polled continuously.
2. ~~**`POST /api/conversations` keeps its `DEMO_USER_ID` fallback**, listed as a dated exception
   in the guard.~~ **CLOSED at review, 2026-08-03** — see §5. Deferring it was the wrong call and
   the exception was itself untrue; the route now requires a real user like every other.
3. **Authentication is not authorisation.** Every route now proves *who* is calling. Whether
   that caller may touch the specific row it goes on to read is a separate obligation living in
   the `lib/db` modules, most of which still query through `supabaseAdmin` and therefore bypass
   RLS (`.claude/rules/app.md`). The guard's own header says this so it is not mistaken for more
   than it is.
4. **`NEXT_PUBLIC_SITE_HOST` is still missing from `.env.example`** — founder-only (shell access
   to `.env*` is hook-blocked for the assistant). Needed at Railway or the login redirect sends
   users to the internal `localhost:8080`. Carried into the Railway chapter, not this one.

## 5. Review round — the guard was too weak, and the reviewer proved it

The cold `atlas-reviewer` returned **CHANGES** on the first version of this branch. It was right,
and the headline finding was a BLOCKER *in the guard itself*, which matters more than any single
route: a test whose promise is "PUBLIC enumerates the entire anonymous surface of the API" was
making that promise falsely on the very branch that introduced it.

**The BLOCKER.** `AUTH_CALL` matched the mere *presence* of an auth call. `POST /api/conversations`
called `getRequestUserId`, discarded the null, and wrote the row as `DEMO_USER_ID` — so it counted
as authenticated. A route that asks who you are and then ignores the answer is not gated.

Fixed by closing the route properly rather than documenting the exception. Deferring it to avoid a
merge conflict with Lane M's in-flight branch was the wrong trade: it left an untrue claim standing
in three documents to save a ten-line conflict resolution. The guard now requires a handler to
contain **both** an auth call and a refusal.

**Three more holes in the guard, each proved by an adversarial fixture** (written under
`src/app/api/zzprobe/`, run, then removed — every one produced a failure naming the exact handler):

| shape | before | now |
|---|---|---|
| resolves a user, never refuses | passed | `/zzprobe GET — resolves a user but never refuses` |
| auth call only inside a **comment** | passed | `/zzprobe GET — resolves no user` |
| `export const GET = async …` | invisible | `/zzprobe GET — resolves no user` |
| helper declared *between* two handlers | counted toward the earlier one | bodies are brace-matched |

The comment case was not hypothetical: this branch's own `api/chat/route.ts` comment quoted the old
code including `getRequestUserId(req)`, so deleting the real guard would have left the route green.
The guard now blanks comments and string literals before scanning.

Two further behaviours, both deliberate and fixture-verified: a handler produced by a call
expression (`export const GET = withAuth(handler)`) **fails loudly** rather than being skipped, and
a handler delegating to an *unregistered* helper is flagged — the guard cannot know an arbitrary
function authenticates, so it fails closed and adding a new auth helper costs one deliberate line.

**Placement, not just presence.** The auth check in `/api/chat` sat *below* `getChatContext`, so an
anonymous POST still ran a service-role query and built up to a 40k-character transcript string
before being refused — free unauthenticated database load on exactly the all-companies fallback the
guard exists to protect. It is now the first statement in the handler, ahead of body parsing and
the API-key check (which also closed an anonymous probe for whether `GEMINI_API_KEY` is set).

**Two server components the API-only sweep was blind to.** `app/company/[id]/page.tsx` and
`app/calendar/page.tsx` still did `user.userId ?? DEMO_USER_ID`, rendering the shared identity's
quotes, folders and followed calls as the visitor's own whenever `getCurrentUser()` came back
empty — and it returns null on *any* failure, since `resolveUser` swallows exceptions. Both now
render nothing instead. The guard's second test was widened from `src/app/api` to all of `src/app`,
because the narrow scope is what made these invisible.

**A verification recipe I broke and had to fix twice.** Gating `/api/live/finish` turned
`LiveSession.tsx`'s poll loop into an infinite spinner: a 401 body carries no `status`, so the loop
treated it as "still processing" and re-polled every 3s forever, showing "processing" for a call
that would never report. Now it stops and reports failure. The `/live-test` skill had the same
problem in prose and was corrected in the first pass.

**Doc claims that overstated the code**, all corrected: "across all 16 sites" (one remained), "the
five items above are CLOSED" (item 5 named the one route left open), and "Every API handler now
requires a signed-in user" (`POST /api/conversations` did not). Each is now true because the code
changed, not because the sentence was softened.

Battery after the round: **194/194 · tsc exit 0 · build green**.
