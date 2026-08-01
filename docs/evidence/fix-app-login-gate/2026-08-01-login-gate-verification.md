# Login gate — verification (fix/app-login-gate, 2026-08-01)

Closes a pre-launch gap: API routes were auth-gated (in intent — see the caveat at the bottom,
it matters) but **pages were not**. Anyone who typed `/app/home` walked into the app, and
`/print/[id]` server-rendered a whole transcript to anyone holding the URL.

> This file was rewritten after review round 1 returned **CHANGES with 3 BLOCKERs**. The first
> version of it made three claims that were false. They are named explicitly below rather than
> quietly corrected, because a wrong evidence file is the defect this project has been bitten by
> twice.

## What shipped

- `src/middleware.ts` — the gate. Runs only on `/app/:path*` and `/print/:path*`.
- `src/lib/auth/gate.ts` — pure decision logic, unit-tested (16 tests).
- `src/components/auth/LoginForm.tsx` — honours `?next=` so you return where you were headed.
- `src/app/api/live/finished-call/[id]/route.ts` — **now requires a session** (see BLOCKER 2).

Load-bearing choices:

1. **`getUser()`, not `getSession()`.** `getSession()` returns the session straight out of the
   cookie with no signature check; `getUser()` revalidates the token with Supabase. This is what
   makes the gate a gate.
2. **`x-forwarded-host` is honoured only when it matches `NEXT_PUBLIC_SITE_HOST`.** Behind
   Railway, `request.url` is the internal `localhost:8080` so the header is needed — but anyone
   can send it, so trusting it blindly puts an attacker's host in a `Location:` header.
3. **`safeNextPath()` resolves against a throwaway origin and demands the origin survive**,
   rather than pattern-matching for bad prefixes.

## Review round 1 — what was wrong, and what fixed it

**BLOCKER 1 — the open-redirect guard did not work.** `safeNextPath` was
`startsWith('/') && !startsWith('//')`. WHATWG URL parsing treats a backslash as a slash and
strips tab/CR/LF, so `/\evil.com`, `/\/evil.com`, `/<TAB>/evil.com` and `/<CR>/evil.com` all
passed and resolved to `http://evil.com/`. Confirmed against the real URL parser before fixing —
all four resolved off-site. The guard now round-trips through `new URL()` and requires the origin
to be unchanged *and* the path to be one the gate actually protects. Nine payload families are
tested, each asserted twice (equals the fallback, and cannot escape the origin).

**BLOCKER 2 — gating `/print` did not close the transcript leak.**
`GET /api/live/finished-call/[id]` returned `loadCompletedCall(id)` — byte-for-byte the payload
`/print/[id]` renders — with no authentication, via the service-role client. The page was shut
and the JSON was still one URL away. That route now returns **401** without a session. Its only
caller is the authenticated live viewer.

**BLOCKER 3 — a false certification, and the biggest finding here.** The first version of this
file certified `/api/admin/requests` as "correctly gated" because it has its own `requireAdmin()`.
It does — but `requireAdmin()` uses `getSession()`, and so do `getRequestUserId()` and
`getCurrentUser()` in `src/lib/auth.ts`. In auth-js 2.105.4, `__loadSession` reads the session
from the cookie, checks its shape and an `expires_at` **that the cookie itself supplies**, and
returns it. No signature verification, no network call. A forged cookie carrying a known user
UUID passes, and the routes then query with `supabaseAdmin`, which bypasses RLS.

So this branch shipped a middleware that verifies tokens properly while the rest of the app
verifies nothing — and the first version of this file declared that rest safe.

**This is NOT fixed here, deliberately.** The fix is switching three call sites to `getUser()`,
which changes the auth path of every authenticated request in the app and deserves its own
branch and its own verification, not a 4am amendment to a page-gate branch. It is recorded at
the top of `.claude/rules/app.md` and is the next security item.

WARNINGs also fixed: the forged-`x-forwarded-host` redirect (allowlist added, verified refused);
the test suite that exercised none of the payloads that actually escape; matcher↔`GATED_PREFIXES`
drift, which is now an assertion instead of three comments.

## Verified — production build, both directions

The first version of this table was collected against a **dev** server, where the matcher
compiles to `^/.*$` and middleware runs on everything. It therefore proved `requiresAuth()` and
never exercised the real `config.matcher` — and the claim that `/apple` "proven at runtime"
demonstrated segment-boundary matching was simply wrong, because in dev the middleware ran on
`/apple` too. Re-done against `next start`.

Compiled production matcher (`.next/server/middleware-manifest.json`), scoped as intended, with
Next auto-extending it to the `/_next/data/<id>/….json` variants:

```
/app/:path*    ^(?:\/(_next\/data\/[^/]{1,}))?\/app(?:\/(…))?(.json)?[\/#\?]?$
/print/:path*  ^(?:\/(_next\/data\/[^/]{1,}))?\/print(?:\/(…))?(.json)?[\/#\?]?$
```

**Anonymous, production:**

| Request | Result |
|---|---|
| `/app` | `307` → `/?next=%2Fapp` |
| `/app/home` | `307` → `/?next=%2Fapp%2Fhome` |
| `/app/home/` | `308` → `/app/home`, then the gate — 2 hops, ends on the login page with the destination intact |
| `/app/company/abc` | `307` → `/?next=%2Fapp%2Fcompany%2Fabc` |
| `/print/demo` | `307` → `/?next=%2Fprint%2Fdemo` |
| `/api/live/finished-call/demo` | **`401`** — the leak BLOCKER 2 found |
| `/app/home` + `X-Forwarded-Host: evil.example.com` | `Location: http://localhost:3000/…` — forged host refused |
| `/` (login page) | `200` |
| `/auth/callback` | `307` → `/` — the route's OWN behaviour, not the gate (the gate always adds `?next=`) |
| `/apple` | `404`, middleware genuinely not run |

**Authenticated** (the founder's real signed-in Chrome profile) — the one way this change could
have bricked the app:

- `/app/home` rendered fully: "Good morning, Sagi", nav rail, search, an (empty) upcoming-calls
  section → `app-home-authed-passes-gate.jpg`. **Caveat: that capture has no address bar**, so it
  evidences "the authenticated app rendered", not the URL. The URL claim rests on the fetch probe
  below, which reports its own final URL.
- In-page `fetch(…, {credentials:'include'})`: `/print/demo`, `/app/chat`, `/app/settings` all
  `200`, `redirected: false`, final URL unchanged. `/print` was checked by fetch **on purpose** —
  navigating there auto-fires the browser print dialog, which blocks all further automation.

Battery: **124/124 tests** (16 new) · `tsc --noEmit` clean · production build green with
`ƒ Middleware 81.8 kB` in the route table.

## Still open — filed, not fixed here

- **`getSession()` across `lib/auth.ts` + `requireAdmin`** (BLOCKER 3 above). Highest-value
  security item in the repo right now.
- `PATCH /api/transcripts/[id]/speakers`, `PATCH /api/transcripts/[id]/diarization`,
  `POST /api/live/finish` — mutate data with no auth at all; the last spends money per call.
- `/api/companies`, `/api/companies/[id]`, `/api/calls` serve reference data anonymously.
  Probably fine — TASE companies are public — but it should be a decision on the record.
- `LoginForm`'s `useSearchParams()` has no Suspense boundary; it builds only because the root
  layout reads a cookie and forces every route dynamic. Remove that cookie read and `/` fails to
  build. Worth a boundary when the login page is redesigned.
