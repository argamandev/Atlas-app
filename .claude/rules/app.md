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
- **API auth is PER-ROUTE and incomplete — never assume a route is protected, check it.** The
  old blanket claim "API routes ARE auth-gated" was false. 12 of 24 call `getRequestUserId`/
  `getCurrentUser`; `/api/admin/requests` gates itself inline; `/api/access-request` +
  `/api/auth/signout` + the two `/api/live` feeds are public by design; `/api/companies*` and
  `/api/calls` serve reference data anonymously (undecided, not obviously wrong). STILL OPEN
  (filed 2026-08-01, page gate does NOT cover them — they are direct API calls): `PATCH
  /api/transcripts/[id]/speakers`, `PATCH /api/transcripts/[id]/diarization` and `POST
  /api/live/finish` mutate data with NO auth at all; the last one spends money per call.
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
- **Mutable private resources are served `no-store`** — a bad response + long max-age once
  pinned a 0-byte PDF past the server-side fix; hard refresh does NOT purge fetch()-cached
  entries (purge needs `fetch(url,{cache:'reload'})`). Storage paths are stable per
  company+quarter, so re-ingests must not be cacheable.
