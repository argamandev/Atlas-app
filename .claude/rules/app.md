# App Invariants

**What this is.** Atlas's app-level law, loaded into every turn. **Invariants, not suggestions:**
code that violates one is wrong even if it compiles, passes the battery, and looks right. Every law
here was paid for by a defect that shipped.

**How to read one.** **LAW** = what must always be true · **ENFORCED** = what catches a violation
without you · **VERIFY** = what you must check yourself. **`ENFORCED none` means you are the only
guard**; `partially` means the same wherever the named mechanism does not reach. **UNENFORCEABLE**
is the one honest terminal state for a law nothing mechanical could ever check — it needs a stated
reason, and it is not a shortcut around a test that could exist. Every law declares one of these;
`src/lib/environment.test.ts` fails the battery for a law that declares nothing, and
`npm run env:health` counts the unenforced, which is supposed to fall (ADR-0002). Declaring the
absence honestly is always allowed — inventing a mechanism that does not hold is what this whole
structure exists to prevent. `→ #anchor` is the full story in `docs/case-history/app.md`.

**Read the case before you** change code a law governs · change or weaken the test enforcing it ·
propose removing or narrowing it · hit the same failure class again. **If a task conflicts with a
law, do not quietly soften it:** name the conflict, read the case, and state what would have to
become true for the law to be legitimately revised.

**Counts carry their command.** Never copy one from prose — this file has been wrong that way three
times. **Claim the call sites, never the corpus:** a scoped law that overstates its own closure is
the exact failure this file exists to prevent. **Open findings are not laws**; they live in
`docs/open-findings.md` and must not be cited as such.

---

## Meta-laws — every section below is an instance of one of these

**M1 · A green signal proves only what it measured.** `tsc`, `next build`, a full green battery, a
grep that found nothing, a scripted edit that reported success, a `TZ=` prefix, a count in another
document — each answers the question you *typed*, not always the question you *meant*. Every one of
these shipped here:
- a page that 500s at render while `tsc` and `build` stay green → `#server-component-function-prop`
- a scripted edit that matched zero times against CRLF and reported success → `#crlf`
- `TZ=America/New_York` silently dropped by MSYS, so the battery ran in `Asia/Jerusalem`
- a grep that hit prose, not call sites (`DEMO_USER_ID` reads as 14 live sites; none is a fallback)
- a count restated from another document — wrong every time it was hand-carried
**⇒ Before claiming a change works, say what your evidence actually measured.**

**M2 · Never let a test certify an untrue premise.** A green test asserting a wrong outcome is
strictly worse than no test: the mechanism that would catch recurrence now points the wrong way.
State the property in the user's terms, not the code's. → `#choke-point-inputs`

**M3 · Fix at the choke point, with the fact, and make the lie unrepresentable.** Three clauses,
each earned by a bug that re-opened after the previous clause was applied:
1. Put the invariant at the ONE point every result passes through — never in the branch where the
   bug appeared. A guard in the branch is a patch wearing an invariant's clothes; every other path
   to the same lie stays open.
2. Give that choke point the **fact** it is deciding on, never a proxy for it. A proxy makes it
   decide confidently and wrongly.
3. Make the lying state **unrepresentable**, not merely guarded — one return type that cannot
   express "success with nothing" beats a check that success is non-empty.
→ `#classifier-visible-failure`, `#choke-point-inputs`

**M4 · Verify at the layer the user experiences** — rendered output, in a browser, in BOTH locales,
in every state the code can reach. Not the source, not the bundle, not a unit test's idea of it.
→ `#bidi-bdi`, `#design-parity`, `#choke-point-inputs`

---

## Auth & authorization

**LAW · Every API handler resolves a user before doing anything.**
`const userId = await getRequestUserId(req)` then `if (!userId) return unauthorized()` (both in
`src/lib/auth.ts`).
**ENFORCED** `src/lib/apiAuthBoundary.test.ts` splits every `route.ts` under `src/app/api` into its
handlers and fails the battery for any that resolves none. Exceptions live in its `PUBLIC`
allowlist, each with a stated reason, capped at 8 (`grep -c "':" ` the allowlist for the live count).
**VERIFY** If you are closing an auth hole and that test did not fail first, the hole was outside
its scope — find out why before editing the route. → `#api-auth-boundary-test`

**LAW · Use `getUser()`. Never `getSession()`.** `getSession()` reads the session out of an
attacker-controlled cookie with no signature check; `getUser()` revalidates the token.
`lib/auth/verifyUser.ts` is the primitive.
**ENFORCED** none — `git grep "auth\.getSession()" -- src` must keep returning nothing.
→ `#getsession-forged-cookie`

**LAW · `/app/*` and `/print/*` are gated, and `config.matcher` stays in sync with
`GATED_PREFIXES`.**
**ENFORCED** `src/middleware.ts` + the unit-tested `src/lib/auth/gate.ts`. → `#app-print-gated`

**LAW · Validate `?next=` with `safeNextPath()` before redirecting**, or the gate becomes an open
redirect. **ENFORCED** `src/lib/auth/gate.test.ts`. → `#app-print-gated`

**LAW · Gating a PAGE does not gate the API route that feeds it.** Gate the data, not just the
screen. **ENFORCED** the boundary test, for routes. → `#api-auth-boundary-test`

**LAW · No shared fallback identity, ever.** `DEMO_USER_ID` is deleted. If something fails to
compile looking for it, the answer is `unauthorized()` on a route or rendering nothing on a page.
**ENFORCED** the `nothing under src/app falls back…` case in `apiAuthBoundary.test.ts` — which
blanks comments first, so trust it over a grep. → `#demo-user-id`

**LAW · Authentication is not authorisation, and `supabaseAdmin` bypasses RLS.** Proving *who* is
calling does not prove they may touch the row. RLS protects only what queries through the **user's**
client.
**ENFORCED** none — a choice per `lib/db` module. Verified 2026-08-12, 6/6
(`git grep -lE "^import \{[^}]*supabaseAdmin" -- src/lib/db`). **Grep the IMPORT:** a
`supabaseAdmin\.` grep returns this list BACKWARDS — it hits `projects`/`workspaces` on their own
prose and misses `calls`/`conversations`/`transcripts`, which chain `await supabaseAdmin` +
newline + `.from(`. The import grep is still a proxy (M3.2): a line-WRAPPED import drops a module
silently — and `transcripts.ts` (the birth door since 2026-08-13) DYNAMIC-imports it, invisible to
that grep: sweep `git grep -l "import('@/lib/supabase')" -- src/lib/db` too. Silence reads as
"RLS-safe", so re-read the list, never just the count.
- **user client, RLS load-bearing — copy these:** `projects.ts`, `workspaces.ts`
- **`supabaseAdmin` over personal rows — must filter by owner in application code:**
  `conversations.ts`, `quotes.ts`, `quoteFolders.ts`, `transcripts.ts`
- **`supabaseAdmin` over shared corpus — no user rows, legitimate:** `companies.ts`, `calls.ts`
**VERIFY** Never read "the auth fix landed" as "the data layer is safe".
→ `#supabase-admin-bypasses-rls`, `#authn-is-not-authz`

**LAW · Gating an endpoint changes every caller's ERROR path, not just its happy path.**
**ENFORCED** partially — two battery scans, each over a per-file ratchet of stated exceptions:
`src/lib/apiFetchDiscipline.test.ts` (2026-08-13, the second occurrence: the silent-success
speaker-rename toast, after the 401-forever finish poll) fails any direct `/api` fetch whose
response nothing reads; `src/lib/supabaseWriteDiscipline.test.ts` (2026-08-13, the third:
finishLiveCall's stub upserts discarded `{ error }` — supabase never throws) fails any awaited
supabase write whose result nothing reads. They prove the result is LOOKED AT, nothing more.
**VERIFY** WHICH reaction is right is still yours: open every caller, answer "what does this do
with a 401?" — revert optimistic state, or send the user to sign in (`loginRedirectTarget`).
Never invent a cause: a "model unavailable" banner for an expired session retries forever.
→ `#gating-changes-error-paths`

**LAW · PUT `/api/transcripts/[id]` validation stays lenient** (`.passthrough()`, `role: z.string()`)
— legacy rows carry `role: "unknown"`. Do not tighten it to an enum.
**ENFORCED** none — no test feeds a legacy `role: "unknown"` row through that schema, so tightening
it to an enum would land green and break only in production.

## Bidi & localization

**LAW · A line mixing Hebrew and Latin gets a `<bdi>` per run, with `dir` on the CONTAINER — never
`dir` on the mixed line.** `dir="auto"` resolves from the line's first strong character, so one
Hebrew word flips the whole line; `dir="ltr"` does the mirror damage to Hebrew. `dir="ltr"` is
correct for a **bare** numeral or ticker only.
**ENFORCED** partially — `src/lib/workspace/data.test.ts` encodes the rule for one surface. There is
no repo-wide check, so treat this as `ENFORCED: none` for any new surface.
**VERIFY** Two steps, neither optional. **(1)** Fix the CONSTRUCT, not the component:
`git grep -n 'dir="ltr"' -- src`. Fixing one instance is exactly what hid the others. **(2)** Prove
it renders differently (M4): put the old `dir` back on the live element and re-measure the runs'
x-positions. A `<bdi>` that changes nothing looks identical to one that fixes everything.
**This is the repo's most-repeated defect — 7 recorded occurrences** (source: the FINDING entries
on `feat/documents-catalog` in `docs/archive/ready-queue-2026-07-03--2026-08-10.md`; the frozen
case entry predates the last two and says "5th"). Every one
passed typecheck, tests, and an EN-only screenshot. → `#bidi-bdi`

**LAW · Design parity is judged against the RENDERED design, never bundle CSS** — bundle CSS can be
a stale iteration. Probe computed styles / canvas `measureText` on the live design page. Two system
stacks: body = SF Pro Text (→ Segoe UI on Windows); headlines (`fontFamily.head`) = SF Pro Display
**without** system-ui (→ Arial).
**ENFORCED** none — the only thing a battery can reach is the bundle, which is precisely the source
this law forbids judging against. Closing it needs a browser probe, which nothing runs today.
→ `#design-parity`

## Time

**LAW · Never format an instant without a `timeZone`.** A Server Component formats on the server and
hands the client a finished string the browser never re-formats — and the server is not in Israel.
**LAW · Atlas renders ISRAEL TIME for every viewer in every timezone** (founder decision
2026-08-09). Two surfaces can then never disagree.
**LAW · Bucket days and months with `israelDayKey` / `israelMonthParts`** (`src/lib/i18n/format.ts`,
which pins `ISRAEL_TZ`). Local date parts put a row stored at Israel midnight on the wrong day for
viewers either side of Israel.
**LAW · Do not decide date logic inline in JSX** — extract and unit-test it
(`lib/calendar/event-meta.ts` is the shape). Inline-in-JSX is where the last two defects survived.
**ENFORCED** `src/lib/i18n/format.test.ts`, `src/lib/transcriptDate.test.ts`.
**VERIFY** Run the battery under `TZ=UTC` as well as locally (M1): a test that only ever runs in one
environment asserts that environment, not the property — the whole battery was green while
production was three hours wrong. ⚠ **In Git Bash a `TZ=` value containing `/` is silently dropped**
by MSYS path conversion, so `TZ=America/New_York npm test` runs in `Asia/Jerusalem` and prints a
reassuring green; only slash-free names survive. **Verify the zone, never the command** — print
`Intl.DateTimeFormat().resolvedOptions().timeZone` inside the run, or set it from PowerShell
(`$env:TZ=…`), which passes it intact. → `#timezone-israel`

## UI truthfulness

**LAW · Degradation must be VISIBLE. Never render success UI for content the server dropped, and
never add a stub to fill a designed slot.** A failed fetch says so, on screen, in both locales. A
pane ends in exactly one of: loading · error · empty — never a fabricated fourth state.
**ENFORCED** none, structurally — enforced only by deleting fallbacks rather than gating them.
→ `#stubs-on-designed-slots`

**LAW · When a decision rests on a natural-language classifier over an open vocabulary, buy VISIBLE
FAILURE, not a longer word list.** Hebrew and English both have unbounded ways to say the same
thing, so no vocabulary ever closes it. What closes it is that being wrong cannot lie — apply M3.
**ENFORCED** none — "this decision rests on a classifier over an open vocabulary" is a judgement
about a design, not a property any file scan can see. Its natural tier is a ritual gate at review
(ADR-0002), which does not exist yet.
→ `#classifier-visible-failure`

**LAW · Anything that decides what a screen SAYS gets every one of its states driven in a browser,
in both locales, before it merges** (M4). A four-round defect lived in a state nobody had ever
rendered and was invisible to a fully green battery.
**ENFORCED** none — a battery cannot tell whether a human opened a browser. Its natural tier is a
ritual gate at review (ADR-0002), which does not exist yet.
**VERIFY** Enumerate the states; go and look at each. → `#choke-point-inputs`

**LAW · A Server Component may not pass a FUNCTION to a Client Component.** Create the closure on
the client side of the boundary (`components/projects/ProjectChat.tsx` is the shape).
**ENFORCED** none — the rule fires at render time, so the page 500s while `tsc` and `next build`
stay green (M1). **VERIFY** Load the route, or at minimum watch the dev-server log return 200 for
that exact URL. → `#server-component-function-prop`

## Media & documents

**LAW · An intent that must reach a media element inside one gesture has to be REMEMBERED, not
fired and hoped.** `player.load()` only sets React state; the element gets its source a render
later, so `load()` then `play()` in one handler plays nothing. Use the `pendingPlayRef` /
`pendingSeekRef` pattern in `lib/player/PlayerProvider.tsx`, replayed on `canplay` and cleared by
any pause/close so a remembered press cannot restart audio the user has stopped.
**ENFORCED** `src/lib/live/liveTiming.test.ts` covers the timing contract, not this specific race.
→ `#player-load-then-play`

**LAW · Hebrew PDF needs a real browser engine** — `react-pdf`/`html2canvas` garble Hebrew next to
numbers. Proper fix = server-side Playwright `page.pdf()`; current stopgap = `window.print()` via
`/print/[id]`.
**ENFORCED** none — nothing stops `react-pdf` or `html2canvas` being added back. A grep for those
two imports would close this at the hook tier and has not been written.
→ `#hebrew-pdf`

**LAW · pdf.js is loaded from the COMMITTED `public/pdf.min.mjs` + `pdf.worker.min.mjs`**, imported
natively because Next 14's webpack mangles the pdfjs ESM bundle — re-sync **both** on any
pdfjs-dist bump. `getDocument({data})` **detaches** the passed Uint8Array; hand it a copy if you
still need the bytes. Adopting any mechanism from pdf.js's own viewer means copying its **whole CSS
cluster** — grep the upstream stylesheet for every selector touching the element, because a
companion rule three rules away was load-bearing.
**ENFORCED** none — nothing compares the committed `public/pdf*.min.mjs` against the installed
`pdfjs-dist` version, so a bump desyncs them silently and the battery stays green.
→ `#pdfjs`

**LAW · Mutable private resources are served `no-store`.** A bad response plus a long max-age once
pinned a 0-byte PDF past the server-side fix, and a hard refresh does **not** purge fetch()-cached
entries — that needs `fetch(url, {cache:'reload'})`. Storage paths are stable per company+quarter,
so re-ingests must never be cacheable.
**ENFORCED** none — no test asserts the cache headers on the private-document responses, so a
missing `no-store` is invisible until a stale body is served.
→ `#no-store-mutable-private`

## Platform

**LAW · Railway redirects derive their origin from `x-forwarded-host`/`x-forwarded-proto`**, never
`request.url` (which resolves to the internal `localhost:8080`). `resolveOrigin` REFUSES the header
unless `NEXT_PUBLIC_SITE_HOST` matches, so an unset or stale value silently reintroduces the bug on
the next domain change.
**ENFORCED** partially — `src/lib/auth/gate.test.ts` covers `resolveOrigin` refusing a forged or
unconfigured `x-forwarded-host`. Nothing detects a STALE `NEXT_PUBLIC_SITE_HOST`, and that is the
path the bug actually returns by.
→ `#railway-redirects`

**LAW · Sign-out stays a plain `<a href="/api/auth/signout">`** — a z-index overlap once let
`<main>` swallow the click. Do not reintroduce a dropdown.
**ENFORCED** none — nothing inspects the markup, so a dropdown could be reintroduced with the
battery fully green.

**LAW · `bin/yt-dlp.exe` self-updates per checkout** (`bin/yt-dlp.exe -U`, git-ignored) — YouTube
403s builds a few weeks old. Railway installs it fresh at build.
**ENFORCED** partially — `npm run build` runs `scripts/install-yt-dlp.js`, so the deploy is always
fresh. Nothing refreshes a local checkout, which is where the 403s are actually seen.
→ `#yt-dlp-staleness`

## Verification traps — this repo's concrete false-success modes (M1)

**TRAP · A scripted edit can silently match nothing.** No `.gitattributes` while
`core.autocrlf=true` means the working tree can be CRLF while every blob is LF, so a pattern
written with `\n` matches zero times and reports success. A bare `\r` is also a legal TypeScript
line terminator, so a CRLF-committed file typechecks and runs while welding two keys onto one
physical line.
**VERIFY** After **any** scripted edit, both: compare `git diff --stat` against `git diff -w --stat`
— wild disagreement means you rewrote line endings, not content — and **grep for the RESULT you
intended**, because a no-op edit and a perfect edit produce the same silence. → `#crlf`

**TRAP · A grep hits prose.** `git grep -n "DEMO_USER_ID" -- src` reads as 14 live sites and no
fallback survives (11 comments, 3 the guard's own detector and its messages). Strip comments AND
strings, or prefer the test that already does.

**TRAP · Never run `npm run build` while a dev server is up in the same checkout.** They share one
`.next`, so the build overwrites the running server's chunks: `/_next/static/*` 404s and routes die
with `MODULE_NOT_FOUND`. It looks like the app broke, and it wrecks whatever the founder was
testing. Build in another worktree, or stop the dev server first. Recovery: kill dev, delete
`.next`, restart, hard-refresh the tab. → `#build-vs-dev-server`

---

**Open findings are NOT laws and live in `docs/open-findings.md`** — read it before touching live
audio auth, `.gitattributes`, or the two known UTC leaks. Never cite one as an invariant.
