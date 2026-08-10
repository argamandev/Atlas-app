# App-level law — auth · bidi · time · what a screen says · traps that report success

Every law here was paid for by a defect. The **case** — what it cost, how it was found, what the
wrong fix was — is one Read away in `docs/case-history/app.md#<anchor>`; go there before arguing
with a law, or when you hit its class again. **A NEW case files the LAW here, imperative and
short, and the STORY there.** This file loads into every turn of every session; it was 4,121
words on 2026-08-10, which is what the split fixed. Do not grow it back.

## Auth & data access

- **`/app/*` and `/print/*` are gated** — `src/middleware.ts` + `src/lib/auth/gate.ts`. Use
  `getUser()`, which revalidates the token; **NEVER `getSession()`**, which reads the session out
  of an attacker-controlled cookie with no signature check — a forged one carrying a known UUID
  passed. `lib/auth/verifyUser.ts` is the primitive, and `git grep "auth\.getSession()" -- src`
  must keep returning nothing. Validate `?next=` with `safeNextPath()` or the gate becomes an
  open redirect; keep `config.matcher` in sync with `GATED_PREFIXES`.
  **Gating a PAGE does not gate the API route that feeds it.**
  → `#app-print-gated`, `#getsession-forged-cookie`
- **Every API route resolves a user, and a TEST enforces it** — `src/lib/apiAuthBoundary.test.ts`
  splits each `route.ts` into its handlers and fails the battery for any that resolves none, with
  a `PUBLIC` allowlist where each entry must state its reason. Two lines in a route:
  `const userId = await getRequestUserId(req)` then `if (!userId) return unauthorized()` (both in
  `src/lib/auth.ts`). **If you are closing a hole and that guard did not fail first, the hole was
  outside its scope — ask why before editing the route.** → `#api-auth-boundary-test`
- **`supabaseAdmin` bypasses RLS, so RLS protects only what queries through the USER's client** —
  and proving WHO is calling is not proving they may touch the row. Authentication is not
  authorisation. `lib/db/projects.ts` is the pattern to copy (user client, RLS load-bearing, a
  comment at each site saying so). The older `lib/db/` modules — `conversations`, `quotes`,
  `quoteFolders`, `transcripts`, … — still use `supabaseAdmin` and own their filtering in
  application code. Never read "the auth fix landed" as "the data layer is safe".
  → `#supabase-admin-bypasses-rls`, `#authn-is-not-authz`
- **`DEMO_USER_ID` is deleted and must never return.** 16 API sites + 2 server components once
  fell back to one fixed uuid, so unidentified callers read and wrote ONE shared identity's real
  rows. If something won't compile looking for it, the answer is `unauthorized()` on a route or
  rendering nothing on a page — never a shared identity. The guard is the
  `nothing under src/app falls back…` case in `apiAuthBoundary.test.ts`, not a grep: the
  identifier still appears ~14 times in comments explaining its own removal. → `#demo-user-id`
- **Gating an endpoint changes every caller's ERROR path, not just its happy path.** `git grep`
  the endpoint, open every caller, and answer "what does this do with a 401?" — revert the
  optimistic state, or send the user to sign in (`loginRedirectTarget`). Never invent a cause: a
  "the model was unavailable" banner for an expired session is worse than a generic one, and its
  retry button loops forever. → `#gating-changes-error-paths`
- **PUT `/api/transcripts/[id]` validation is intentionally lenient** (`.passthrough()`,
  `role: z.string()`) — legacy rows have `role: "unknown"`. Don't tighten it to an enum.

## Hebrew, bidi & time

- **A line MIXING Hebrew and Latin gets a `<bdi>` per run with `dir` on the CONTAINER — never
  `dir` on the mixed line.** This repo's most-repeated defect (7 occurrences; the last two landed
  inside the branch that quotes this rule). `dir="auto"` resolves from the line's FIRST strong
  character, so one Hebrew word at the start flips the whole line and throws every trailing Latin
  run's punctuation to the far side; `dir="ltr"` does the mirror-image damage to Hebrew, and is
  right for a BARE numeral or ticker only.
  **Two commands, neither optional.** (1) `git grep -n 'dir="ltr"' -- src` — fix the CONSTRUCT
  repo-wide, not the component; fixing one instance is precisely what hid the others. (2) **Prove
  it renders differently, in a browser**: put the old `dir` back on the live element and
  re-measure the runs' x-positions — a `<bdi>` that changes nothing looks exactly like one that
  fixes everything. Every occurrence passed typecheck, tests, and an EN-only screenshot pass, so
  iron rule 5's "test both locales" means *go and look at both*. → `#bidi-bdi`
- **NEVER format an instant without a `timeZone`. A Server Component formats on the SERVER, and
  the server is not in Israel.** Home listed every investor call three hours early on the live
  host while `/app/calendar` rendered the same event correctly — one event, two surfaces, three
  hours apart, and invisible on every machine it was developed on because they are all in Israel.
  **THE LAW (founder decision 2026-08-09): Atlas renders ISRAEL TIME for every viewer in every
  timezone.** `src/lib/i18n/format.ts` pins `ISRAEL_TZ`; use its `israelDayKey` /
  `israelMonthParts` for ANY day/month bucketing, because local date parts put a row stored at
  Israel midnight on the wrong day for viewers either side of Israel. Don't decide it inline in
  JSX — extract and unit-test it (`lib/calendar/event-meta.ts`); inline-in-JSX is where the last
  two defects on this lane survived. → `#timezone-israel`
- **Run the battery under `TZ=UTC` as well as locally** — a test that only ever runs in one
  environment asserts that environment, not the property: the whole battery passed while
  production was wrong. Removing the pin turns 7 of 8 `format.test.ts` cases red under `TZ=UTC`.
  ⚠ **In Git Bash a `TZ=` value containing `/` is SILENTLY DROPPED** by MSYS path conversion, so
  `TZ=America/New_York npm test` runs in `Asia/Jerusalem` and prints a reassuring green; only
  slash-free names survive. **Verify the zone, never the command** — print
  `Intl.DateTimeFormat().resolvedOptions().timeZone` inside the run, or set it from PowerShell
  (`$env:TZ=…`), which passes it intact. → `#timezone-israel`

## What a screen says

- **Degradation must be VISIBLE — never render success UI for content the server dropped, and
  never add a stub to fill a designed slot.** Four invented Hebrew slides about a company's
  imaginary Gulf sovereign-wealth-fund exposure were shown for every call of every company on the
  live host, with only a code comment admitting it. A failed fetch says so, on screen.
  → `#stubs-on-designed-slots`
- **When a decision rests on a NATURAL-LANGUAGE CLASSIFIER over an open vocabulary, buy VISIBLE
  FAILURE, not a longer word list** — Hebrew and English both have unbounded ways to say the same
  thing, so no vocabulary ever closes it; what closes it is that being wrong cannot lie. **Put the
  invariant at the ONE choke point every result passes through, never in the branch where the bug
  was found**, and make the lying state unrepresentable. A guard in the branch is a patch wearing
  an invariant's clothes — it leaves every other path to the same lie open.
  → `#classifier-visible-failure`
- **A choke point is only as honest as its INPUTS.** Ask what the question is ABOUT and pass
  THAT, not a proxy for it: a proxy makes the choke point decide confidently and wrongly, and a
  test written beside it makes the lie permanent — **an untrue sentence certified by a green test
  is strictly worse than an unguarded one**, because the mechanism that catches recurrence now
  points the wrong way. → `#choke-point-inputs`
- **For anything that decides what a screen SAYS, enumerate the states and go and look at each
  one, in both locales.** A four-round defect lived in a state nobody had ever rendered and was
  invisible to 610 passing tests, `tsc` exit 0 and a green build. → `#choke-point-inputs`
- **A Server Component may not pass a FUNCTION to a Client Component** — the rule is enforced at
  render time, so the page 500s while `tsc` and `next build` stay green. It once broke EVERY
  project page: the feature had never rendered once and shipped with a green battery behind it.
  Create the closure on the client side of the boundary (`components/projects/ProjectChat.tsx`).
  **A green typecheck/build is not evidence that a page renders** — load the route, or at minimum
  watch the dev-server log return 200 for that exact URL. → `#server-component-function-prop`
- **Design parity is verified against the RENDERED design, never bundle CSS** — probe computed
  styles / canvas `measureText` on the live design page. Two system stacks: body = SF Pro Text
  (→ Segoe UI on Windows), headlines (`fontFamily.head`) = SF Pro Display WITHOUT system-ui
  (→ Arial). Bundle CSS can be a stale iteration of the design. → `#design-parity`

## Media, PDF & platform

- **`player.load()` does not give the `<audio>` its source until the NEXT render — so `load()`
  then `play()` in one handler plays NOTHING.** State set through React is not state the DOM has
  yet, so an intent that must reach a media element inside one gesture has to be REMEMBERED:
  `pendingPlayRef` / `pendingSeekRef` in `lib/player/PlayerProvider.tsx`, replayed on `canplay`
  and cleared by any pause/close so a remembered press can't restart audio the user has stopped.
  → `#player-load-then-play`
- **Hebrew PDF needs a real browser engine** — `react-pdf`/`html2canvas` garble Hebrew next to
  numbers. Proper fix = server-side Playwright `page.pdf()`; stopgap = `window.print()` via
  `/print/[id]`. → `#hebrew-pdf`
- **pdf.js:** the browser imports the COMMITTED `public/pdf.min.mjs` + `pdf.worker.min.mjs`
  natively (Next 14 webpack mangles the pdfjs ESM bundle) — re-sync both on any pdfjs-dist bump.
  `getDocument({data})` DETACHES the passed Uint8Array — hand it a copy if you still need the
  bytes. Adopting a mechanism from pdf.js's own viewer means copying its WHOLE CSS cluster: grep
  the upstream stylesheet for every selector touching the element, because a companion rule three
  rules away was load-bearing. → `#pdfjs`
- **Sign-out stays a plain `<a href="/api/auth/signout">`** — a z-index overlap once let `<main>`
  swallow the click on a dropdown. Don't reintroduce a dropdown.
- **Railway redirects derive origin from `x-forwarded-host`/`x-forwarded-proto`**, never
  `request.url` (which resolves to the internal `localhost:8080`). `resolveOrigin` REFUSES the
  header unless `NEXT_PUBLIC_SITE_HOST` matches, so an unset or stale value silently reintroduces
  the bug on the next domain change. → `#railway-redirects`
- **Mutable private resources are served `no-store`** — a bad response plus a long max-age once
  pinned a 0-byte PDF past the server-side fix, and a hard refresh does NOT purge fetch()-cached
  entries (that needs `fetch(url, {cache:'reload'})`). Storage paths are stable per
  company+quarter, so re-ingests must not be cacheable. → `#no-store-mutable-private`
- **`bin/yt-dlp.exe` goes stale fast** — YouTube 403s builds a few weeks old; fix is its own
  self-updater (`bin/yt-dlp.exe -U`), per checkout (git-ignored). Railway installs fresh at build.
  → `#yt-dlp-staleness`

## Traps that report success

*One family: the tool answered the question you typed, and the question you typed was not the
question you meant.*

- **A COUNT IN A DOCUMENT COMES FROM A COMMAND, NEVER FROM ANOTHER DOCUMENT.** Filed three times
  in this file alone: "three call sites" was five, "two routes" was 16 across 8 files, and a
  closure claim that a grep refuted the same day. Every restatement had been hand-carried between
  documents, and each copy was wrong. **Claim the call sites, never the corpus** — a scoped law
  that overstates its own closure is the exact failure this file exists to prevent.
  → `#getsession-forged-cookie`, `#api-auth-boundary-test`, `#stubs-on-designed-slots`
- **A SCRIPTED EDIT CAN SILENTLY MATCH NOTHING.** This repo has no `.gitattributes` while
  `core.autocrlf=true`, so the working tree can be CRLF while every blob is LF: a pattern written
  with `\n` matches zero times and reports success. A bare `\r` is also a legal TypeScript line
  terminator, so a CRLF-committed file typechecks and runs while welding two keys onto one
  physical line. **After any scripted edit, both:** compare `git diff --stat` against
  `git diff -w --stat` — wild disagreement means you rewrote line endings, not content — and
  **grep for the RESULT you intended**, because a no-op edit and a perfect edit produce the same
  silence. → `#crlf`
- **NEVER run `npm run build` while a dev server is up in the same checkout** — they share one
  `.next`, so the build overwrites the running server's chunks: every `/_next/static/*` 404s and
  routes die with `MODULE_NOT_FOUND`. It looks like the app broke, and it wrecks whatever the
  founder was mid-way through testing. Stop the dev server first, or build in another worktree.
  Recovery: kill dev, delete `.next`, restart, then hard-refresh the tab. → `#build-vs-dev-server`

## Open, deliberately — each needs a window or a decision, not a drive-by fix

- **`GET /api/live/{state,pcm}` are unauthenticated**, in the boundary test's allowlist. The
  mitigation once written for them is FALSE and was refuted the same day: both read
  `process.env.LIVE_ENGINE_URL || 'http://localhost:8788'`, and that variable exists precisely to
  point a deploy at a tunnelled engine. They are inert on `www.timlul-ai.com` only because it is
  unset — one dashboard field wide. **⇒ Gate them in the SAME change that sets it. A follow-up is
  not a plan, it is the window.** → `#api-auth-boundary-test`
- **`.gitattributes`** — `* text=auto eol=lf` would close the CRLF class structurally, but it is a
  repo-wide behavioural change and must not ride in on a feature merge. Founder/fleet decision.
  → `#crlf`
- **Two UTC leaks, not user-visible:** `api/workspaces/[id]/intake/route.ts:542` (UTC `{TODAY}`,
  server-local `{Y0}/{Y1}`) and `lib/maya/events.ts:83` (`getUTCFullYear` labelling "FY 2024").
  → `#timezone-israel`
- **A >2MB Pinge snip** renders as a chip client-side but is silently stripped server-side, and
  the model answers without the image (FINDING 2026-07-23) — the "degradation must be visible"
  class, still open. → `#stubs-on-designed-slots`
