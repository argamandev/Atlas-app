# Case history — the app-level defects behind `.claude/rules/app.md`

<!-- WHAT THIS IS. Every bullet below is the VERBATIM text that lived in
     .claude/rules/app.md until 2026-08-10, when the law was extracted into a short
     always-on rules file and the forensic record moved here. Nothing was rewritten;
     only `## anchor` headings were added above each entry so the rules file can point
     at one.

     WHY IT MOVED. rules/*.md load into EVERY turn of EVERY session. This file was
     4,121 words of it — 62% of the whole always-on preamble — and most of it was the
     story of a bug that is already fixed. The lessons must be in context; the
     forensics only need to be findable.

     WHEN TO READ IT. When you hit a class of defect the rule names and want the
     concrete failure; when you are about to argue with a law and want to know what it
     cost; when a reviewer asks "has this happened before?". The rules file links each
     law to its anchor here.

     WHERE A NEW CASE GOES. The LAW goes in .claude/rules/app.md, short, imperative.
     The STORY comes HERE, appended with its own `##` heading and linked from the law.
     Do not grow the rules file back — that is what this split exists to prevent. -->

Extracted 2026-08-10 from `.claude/rules/app.md` (302 lines, 4,121 words) by the
CLAUDE.md efficiency pass. The law now lives in `.claude/rules/app.md`; this is the
evidence behind it. 24 entries, verbatim.

---


## hebrew-pdf

- **Hebrew PDF** needs a real browser engine — `react-pdf`/`html2canvas` garble Hebrew next to
  numbers. Proper fix = server-side Playwright `page.pdf()`; current stopgap = `window.print()`
  via `/print/[id]`.


## signout-anchor

- **Sign-out stays a plain `<a href="/api/auth/signout">`** — a z-index overlap once let
  `<main>` swallow the click on a dropdown. Don't reintroduce a dropdown.


## railway-redirects

- **Railway redirects** must derive origin from `x-forwarded-host`/`x-forwarded-proto`, never
  `request.url` (resolves to internal `localhost:8080`). **Confirmed in production 2026-08-08** —
  the first time this was observed rather than reasoned about: anonymous `/app/home` on the live
  host 307s to `https://www.timlul-ai.com/?next=%2Fapp%2Fhome`, the public host. It works only
  because `NEXT_PUBLIC_SITE_HOST` is set to match — `resolveOrigin` REFUSES the header when it
  does not, so an unset or stale value silently reintroduces the bug on the next domain change.


## yt-dlp-staleness

- **`bin/yt-dlp.exe` goes stale fast** — YouTube 403s builds a few weeks old; fix = its own
  self-updater (`bin/yt-dlp.exe -U`), per checkout (git-ignored). Railway installs fresh at build.


## transcripts-put-lenient

- **PUT /api/transcripts/[id] validation is intentionally lenient** (`.passthrough()`,
  `role: z.string()`) — legacy rows have `role: "unknown"`. Don't tighten to an enum.


## app-print-gated

- **`/app/*` and `/print/*` ARE gated** since 2026-08-01 — `src/middleware.ts` + the unit-tested
  `src/lib/auth/gate.ts`. Two rules if you touch it: use `getUser()` (revalidates the token),
  never `getSession()` (trusts an attacker-controlled cookie); and validate `?next=` with
  `safeNextPath()` before redirecting, or the gate becomes an open redirect. Keep
  `config.matcher` in sync with `GATED_PREFIXES`.


## getsession-forged-cookie

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


## supabase-admin-bypasses-rls

- **Still true after that fix: `supabaseAdmin` bypasses RLS, so RLS protects only what queries
  through the USER's client.** Verifying who the caller is was the prerequisite, not the whole
  job. `lib/db/projects.ts` is the pattern to copy — user client, RLS load-bearing, with a
  comment at each site saying so. The older `lib/db/` modules (`conversations`, `quotes`,
  `quoteFolders`, `transcripts`, …) still use `supabaseAdmin` and remain responsible for their
  own ownership filtering in application code. Do not read "the auth fix landed" as "the data
  layer is safe".


## api-auth-boundary-test

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
  the engine up (`docs/live-engines.md`) and a latency measurement on `/pcm`, which is polled continuously.
  **A DEPLOYED ENVIRONMENT NOW EXISTS (2026-08-08, `www.timlul-ai.com`), so the sentence above
  stopped describing a future.** Verified on that host the same day: `/api/live/state` returns
  `offline:true`, so the variable is unset and both endpoints are inert. The bound is now one
  dashboard field wide, and the reason someone will want to set it — pointing Atlas at a tunnelled
  engine for a real call — is scheduled work, not a hypothetical. **Gate them in the SAME change
  that sets it. A follow-up is not a plan, it is the window.**


## gating-changes-error-paths

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


## demo-user-id

- **`DEMO_USER_ID` is DELETED (2026-08-03) and must never come back.** It was a fixed uuid used
  "when there is no auth session", and 16 API sites plus two server components fell back to it, so
  unidentified callers read and wrote ONE shared identity's real rows. If something fails to
  compile looking for it, the answer is `unauthorized()` on a route or rendering nothing on a page
  — never a shared identity. It was removed rather than left unused precisely so nothing can
  re-import it.


## authn-is-not-authz

- **Authentication is not authorisation — the guard above proves WHO is calling, nothing more.**
  Whether that caller may touch the row it goes on to read is the `lib/db` modules' job, and most
  of them still query through `supabaseAdmin`, which bypasses RLS. See the `supabaseAdmin`
  paragraph above; `lib/db/projects.ts` is the pattern to copy.


## bidi-bdi

- **A line that mixes Hebrew and Latin needs `<bdi>`, not `dir` — 5th occurrence as of 2026-08-09,
  and the last two landed INSIDE the branch that quotes this rule.** `dir="auto"` resolves from the
  line's FIRST strong character, so one Hebrew name at the start flips the whole line and throws
  every trailing Latin run's punctuation to the far side; `dir="ltr"` on a wrapper does the
  mirror-image damage to Hebrew. Occurrences: the "sheets 4" metadata line (feat/pinge), a
  `dir="ltr"` reversing a Hebrew sentence (feat/surfaces-import), a `<cite>` orphaning an English
  marker's period (fix/surfaces-export-marker), the publication date reading "במרץ 31 2024"
  (feat/documents-catalog, found by the lane), and — twenty lines from that fix, in the same
  branch — the transcript viewer's identity header and the side panel's sub-line, both found by
  the merge reviewer and fixed at merge. **The remedy is always the same: wrap each mixed run in
  its own `<bdi>`** (it defaults to `dir="auto"`, so each run resolves independently) and set
  direction on the container, never on the mixed line. Iron rule 5's "test bidi visually" means
  *look at BOTH locales* — every one of these passed typecheck, tests, and an EN-only screenshot
  pass.
  **⇒ THE ADDENDUM THE 5TH OCCURRENCE EARNED, because fixing one instance is what hid the others:
  when you fix a bidi defect, GREP THE WHOLE REPO FOR THE CONSTRUCT, not the component.**
  `git grep -n 'dir="ltr"' -- src` is the command. The lane fixed `DocumentsTab` and wrote a
  careful comment explaining why, while the identical construct sat on the header its own feature
  feeds a date into — so the catalog's headline screen rendered "ביולי 2026 16" in Hebrew.
  **And prove the fix RENDERS differently, in a browser**: a `<bdi>` that changes nothing looks
  exactly like a `<bdi>` that fixes everything. Set the old `dir` back on the live element and
  re-measure the runs' x-positions; if the order does not change, you fixed nothing. That control
  is what confirmed this one (`docs/evidence/feat-documents-catalog/`).


## design-parity

- **Design parity is verified against the RENDERED design, never bundle CSS** (7-round lesson,
  2026-07-14): probe computed styles / canvas `measureText` on the live design page. The design
  uses TWO system stacks — body = SF Pro Text stack (→ Segoe UI on Windows), headlines
  (`fontFamily.head`) = SF Pro Display stack WITHOUT system-ui (→ Arial on Windows). Bundle CSS
  can be a stale iteration of the design.


## stubs-on-designed-slots

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
  fill a designed slot.** ✅ **CLOSED 2026-08-09 by `feat/documents-catalog`, and it closed the
  RIGHT way — the stubs were DELETED, not gated.** `slideStubs()` and `reportStub()` and their
  module are gone (`git grep` returns only a comment in `FacetPanes.tsx` explaining what used to
  sit there), so the FINDING of 2026-07-17 — a failed `/api/documents` fetch silently falling back
  to a fabricated report — has no fallback left to reach. The panes now end in exactly three
  states: loading · error · noDocument, each with its own sentence, and the reviewer confirmed
  there is no fourth branch. Worth knowing WHAT was being rendered: four invented Hebrew slides
  about אפגלו and Gulf sovereign wealth funds, shown for **every call of every company**, on the
  live host. Still open, same class: a >2MB Pinge snip renders as a chip client-side but is
  silently stripped server-side and the model answers without the image (FINDING 2026-07-23).
  Recurring class: degradation must be VISIBLE — never render success UI for content the server
  dropped.


## classifier-visible-failure

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


## choke-point-inputs

- **5th occurrence, and it is the ADDENDUM the rule above needed: A CHOKE POINT IS ONLY AS HONEST
  AS ITS INPUTS.** `feat/maya-calendar`'s calendar empty state took **four review rounds** to stop
  saying *"Nothing scheduled this month"* over months holding real events, and rounds 2–4 each
  ended with the fix opening the next door. (1) The guard was a JSX condition, `kinds.size > 0`,
  that could NEVER be false: the filter set is seeded with all three event kinds, webinars have
  zero rows so no webinar chip is drawn, so `webinar` can never be switched off. (2) Round 2 did
  the right thing — moved the decision into one testable function — and then handed it a **PROXY**:
  whole-feed event kinds intersected with the selected ones. That answers *"are any selectable
  kinds switched on?"* when the question is *"does THIS MONTH hold anything the filter is
  hiding?"*, so it still lied whenever a month's events were all of the filtered-away kind
  (`2026-11` holds 2 reports and 0 calls and reproduced it). (3) **The test written beside it
  asserted that outcome, so the battery DEFENDED the defect** — an untrue sentence certified by a
  green test is strictly worse than an unguarded one, because the mechanism that catches
  recurrence is now pointing the wrong way. (4) The supervisor's own fix then said the same untrue
  thing in the other view mode, inside the commit whose whole subject was this class.
  **It closed when the function was given the two counts it was actually deciding between**
  (what survives every filter, and what the month holds before filtering) — the fact itself, not a
  stand-in for it. ⇒ **Putting the invariant at a choke point is necessary and NOT sufficient. Ask
  what the question is ABOUT, and pass THAT.** A proxy input makes the choke point decide
  confidently and wrongly, and the adjacent test makes it permanent.
  **The second half, which is why it survived three rounds: round 4 was invisible to 610 passing
  tests, `tsc` exit 0 and a green build**, and was caught by a cold reader. It lived in a state
  nobody had ever rendered. What finally closed it was driving **nine** states in a browser in
  both locales — see `docs/evidence/fix-calendar-empty-state/`. Iron rule 3 is not paperwork:
  for anything that decides what a screen SAYS, enumerate the states and go and look at each one.


## timezone-israel

- **NEVER FORMAT AN INSTANT WITHOUT A `timeZone`. A SERVER COMPONENT FORMATS ON THE SERVER, AND
  THE SERVER IS NOT IN ISRAEL.** Found 2026-08-09 by opening the deployed site: `www.timlul-ai.com`
  Home listed **every investor call three hours early** — יעקב פיננסים's Q2 call read `07:00`
  against a DB row of `2026-08-10T07:00Z`, which is `10:00` in Jerusalem — while `/app/calendar`
  rendered the same event as `10:00`. **Two surfaces, one event, three hours apart, live.**
  The mechanism is the part to remember: `formatTime`/`formatDate` pinned no `timeZone`, so they
  used the RUNTIME's. Home is a **Server Component**, so it formatted on Railway in UTC and passed
  the client a **finished string**, which the browser never re-formats — while `CalendarView` is
  `'use client'` and formatted in the viewer's browser, correctly. **So the bug was invisible on
  every machine it was developed on, because they are all in Israel**, and invisible to `tsc`, to
  the build, and to 610 passing tests.
  **THE LAW (founder decision 2026-08-09, filed in cross-cutting): Atlas renders ISRAEL TIME for
  every viewer in every timezone** — TASE and Israeli issuers publish that way, and it makes it
  impossible for two surfaces to disagree. `src/lib/i18n/format.ts` pins `ISRAEL_TZ` and exports
  `israelDayKey` / `israelMonthParts`; **use those for any day/month bucketing**, because local
  date parts put a report stored at Israel midnight on the previous day for any viewer west of
  Israel and a late call on the next day for any viewer east.
  **⇒ THE TEST DISCIPLINE THIS EARNS, and it generalises past timezones: run the battery under
  `TZ=UTC` as well as locally.** A test that only ever runs in one environment asserts that
  environment, not the property — the whole battery passed while production was wrong. It is green
  in both now (625/625), and removing the pin turns 7 of the 8 new `format.test.ts` cases red under
  `TZ=UTC`. **✅ The three gaps this entry used to list as open are CLOSED 2026-08-09 by
  `fix/israel-time-residue`** — `lib/db/calls.ts` now floors at `israelDayStart(israelDayKey(now))`,
  the today-pill compares the very key `byDay` is keyed by, and `isFuture` moved out of
  `CompanyOverview` into the unit-tested `isFutureEvent` (`lib/calendar/event-meta.ts`) precisely
  because inline-in-JSX is where the last two defects on this lane survived. **✅ The last
  user-visible one, `src/lib/transcripts.ts`, was CLOSED 2026-08-09 by `feat/documents-catalog`**
  — it now reads `israelDayKey(row.created_at)` instead of `(row.created_at).split('T')[0]`, so a
  transcript created 00:00–03:00 Israel no longer renders a day early. It was fixed on the branch
  that made those very rows more visible, which is the right reason to widen a scope by one line.
  Still open, NOT user-visible: `api/workspaces/[id]/intake/route.ts:542` (UTC `{TODAY}`,
  server-local `{Y0}/{Y1}`) and `lib/maya/events.ts:83` (`getUTCFullYear` labelling "FY 2024").
  **⇒ AND THE TEST DISCIPLINE ABOVE HAS A TRAP THAT SILENTLY DISARMS IT ON THIS MACHINE, FOUND
  2026-08-09 BY A COLD REVIEWER AFTER IT FOOLED BOTH THE LANE AND THE SUPERVISOR:** in Git Bash,
  a `TZ=` prefix whose value contains a `/` is **silently dropped** by MSYS path conversion —
  `TZ=America/New_York npm test` runs in `Asia/Jerusalem` and prints a reassuring green. Only
  slash-free names (`UTC`) survive. Both the branch's evidence doc and the supervisor's own merge
  report claimed four-to-five-zone coverage that never happened; the underlying result held, but
  the *method* certified nothing. **Verify the zone, never the command:** print
  `Intl.DateTimeFormat().resolvedOptions().timeZone` inside the run, or set it from PowerShell
  (`$env:TZ='America/New_York'`) which passes it intact. This is the same law as everywhere else
  in this file, one level down — a count comes from a command, and *a command's environment comes
  from the process, not from what you typed*.


## player-load-then-play

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


## pdfjs

- **pdf.js (Report pane) gotchas:** browser imports the COMMITTED `public/pdf.min.mjs` +
  `pdf.worker.min.mjs` natively (Next 14 webpack mangles the pdfjs ESM bundle) — re-sync both
  on any pdfjs-dist bump. `getDocument({data})` DETACHES the passed Uint8Array — hand it a
  copy if you still need the bytes. When adopting a mechanism from pdf.js's own viewer (e.g.
  the `endOfContent` selection guard), copy its WHOLE CSS cluster — a companion rule 3 rules
  away (`z-index` on glyph spans) was load-bearing; grep the upstream stylesheet for every
  selector touching the element.


## build-vs-dev-server

- **NEVER run `npm run build` while a dev server is up in the same checkout.** They share one
  `.next`, so the build overwrites the running server's chunks: every `/_next/static/*` 404s and
  routes die with `Cannot find module './vendor-chunks/*.js'` / `MODULE_NOT_FOUND`. It looks like
  the app broke, and it wrecks whatever the founder was mid-way through testing (2026-08-02 —
  it killed a live verification pass). Stop the dev server first, or build in another worktree.
  Recovery is the documented one: kill dev, delete `.next`, restart, then hard-refresh the tab
  (it is holding 404ing chunk URLs).


## server-component-function-prop

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


## crlf

- **THIS REPO HAS NO `.gitattributes` WHILE `core.autocrlf=true`, SO A WORKING TREE CAN BE CRLF
  WHILE EVERY BLOB IS LF — AND A SCRIPTED EDIT WILL SILENTLY MATCH NOTHING.** Graduated by
  fleet-lint 2026-08-10 after TWO distinct defects with this one root cause inside a single
  chapter (`feat/documents-catalog`), neither caught by tsc, tests or the build:
  (1) **a multi-line scripted edit did not apply at all**, and the lane committed a message
  asserting the fix — the pattern was written with `\n` and the file held `\r\n`, so it matched
  zero times and reported success. Caught only in a browser, afterwards.
  (2) **both i18n dictionaries were committed CRLF into the LF repo**, each carrying one BARE
  `\r` (a CR *not* followed by LF) that welded two keys onto one physical line. A bare CR is a
  legal TypeScript line terminator, so it typechecks and runs — it just turns a 30-line change
  into **2774 lines of diff** and collides with any other lane touching the same file.
  **The two commands, and neither is optional after a scripted edit:** `git diff --stat` against
  `git diff -w --stat` — if they disagree wildly you rewrote line endings, not content; and
  **grep for the RESULT you intended**, because a no-op edit and a perfect edit produce the same
  silence. Same family as the `TZ=`/MSYS trap above and the "a count comes from a command" law:
  the tool answered the question you typed, and the question you typed was not the one you meant.
  **STILL OPEN, deliberately — it needs a founder/fleet decision, not a feature branch:** adding
  `* text=auto eol=lf` would normalise this structurally, but it is a repo-wide behavioural change
  and must not ride in on a feature merge.


## no-store-mutable-private

- **Mutable private resources are served `no-store`** — a bad response + long max-age once
  pinned a 0-byte PDF past the server-side fix; hard refresh does NOT purge fetch()-cached
  entries (purge needs `fetch(url,{cache:'reload'})`). Storage paths are stable per
  company+quarter, so re-ingests must not be cacheable.
