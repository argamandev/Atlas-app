# App-level gotchas (read before touching auth, PDF/print, redirects, or the transcripts API)

- **Hebrew PDF** needs a real browser engine — `react-pdf`/`html2canvas` garble Hebrew next to
  numbers. Proper fix = server-side Playwright `page.pdf()`; current stopgap = `window.print()`
  via `/print/[id]`.
- **Sign-out stays a plain `<a href="/api/auth/signout">`** — a z-index overlap once let
  `<main>` swallow the click on a dropdown. Don't reintroduce a dropdown.
- **Railway redirects** must derive origin from `x-forwarded-host`/`x-forwarded-proto`, never
  `request.url` (resolves to internal `localhost:8080`). **Confirmed in production 2026-08-08** —
  the first time this was observed rather than reasoned about: anonymous `/app/home` on the live
  host 307s to `https://www.timlul-ai.com/?next=%2Fapp%2Fhome`, the public host. It works only
  because `NEXT_PUBLIC_SITE_HOST` is set to match — `resolveOrigin` REFUSES the header when it
  does not, so an unset or stale value silently reintroduces the bug on the next domain change.
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
- **✅ CLOSED 2026-08-03 — API auth is now a TEST, not a habit: `src/lib/apiAuthBoundary.test.ts`.**
  It splits every `route.ts` under `src/app/api` into its exported handlers and fails the battery
  for any method that resolves no user, with a `PUBLIC` allowlist where every entry must state
  its reason. **Do not close a hole here by editing a route alone — if the guard did not fail
  first, the hole was not in its scope and you should ask why.** The pattern in a route is two
  lines: `const userId = await getRequestUserId(req)` then `if (!userId) return unauthorized()`
  (`unauthorized()` lives beside `getRequestUserId` in `src/lib/auth.ts`).
  **What it replaced, kept because the shape recurs:** three methods had NO auth at all — the two
  `PATCH /api/transcripts/[id]/{speakers,diarization}` mutations (both write via `supabaseAdmin`,
  which bypasses RLS, and diarization rebuilds the WHOLE boundary list from one call) and
  `GET`+`POST /api/live/finish` (POST fires the finish pipeline, i.e. it spends money per call).
  `POST /api/chat` resolved a user ONLY when a document or snip was attached, so a plain question
  — the common case — ran anonymously against the founder's model key. `GET /api/live/finished-call/[id]`
  was the same class, closed 2026-08-01 when gating the page alone proved not to.
  **The counting lesson, again, and this is its third filing:** this rule itself said the shared-identity
  fallback was in two routes. `grep -rn "?? DEMO_USER_ID" src/app/api | wc -l` said **16 sites across
  8 files**. Every restatement had been hand-carried between documents. A count in a document comes
  from a command.
  **One exception survives on purpose, in the guard's allowlist with its reason:**
  `GET /api/live/{state,pcm}`. **Do not repeat the mitigation that was written for it and refuted
  the same day** — "they proxy a localhost-only engine so a deployed Atlas cannot reach them" is
  FALSE: both read `process.env.LIVE_ENGINE_URL || 'http://localhost:8788'`, and that variable
  exists precisely to point a deploy at a tunnelled engine. The bound holds only while it is
  unset, which is deploy-time configuration, not a property of the code. **⇒ gate them BEFORE
  `LIVE_ENGINE_URL` is ever set in a deployed environment.** Doing it safely needs a live run with
  the engine up (`rules/live.md`) and a latency measurement on `/pcm`, which is polled continuously.
  **A DEPLOYED ENVIRONMENT NOW EXISTS (2026-08-08, `www.timlul-ai.com`), so the sentence above
  stopped describing a future.** Verified on that host the same day: `/api/live/state` returns
  `offline:true`, so the variable is unset and both endpoints are inert. The bound is now one
  dashboard field wide, and the reason someone will want to set it — pointing Atlas at a tunnelled
  engine for a real call — is scheduled work, not a hypothetical. **Gate them in the SAME change
  that sets it. A follow-up is not a plan, it is the window.**
- **Gating an endpoint changes every caller's ERROR path, not just its happy path — enumerate the
  callers before you merge the guard.** Filed after `fix/api-security` hit it FOUR times in one
  branch. Removing an anonymous fallback makes a 401 reachable where it never was, and the callers
  were all written when the request could not fail: `LiveSession`'s poll read a 401 as "still
  processing" and span forever; the `/live-test` skill's recipe had the same bug in prose;
  `CalendarView.follow()` and two `MyQuotes` mutations kept their optimistic state on refusal,
  showing a call followed or a folder deleted that the server rejected. **The remedy is mechanical:
  `git grep` the endpoint, open every caller, and answer "what does this do with a 401?" — revert
  the optimistic state, or send the user to sign in (`loginRedirectTarget`). Never invent a cause:
  a "the model was unavailable" banner for an expired session is worse than a generic one, and its
  retry button loops forever.**
- **`DEMO_USER_ID` is DELETED (2026-08-03) and must never come back.** It was a fixed uuid used
  "when there is no auth session", and 16 API sites plus two server components fell back to it, so
  unidentified callers read and wrote ONE shared identity's real rows. If something fails to
  compile looking for it, the answer is `unauthorized()` on a route or rendering nothing on a page
  — never a shared identity. It was removed rather than left unused precisely so nothing can
  re-import it.
- **Authentication is not authorisation — the guard above proves WHO is calling, nothing more.**
  Whether that caller may touch the row it goes on to read is the `lib/db` modules' job, and most
  of them still query through `supabaseAdmin`, which bypasses RLS. See the `supabaseAdmin`
  paragraph above; `lib/db/projects.ts` is the pattern to copy.
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
- **✅ CLOSED 2026-08-09 — the company-overview stubs and the Home quarter tag are GONE, replaced
  by a real feed rather than by a demo marker.** `lib/company/overview-stub.ts` no longer exists
  (`git ls-files` confirms) and the three `quarter="Q2 2026"` CALL SITES — Home, `/app/live/[id]`
  and the Agents page — are removed.
  ⚠ **CORRECTED 2026-08-09, same day, and the correction is the point:** this entry first read
  *"every surviving `Q2 2026` in `src` is a comment explaining its own removal"*. That is FALSE.
  `git grep -n "Q2 2026" -- src` returns **five live data literals** —
  `src/data/demo/liveCall.ts:12`, `src/lib/agents/data.ts:98`, `src/lib/live/finishLiveCall.ts:332`
  and `:363`, `src/lib/workspace/data.ts:82` — in demo/stub fixtures (the Agents page is still
  stub-fed). Nothing user-facing regressed, but **a scoped law that overstates its own closure is
  the exact failure this file exists to prevent**, and it was written into two documents before a
  reviewer ran the grep without a `head` truncation on it. Claim the call sites, never the corpus.
  The FINDINGs filed 2026-07-14 are closed by `feat/company-profiles`: sector,
  sub-sector and description now come from MAYA's `company-details` and are populated for
  **234 of 234** companies. **The rule that outlived them, and the reason this entry stays:** the
  fabricated IR contact and index chips were *identical for every issuer* and sat on a real page
  with only a code comment admitting it — nothing on screen. Both are now restorable as facts
  (`company-details` carries phone/email/address; `securityIncludedIndices` carries index
  membership with weights), so if they return they return as data. **Do not re-add a stub to
  fill a designed slot.** Same class, still open: a failed `/api/documents`
  fetch silently falls back to the fabricated stub report in FacetPanes (FINDING 2026-07-17);
  a >2MB Pinge snip renders as a chip client-side but is silently stripped server-side, model
  answers without the image (FINDING 2026-07-23). Recurring class: degradation must be VISIBLE
  — never render success UI for content the server dropped.
- **4th occurrence of that class, and it added a rule of its own: when a decision rests on a
  NATURAL-LANGUAGE CLASSIFIER over an open vocabulary, buy VISIBLE FAILURE, not a longer word
  list.** `feat/workspace-tables` (merged 2026-08-08) took THREE review rounds on one function,
  and rounds 1 and 2 each ended with the fix opening the next round's door — both times by trying
  to decide *more precisely* what the analyst meant. Round 1: a union restored files the analyst
  had narrowed away. Round 2: the fix returned an empty set while the route still said
  `status:'ready'`, so Atlas announced *"I'm pulling them in now"* over nothing — and it fired on
  ordinary agreements, because the narrowing vocabulary holds `לא`/`no`, which open a WIDENING as
  often as a cut. Round 3 stopped patching vocabularies: the route was given ONE exit
  (`respond()` → `intakeResult`) that makes `ready` + an empty selection **unrepresentable**, so a
  resolution failure asks a question naming which of the two ways it failed. **The classifier is
  still wrong about "לא, את כולם" and that is now acceptable** — Hebrew and English both have
  unbounded ways to say "only those two", so no list ever closes it; what closes it is that being
  wrong cannot lie. **The shape to copy: put the invariant at the single choke point every result
  passes through, never in the branch where the bug was found.** A guard in the branch is a patch
  wearing an invariant's clothes — it leaves every other path to the same lie open.
- **`player.load()` does not give the `<audio>` its source until the NEXT render — so `load()`
  then `play()` in one handler plays NOTHING.** `load()` only sets React state; an effect points
  the element at the URL and calls `a.load()` a render later, which rejects (and then aborts) a
  `play()` issued in the same tick. Every surface that loads and plays together — the workspace's
  "Play the recording", clicking a word to hear it — therefore started nothing until it was
  pressed a SECOND time. It hid because the pane lit its karaoke up on the press regardless: the
  only tell was silence, and the errors were swallowed by a `.catch(() => {})`. Fixed 2026-08-05
  with `pendingPlayRef` in `lib/player/PlayerProvider.tsx` — the twin of the `pendingSeekRef`
  that already existed for the same reason — replayed once on `canplay` and cleared by any
  pause/close, so a remembered press can never restart audio the user has since stopped.
  **The general lesson: state set through React is not state the DOM has yet, so an intent that
  must reach a media element inside one gesture has to be REMEMBERED, not fired and hoped.** It
  was found only because gating the karaoke on real playback (`lib/live/syncMode.ts`) removed the
  false feedback that had been standing in for the audio.
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
