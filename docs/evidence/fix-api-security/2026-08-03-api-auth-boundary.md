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

## 6. Second review round — APPROVED, and the guard got harder anyway

The re-review of `3ba4225` returned **APPROVED**. It also verified the branch's central claim
independently rather than trusting the guard: it re-implemented the parser outside the repo and
enumerated **28 route files, 44 exported handlers, 37 gated, 7 public** — the 7 `PUBLIC` keys match
exactly the 7 handlers that call no auth helper. `src/middleware.ts` matches only `/app/*` and
`/print/*`, so route-level auth really is the only gate on the API, and there is no `src/pages/api`.
The claim is load-bearing, and it is now true.

Its remaining findings were about **durability of the guard** and about **callers I had not
enumerated**. None were merge-blocking; all are fixed here anyway, because two of them were
defects this branch itself created and one was a false claim in my own commit message.

### The claim I made that was false

The previous commit said an unparseable handler shape "FAILS LOUDLY rather than being skipped".
It did not. `export { doWrite as POST, doWrite as DELETE }` — a normal Next.js shape — was invisible,
and because the file also had one recognised `export async function GET`, the "no handler found"
assert never fired. **The mutating methods were silently unchecked.** Now detected and refused by
name, and re-proved by fixture. Recorded rather than quietly fixed: this branch has now filed the
"a count/claim in a document must come from a command" lesson three times and violated it twice.

### The guard's own attacks, re-run against the new version

The reviewer resurrected the original BLOCKER shape (resolve a user, discard it) **four ways** that
all passed, because `REFUSAL` was an unbound token search — any `401` anywhere, or any
`if (x) return x` about anything. The check is now **bound to the identifier the auth call was
assigned to**, so an unrelated `if (cached) return cached` or an upstream `if (up.status === 401)`
no longer counts. Verified by fixture:

| attack | before | now |
|---|---|---|
| resolve, discard, unrelated `if (cached) return cached` | passed | `resolves a user but never acts on the result` |
| resolve, discard, upstream `401` token in body | passed | `resolves a user but never acts on the result` |
| `export { doWrite as POST }` beside a real `GET` | silently unchecked | fails, naming the method |
| regex containing a quote blanking the rest of the file | hid real code | fails on the import/export canary |

That last one deserves its own note. The comment/string blanker has no regex-literal state, so
`raw.replace(/[']/g, '')` flips its parity and blanks everything after it — a live unguarded
handler below that line became invisible and the test passed. Implementing JavaScript's
regex/division ambiguity inside a guard is a bad trade, so instead the blanker is now checked by a
**canary**: every line starting with `import` or `export` in the raw file must survive blanking.
A parity flip wipes them. Silent failure converted into a loud one, which is the only property
that matters in a security guard.

**A stated limit, added to the guard's header rather than papered over:** binding proves the auth
result is *checked*, not that the check happens before anything expensive. Ordering is a real
property this cannot see — `/api/chat` had its refusal below `getChatContext` and only a human
reading caught it.

### Callers I had not enumerated — the same lesson, twice more

The branch recorded "gating an endpoint changes every caller's ERROR path, not just its happy
path." The reviewer pointed out I had applied that to `/api/live/finish` and nowhere else:

- **`CalendarView.follow()`** set the star optimistically and swallowed the failure. That was
  survivable while `/api/calls/follow` always succeeded via the shared-identity fallback. Removing
  the fallback made a 401 reachable, so the star would claim a call was followed that the server
  never recorded. Now reverts.
- **`MyQuotes` folder delete and folder assignment** did the same. Both now revert.
- **`LiveSession`'s new 401 branch** set `finishStatus='failed'`, which renders *"the AI model was
  momentarily unavailable"* — a **false cause** for an expired session — and its "Try again" button
  re-POSTs into the same 401 forever. It now redirects to sign-in, matching `viewOrganized` in the
  same file. One file must not hold two answers to the same status.

### `DEMO_USER_ID` is deleted, not merely unused

The constant had zero runtime references left but still existed in `src/lib/api/types.ts`, which the
guard does not scan — so a `src/components` or `src/lib` file could have re-imported it invisibly.
Removing it makes the promise structural instead of scoped: nothing can import what does not exist.

### Merge-order consequence, stated deliberately

`fix/projects-honesty` (Lane M, also pending) changes `api/conversations/route.ts`, `api/chat/route.ts`
and `package.json`, and its `lib/db/conversationScope.ts` **imports `DEMO_USER_ID` and reproduces the
fallback**. With the constant deleted, that merge now fails to compile instead of silently
reinstating a shared identity, and `apiAuthBoundary.test.ts` will additionally fail because
`resolveConversationScope` is not in the guard's closed list of auth helpers. **Both failures are
intended.** Whoever merges second re-runs the battery on the merge result and resolves toward
refusing the request. The earlier instinct — defer to avoid a conflict — is what produced this
branch's only BLOCKER.

### Filed, not fixed

With `user.userId` null the company and calendar pages render their empty states, so a transient
identity failure behind the login gate says "you have no saved quotes" rather than "we could not
establish who you are". Strictly better than serving another identity's rows, and it needs new
copy in both dictionaries to fix properly. Filed in the ready queue.

Battery: **194/194 · tsc exit 0 · build green.**
