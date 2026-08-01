# Login gate — verification (fix/app-login-gate, 2026-08-01)

Closes the long-standing pre-launch gap: API routes were auth-gated but **pages were not**.
Anyone who typed `/app/home` walked into the app, and `/print/[id]` server-rendered a whole
transcript to anyone holding the URL.

## What shipped

- `src/middleware.ts` — the gate. Runs only on `/app/:path*` and `/print/:path*`.
- `src/lib/auth/gate.ts` — the pure decision logic, unit-tested (10 tests).
- `src/components/auth/LoginForm.tsx` — honours `?next=` so you return where you were headed.

Two deliberate choices, both load-bearing:

1. **`getUser()`, not `getSession()`.** `getSession()` trusts the cookie as presented, and a
   cookie is attacker-controlled. `getUser()` revalidates the token with Supabase. This is what
   makes it a gate rather than a suggestion. (Supabase's own guidance for server code.)
2. **Redirect origin comes from `x-forwarded-host`/`x-forwarded-proto`**, never `request.url`.
   Behind Railway, `request.url` resolves to the internal `localhost:8080` and the redirect goes
   nowhere — the trap already recorded in `.claude/rules/app.md`.

`?next=` is validated by `safeNextPath()` before any redirect uses it. Without that, this gate
would have *introduced* an open redirect: a phishing link landing on our real login page and
bouncing to an attacker's clone after a genuine sign-in.

## Verified with my own eyes, both directions

**Anonymous** (`curl`, no cookies, dev server :3000) — every gated route bounces, destination
preserved:

| Request | Result |
|---|---|
| `/app` | `307` → `/?next=%2Fapp` |
| `/app/home` | `307` → `/?next=%2Fapp%2Fhome` |
| `/app/chat` | `307` → `/?next=%2Fapp%2Fchat` |
| `/app/settings` | `307` → `/?next=%2Fapp%2Fsettings` |
| `/app/company/abc` | `307` → `/?next=%2Fapp%2Fcompany%2Fabc` |
| `/print/demo` | `307` → `/?next=%2Fprint%2Fdemo` |

**Not gated, confirmed still open** — gating any of these would lock everyone out:

| Request | Result |
|---|---|
| `/` (login page) | `200` |
| `/auth/callback` | `307` → `/` — the route's OWN behaviour, not the gate (the gate always adds `?next=`) |
| `/apple` | `404`, not a redirect — prefix matching is on a segment boundary, proven at runtime and not only in unit tests |

**Authenticated** (the founder's real signed-in Chrome profile) — the gate does not break a
valid session, which was the one way this change could have bricked the app:

- `/app/home` rendered fully: "Good morning, Sagi", nav rail, search, upcoming calls
  → `app-home-authed-passes-gate.jpg`
- In-page `fetch(..., {credentials:'include'})`: `/print/demo`, `/app/chat`, `/app/settings`
  all `200`, `redirected: false`, final URL unchanged.
  `/print` was checked by fetch **on purpose** — navigating there auto-fires the browser print
  dialog, which blocks all further automation.

Battery: **118/118 tests** (10 new) · `tsc --noEmit` clean · production build green, with
`ƒ Middleware 81.8 kB` present in the route table.

## What this does NOT fix — found while mapping, filed not fixed

Three API routes mutate data with **no authentication whatsoever**. They are out of scope for a
page-level gate and must not be smuggled into this branch:

- `PATCH /api/transcripts/[id]/speakers` — rewrite speaker names on any transcript
- `PATCH /api/transcripts/[id]/diarization` — rewrite diarization on any transcript
- `POST /api/live/finish` — trigger the finish pipeline (Gemini + MP3 encode: real money)

Also worth a deliberate decision rather than an accident: `/api/companies`, `/api/companies/[id]`
and `/api/calls` serve reference data anonymously. Probably fine — TASE companies are public —
but it should be a choice on the record.

Correctly gated and NOT a finding: `/api/admin/requests` carries its own inline `requireAdmin()`
(session + `profiles.role === 'admin'`); `/api/access-request` and `/api/auth/signout` are
public by design; `/api/live/state` and `/api/live/pcm` feed the live viewer.

**Net:** 12 of 24 API routes call a shared auth helper, one gates itself inline, several are
intentionally public, and three are genuine holes. The old blanket claim "API routes ARE
auth-gated" was too generous and has been corrected in `.claude/rules/app.md`.
