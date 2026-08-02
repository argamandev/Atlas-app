# App-level gotchas (read before touching auth, PDF/print, redirects, or the transcripts API)

- **Hebrew PDF** needs a real browser engine — `react-pdf`/`html2canvas` garble Hebrew next to
  numbers. Proper fix = server-side Playwright `page.pdf()`; current stopgap = `window.print()`
  via `/print/[id]`.
- **Sign-out stays a plain `<a href="/api/auth/signout">`** — a z-index overlap once let
  `<main>` swallow the click on a dropdown. Don't reintroduce a dropdown.
- **Railway redirects** must derive origin from `x-forwarded-host`/`x-forwarded-proto`, never
  `request.url` (resolves to internal `localhost:8080`).
- **`bin/yt-dlp.exe` goes stale fast** — YouTube 403s builds a few weeks old; fix = its own
  self-updater (`bin/yt-dlp.exe -U`), per checkout (git-ignored). Railway installs fresh at build.
- **PUT /api/transcripts/[id] validation is intentionally lenient** (`.passthrough()`,
  `role: z.string()`) — legacy rows have `role: "unknown"`. Don't tighten to an enum.
- **`/app/*` and `/print/*` ARE gated** since 2026-08-01 — `src/middleware.ts` + the unit-tested
  `src/lib/auth/gate.ts`. Two rules if you touch it: use `getUser()` (revalidates the token),
  never `getSession()` (trusts an attacker-controlled cookie); and validate `?next=` with
  `safeNextPath()` before redirecting, or the gate becomes an open redirect. Keep
  `config.matcher` in sync with `GATED_PREFIXES`.
- **✅ CLOSED 2026-08-02 — `getSession()` is gone; use `lib/auth/verifyUser.ts`, never reintroduce
  it.** `git grep -n "auth\.getSession()" -- src` returns nothing on main, and it must keep
  returning nothing. **The trap it was, so nobody re-adds it:** in auth-js 2.105.4 `getSession()`
  reads the session **out of the cookie** — a shape check plus an `expires_at` the cookie itself
  supplies — with NO signature check and NO network call (`GoTrueClient.__loadSession`). Supabase
  wraps the returned user in a warning proxy on the server precisely because of this. A forged
  cookie carrying a known user UUID passed, and the routes then queried with `supabaseAdmin`,
  which bypasses RLS. `getUser()` revalidates the token; that is the only acceptable primitive
  for a cookie-based check. **The lesson that outlived the bug: it was FIVE call sites, not the
  three this rule claimed for a day** — the count had been hand-carried through this rule, the
  board, the founder brief and the security notes, and every copy was wrong. The two missed ones
  were the PUT edit-rights check in `api/transcripts/[id]` that `docs/DATA-MODEL.md` flags as
  load-bearing, i.e. a "fixed all three" lane would have shipped believing the path was closed.
  **A count in a document comes from a command, never from another document.** Filed 2026-08-01
  at review of the login-gate branch (not introduced by it, deliberately not smuggled into it);
  fixed on `feat/workspace-backend`, merged 2026-08-02.
- **Still true after that fix: `supabaseAdmin` bypasses RLS, so RLS protects only what queries
  through the USER's client.** Verifying who the caller is was the prerequisite, not the whole
  job. `lib/db/projects.ts` is the pattern to copy — user client, RLS load-bearing, with a
  comment at each site saying so. The older `lib/db/` modules (`conversations`, `quotes`,
  `quoteFolders`, `transcripts`, …) still use `supabaseAdmin` and remain responsible for their
  own ownership filtering in application code. Do not read "the auth fix landed" as "the data
  layer is safe".
- **API auth is PER-ROUTE and incomplete — never assume a route is protected, check it.** The
  old blanket claim "API routes ARE auth-gated" was false. 14 of 24 call the helpers above;
  `/api/access-request` + `/api/auth/signout` + the two `/api/live` feeds are public by design;
  `/api/companies*` and `/api/calls` serve reference data anonymously (undecided, not obviously
  wrong). STILL OPEN (page gate does NOT cover them — they are direct API calls): `PATCH
  /api/transcripts/[id]/speakers`, `PATCH /api/transcripts/[id]/diarization` and `POST
  /api/live/finish` mutate data with NO auth at all; the last one spends money per call.
  `GET /api/live/finished-call/[id]` was the same class — it returned the whole transcript that
  `/print/[id]` renders — and was closed 2026-08-01 when gating the page alone proved not to.
- **A line that mixes Hebrew and Latin needs `<bdi>`, not `dir` — 3rd occurrence, so it is now
  a rule.** `dir="auto"` resolves from the line's FIRST strong character, so one Hebrew name at
  the start flips the whole line and throws every trailing Latin run's punctuation to the far
  side; `dir="ltr"` on a wrapper does the mirror-image damage to Hebrew. Occurrences: the
  "sheets 4" metadata line (feat/pinge), a `dir="ltr"` reversing a Hebrew sentence
  (feat/surfaces-import), and a `<cite>` orphaning an English marker's period
  (fix/surfaces-export-marker). **The remedy is always the same: wrap each mixed run in its own
  `<bdi>`** (it defaults to `dir="auto"`, so each run resolves independently) and set direction
  on the container, never on the mixed line. Iron rule 5's "test bidi visually" means *look at
  BOTH locales* — every one of these passed typecheck, tests, and an EN-only screenshot pass.
- **Design parity is verified against the RENDERED design, never bundle CSS** (7-round lesson,
  2026-07-14): probe computed styles / canvas `measureText` on the live design page. The design
  uses TWO system stacks — body = SF Pro Text stack (→ Segoe UI on Windows), headlines
  (`fontFamily.head`) = SF Pro Display stack WITHOUT system-ui (→ Arial on Windows). Bundle CSS
  can be a stale iteration of the design.
- **Company-overview extras + Home quarter tag are STUB-FED** (`lib/company/overview-stub.ts`,
  hardcoded "Q2 2026" on Home) — fabricated demo facts on real pages. Must gain demo markers /
  real feeds before launch (FINDINGs filed 2026-07-14). Same class: a failed `/api/documents`
  fetch silently falls back to the fabricated stub report in FacetPanes (FINDING 2026-07-17);
  a >2MB Pinge snip renders as a chip client-side but is silently stripped server-side, model
  answers without the image (FINDING 2026-07-23). Recurring class: degradation must be VISIBLE
  — never render success UI for content the server dropped.
- **pdf.js (Report pane) gotchas:** browser imports the COMMITTED `public/pdf.min.mjs` +
  `pdf.worker.min.mjs` natively (Next 14 webpack mangles the pdfjs ESM bundle) — re-sync both
  on any pdfjs-dist bump. `getDocument({data})` DETACHES the passed Uint8Array — hand it a
  copy if you still need the bytes. When adopting a mechanism from pdf.js's own viewer (e.g.
  the `endOfContent` selection guard), copy its WHOLE CSS cluster — a companion rule 3 rules
  away (`z-index` on glyph spans) was load-bearing; grep the upstream stylesheet for every
  selector touching the element.
- **NEVER run `npm run build` while a dev server is up in the same checkout.** They share one
  `.next`, so the build overwrites the running server's chunks: every `/_next/static/*` 404s and
  routes die with `Cannot find module './vendor-chunks/*.js'` / `MODULE_NOT_FOUND`. It looks like
  the app broke, and it wrecks whatever the founder was mid-way through testing (2026-08-02 —
  it killed a live verification pass). Stop the dev server first, or build in another worktree.
  Recovery is the documented one: kill dev, delete `.next`, restart, then hard-refresh the tab
  (it is holding 404ing chunk URLs).
- **A Server Component may not pass a FUNCTION to a Client Component — and neither `tsc` nor
  `next build` will tell you.** The rule is enforced at render time ("Functions cannot be passed
  directly to Client Components"), so the page 500s while every gate in the repo stays green.
  Occurrence 2026-08-02: `app/chat/projects/[id]/page.tsx` passed `renderMain` to `ChatView`,
  which broke EVERY project page — the feature had never rendered once, and it shipped with a
  green battery behind it. Remedy: create the closure on the client side of the boundary (the
  route passes plain data to a `'use client'` wrapper — `components/projects/ProjectChat.tsx`).
  The wider lesson is the same one this file keeps filing: **a green typecheck/build is not
  evidence that a page renders.** Load the route in a browser, or at minimum watch the dev-server
  log return 200 for that exact URL.
- **Mutable private resources are served `no-store`** — a bad response + long max-age once
  pinned a 0-byte PDF past the server-side fix; hard refresh does NOT purge fetch()-cached
  entries (purge needs `fetch(url,{cache:'reload'})`). Storage paths are stable per
  company+quarter, so re-ingests must not be cacheable.
