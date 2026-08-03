# fix/projects-honesty — the merge-gate round (supervisor)

**Who did this round and why it is not Lane M.** The cold gate on `b1d5d3d` returned CHANGES
(1 BLOCKER · 4 WARNING · 4 NIT). By then Lane M had already branched `feat/workspace-tables` off
main and started the Workspace chapter, so the founder chose to have the supervisor take the fix
round rather than interrupt a live lane. The standing rule that the supervisor does not
fix-and-self-review still applies: this goes through a fresh cold `atlas-reviewer` before it may
merge, exactly as `fix/api-security` did.

**Commits this round:** `485e000` (merge) · `8065c48` (the five UI findings) · `0455c37` (spec) ·
`851e03b` (sanitizer test + this file) · plus the round-two commits in §9.

**Merge-base with main is `c27995a`** — `git merge-base main fix/projects-honesty`. An earlier
version of this line said `bba0a21`, which was the base *before* main was merged in at `485e000`;
I also briefed the round-two reviewer with that stale value and it corrected me (§9.6).

---

## 0. What this round does NOT prove

Listed first, because a previous round on this branch was blocked for evidence that overclaimed.

- **No chat was sent through a model.** The `errorKind` paths — `answer`, `truncated`, `save` — are
  reasoned from the code, not photographed. What IS shown is that the error no longer occupies
  `content`. The three-way split keys off a `streamFinished` flag and remains unit-testable but
  untested; round two rewrote it after the gate showed the original two-way split over
  `full.length > 0` mislabelled a truncated answer as an unsaved one (§9.2).
- **The persisted degradation notice was proven at the API layer, not by eye.** I did not force a
  real truncation through a project's context and then reload the page. What I did prove is the
  round trip that the fix depends on (§4).
- **`ProjectsList`'s 401 IS photographed (round two, §9.8); `ProjectView`'s THREE banners are NOT.**
  `ProjectView`'s `loadError`, `saveError` and `openError` surfaces were never forced, framed or
  probed in any round — they are inferred from sharing `ErrorLine` and `projects/client.ts` with
  `ProjectsList`, which IS proven. Stated as inference, because that is what it is.
  (`git grep -c "<ErrorLine" -- src` → `ProjectView.tsx:3`. An earlier version of this bullet said
  **four**, hand-carried, and it disagreed with §9.1's own "ProjectView ×3" two screens away.)

  > **This bullet has now been wrong twice, in opposite directions, and both are recorded because
  > the pattern is the lesson.** It first read *"`ProjectView`'s own banner is not in any frame; it
  > takes the same `ErrorLine` change as the two that are"* — an affirmative claim wearing the
  > costume of a disclaimer, and false: those screens use a different fetch layer, so their 401
  > branch was unreachable. **That sentence is what hid the round-two BLOCKER.** It was then
  > over-corrected to *"No `ProjectsList` or `ProjectView` error surface was exercised at all"*,
  > which round two's own committed screenshots contradict. A "not proven" list is load-bearing
  > evidence and has to be re-checked against the artifacts every round, exactly like a count.
- **The build claim is from a clean build with the dev server stopped and `.next` cleared** — but
  the browser pass above it ran against the DEV server, so the two are different artifacts.

---

## 1. BLOCKER — the merge, and a correction to my own instruction

The gate's headline finding was that the merge resolution *I had written into the ready queue and
the board* does not work. It said: make `resolveConversationScope` refuse, then "add it to the
guard's `AUTH_FNS` list (one deliberate line)".

`src/lib/apiAuthBoundary.test.ts:80` binds an auth result only through
`(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=\s*await\s+(?:AUTH_FNS)\s*\(`. **The `await` is
required.** `resolveConversationScope` is synchronous, so nothing binds, the refusal is not tied to
an auth identifier, and the handler still reports *"resolves a user but never acts on the result"*.
The allowlist line would have done nothing. The reviewer proved this by building the route shape my
note described, patching `AUTH_FNS`, and running the guard — not by reading.

**I wrote that instruction from my memory of writing the guard, instead of from the guard.** That is
the same "a claim in a document comes from a command" failure this branch's neighbour filed three
times. Correction appended to `cross-cutting.md` the moment it was found, because Lane M was live
and was the intended reader of the wrong version.

**Resolved instead as:** the route keeps main's two lines itself (`getRequestUserId` →
`unauthorized()`), and the helper becomes `resolveProjectId(body)` carrying **no identity at all**.

Why that is better than making the helper async to satisfy the scanner: the old shape had lifted the
`?? DEMO_USER_ID` fallback out of `src/app/api` — which the guard scans — into `src/lib/db`, which it
does not. It moved a hole to where nothing was watching. The new shape removes it.

Also deleted: the unit test asserting `realUserId ?? DEMO_USER_ID` as **correct**
(`conversationScope.test.ts`, "an ordinary chat still falls back to the demo id"). A test that pins a
hole in place makes removing the hole look like a regression.

```
$ node --import tsx --test src/lib/apiAuthBoundary.test.ts
✔ every API route handler resolves a user AND refuses without one
✔ nothing under src/app falls back to the shared DEMO_USER_ID identity
✔ the public allowlist stays small and every entry states its reason
```

**No allowlist change was needed.** `package.json` takes both test files.

---

## 2. WARNING — an error was being rendered as Atlas's answer

`ChatView.tsx` wrote `(err as Error).message` into the assistant message's `content`, so a raw
server string rendered in the place a Hebrew answer belongs, in the same unstyled branch as a real
reply. Two distinct harms:

- the user reads `unauthorized`, or `relation "public.chat_conversations" does not exist`, as
  though Atlas had said it;
- the persistence step runs **after** the answer has streamed in full, so a `createConversation` /
  `saveConversation` failure **destroyed a correct answer** and replaced it with the reason it could
  not be stored.

Now: the error is carried on a separate `error` field (the thrown value, not its message — the
status has to survive), `content` is never touched, and the copy states which half failed.
`answerFailed` when nothing arrived, `notSaved` when the answer is real and only storing it failed.
One string for both would make one of them false.

## 3. WARNING — a 401 had no way back

Three banner sites rendered a 401 as the bare word `unauthorized`, under a template that blamed the
wrong thing: *"Could not load your chats — unauthorized"* invites the reading that the chats are the
problem. `rules/app.md` prescribes `loginRedirectTarget` for this caller class.

The status was being **thrown away in the fetch layer** — `client.ts` turned every failure into
`new Error(body.error)` — so no caller could have acted on it even if it had wanted to. Fixed at the
source: `ApiError` carries `status`, `isUnauthorized()` is the predicate, and `ErrorLine` takes the
thrown value and renders the expired-session copy plus a sign-in button for a 401.

Applied at all 8 `ErrorLine` render sites — but see §9. **Round one of this claim was wrong, and
the way it was wrong is the most useful thing in this document.**

```
src/components/chat/ChatHistory.tsx:2
src/components/chat/ChatView.tsx:1         (new this round)
src/components/projects/ProjectView.tsx:3  (incl. the not-found screen)
src/components/projects/ProjectsList.tsx:2
```

## 4. WARNING — a notice that vanished on reload

The project-context degradation notice lived only in React state. `saveConversation` persists
`{role, content}`, so **one reload turned "answered without your project's context" into an answer
that looked complete.** The degradation was visible exactly until the user did the most ordinary
thing available to them.

Now persisted in the existing `messages` jsonb — additive, **no migration**, nothing applied against
the shared database. Announced in `cross-cutting.md` before the edit, per the parallel-work law,
because `ChatMsg` is a shared type and Lane M is live.

**Proven by round trip against the real routes**, in the founder's signed-in browser, using a
throwaway conversation created and deleted in the same script (his row, created by me, removed by
me — disclosed rather than hidden):

| step | result |
|---|---|
| `POST /api/conversations` | 200 |
| `PATCH` with `projectContext: 'truncated'` and `projectContext: 'notARealStatus'` | 200 |
| `GET` read-back | `truncated` → **`truncated`**, `notARealStatus` → **`notARealStatus`** |
| `DELETE` | 200 |
| `GET` after delete | **404** |

**The second row is the important one.** The server stores the blob verbatim, so an arbitrary string
CAN reach the client — and the render treats anything that is not `'failed'` as truncated. The
client-side `sanitizeContextStatus` is therefore the only thing standing between the blob and a
warning painted on an undegraded answer. It now has its own test file
(`src/lib/api/contextStatus.test.ts`, 3 tests, 13 junk values) with that reasoning written above it.

## 5. NITs taken

- `ChatHistory` flashed "Nothing here yet" on first paint before the fetch resolved — the same
  untrue empty state the component exists to prevent, for a shorter moment. Now has a `loading` flag.
- Its refresh effect had no cancellation, and `refreshKey` bumps after every exchange, so a slow
  **rejected** fetch could resolve after a newer successful one and paint an error over a list that
  had loaded correctly. Now cancels.
- `ProjectView.write()` cleared only `saveError`, leaving a stale "could not open that chat" line
  standing over every later successful save. Now clears both.
- The spec published the **rejected** single-column foreign key as live, copy-pasteable SQL under a
  line reading `-- APPLIED (migration 20260802_015)` — two untruths at once, against a database
  shared with deployed production Timlul. (`~~strikethrough~~` does not render inside a fenced
  block.) Every line is now commented out, with the applied shape beside it, transcribed from the
  migration file — **after a first pass invented a constraint name that does not exist**, which is
  noted in the spec itself.

---

## 6. Battery, on the merge result

| check | result |
|---|---|
| `npm test` | **206 / 206** — 201 on the branch before the merge, and the delta reconciles exactly: `conversationScope.test.ts` **8 → 7** (the demo-fallback assertion deleted), `apiAuthBoundary.test.ts` **+3** (arrives with main), `contextStatus.test.ts` **+3** (new this round). 201 − 1 + 3 + 3 = 206. *(Counted per file by running them; a first draft of this table guessed the decomposition and was wrong.)* |
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **green**, dev server stopped and `.next` cleared first; Middleware **81.8 kB** intact, all `/app/chat/projects*` routes compiled |
| dictionary parity | enforced by `tsc` — `he.ts` must structurally match `en.ts`, and it failed loudly mid-edit until both locales had all four new keys |

---

## 7. Eyes-on, in the founder's signed-in Chrome, both locales

The 401 and 500 surfaces were forced by **temporarily returning them from the real handler** — the
same technique the previous round was credited for, not a patched `window.fetch`. Reverted, and the
revert proven: `git diff` empty, `git grep "TEMP-VERIFY\|x-verify-skip" -- src` returns nothing,
`git status` clean.

| surface | observed |
|---|---|
| `/app/chat` EN, 401 | `Your session has expired.` + **`Sign in`** button · banner 34.75px (one row) · empty state NOT shown |
| `/app/chat` HE, 401 | `תוקף ההתחברות שלך פג. התחברות` · `dir=rtl` · wrapper span computed **`block`** · 34.75px · empty state NOT shown |
| `/app/chat` HE, 500 | `לא ניתן לטעון את השיחות — relation "public.chat_conversations" does not exist` · wrapper **`block`** top 270.5 · `<bdi>` **`inline`** top 271.5 · **no** sign-in button |
| `/app/chat` normal | 0 alerts · 18 recent-chat rows · no false empty state |
| `/app/chat/projects` | loads · 0 alerts · **0 console errors** |

**The 500 row is the regression check that mattered.** Changing `ErrorLine`'s signature from
`error: string` to `error: unknown` could have broken the block-wrapper contract the previous round
measured and was gated on. It holds: wrapper `block`, `<bdi>` `inline`, one bidi paragraph, the
Latin Postgres run keeping its quotes on the correct side under `dir=rtl`. And the 401 correctly
does *not* render a `<bdi>` — there is no foreign error string in that branch, only localized copy.

**Screenshots:** `shots/2026-08-03-session-expired-en.jpg` · `shots/2026-08-03-session-expired-he.jpg`
· `shots/2026-08-03-server-error-bdi-he.jpg`. Each shows the sidebar banner in place on a real page;
none is a mock.

> ⚠️ **SUPERSEDED COPY — the two `session-expired` shots and the two 401 rows in the table above.**
> They were captured at `851e03b`. `3d1d654` then made `ErrorLine` keep the template head, so the
> shipped code renders **`Could not load your chats — Your session has expired. Sign in`**, not the
> bare `Your session has expired. Sign in` these frames show. The layout, locale, RTL behaviour and
> sign-in button they demonstrate are all still accurate; only the sentence grew a prefix.
> **Deliberately not re-shot:** the current rendering is already photographed in
> `shots/2026-08-03-projects-401-signin-en.jpg`, whose sidebar carries the same `historyFailed`
> banner in its shipped form. Kept with this note rather than replaced, because a dated capture that
> is quietly swapped stops being evidence.

---

## 8. Ports and shared state

`:3000` (supervisor) was mine, used for the browser pass, then **stopped** before the build per the
filed rule. `:3001` is Lane S's held seat and was **left running** — killing another lane's dev
server is a recorded past mistake. `:3002`, `:3003`, `:8788` free throughout. No migration, no DDL,
no live-engine claim.

---

## 9. Round two — the gate found a BLOCKER in my own fix, and it was hiding behind a command

The second cold gate returned **CHANGES**: 1 BLOCKER, 2 WARNING, 6 NIT. All closed below.

### 9.1 BLOCKER — the sign-in route was dead on exactly the screens this branch is about

`src/lib/projects/client.ts:16` threw a plain `new Error(body?.error ?? ...)`. `isUnauthorized()`
tests `err instanceof ApiError`, so **four of the eight banners could never reach their 401
branch** — and they were `ProjectsList` ×2 and `ProjectView` ×2, i.e. the Projects screens. On
those, a 401 still rendered `Could not load your projects — unauthorized` with no way back. The
repo has **two** fetch layers and I only fixed one.

**How it survived my own verification, which is the part worth keeping.** I checked coverage with
`git grep -c "auth={{ expired:"` and got 8, and wrote *"coverage is total"*. That command counts
the **prop**. Every site had the prop; half could not use it. I had already learned "a claim in a
document comes from a command" — and then satisfied it with a command that answered a question I
had not asked.

> **A command answers the question you typed, not the question you meant.** The corollary: when the
> claim is about BEHAVIOUR, the check has to execute the behaviour, not match a token near it.

**Fixed structurally, not locally.** `handleResponse()` is now exported from `lib/api/client.ts` and
is the single place that decides what a failed request throws; `projects/client.ts` delegates to it
instead of owning a second throw. Fixing only the one line would have left the next fetch layer free
to repeat it.

**And it now has a guard that was proven to bite** (`src/lib/api/errorShape.test.ts`): for every
component rendering an `auth`-enabled `ErrorLine`, every `@/lib` module it imports that calls
`fetch(` must reference `handleResponse` or `ApiError`.

**The guard's first version was broken in the same way the thing it guards was.** It passed when I
reverted the fix to test it — because `lib/projects/client.ts`'s explanatory comment contains the
word `ApiError`, and the scan read prose as code. That is precisely the finding
`apiAuthBoundary.test.ts` was fixed for days earlier. Now blanks comments, with a canary that fails
loudly if blanking eats the file. Re-proven by reintroducing the bug:

```
✗ every data module reachable from a 401-capable error banner throws ApiError
  + 'src\components\projects\ProjectsList.tsx → src\lib\projects\client.ts'
  + 'src\components\projects\ProjectView.tsx → src\lib\projects\client.ts'
```

Fix restored; 5/5 green.

### 9.2 WARNING — a truncated answer was labelled "not saved"

`errorKind: full.length > 0 ? 'save' : 'answer'` cannot tell a mid-stream break from a completed
answer that failed to persist — both have content. So a client-side `reader.read()` rejection told
the user *"This answer arrived but was not saved"* about **half an answer**: an incomplete reply
presented as complete, which is the class this branch exists to remove rather than relocate. Now
three kinds keyed off a `streamFinished` flag set at the moment `streamChat` resolves — `answer`
(nothing arrived) · `truncated` (real but cut off) · `save` (complete, unstored) — with new copy in
both locales.

**Carried, not fixed, and named because the gate found it:** a *server*-side mid-stream failure is
caught and the stream closed **cleanly** (`src/app/api/chat/route.ts:321-326`), so it produces no
notice at all. Pre-existing, outside this branch, and now filed rather than discovered later.

### 9.3 WARNING — the fix had traded a wrong answer for a blank one

A turn that failed left an assistant message with empty `content` (its error lives in view state,
which is not persisted). The **next** successful send wrote that empty turn into the thread, so a
reload rendered the user's question followed by a silently blank reply. I had traded "an error
rendered as an answer" for "nothing rendered at all", which `rules/app.md` ranks as worse. Empty
assistant turns are now dropped at persistence: the question stands alone and nothing claims to be
a reply.

### 9.4 NITs, all taken

- `ErrorLine`'s 401 branch discarded `template` entirely, so a `notSaved` 401 announced the expired
  session but not that the answer on screen is unsaved — and its sign-in button then navigates away
  and destroys it. The template's head is now kept: *"This answer arrived but was not saved — Your
  session has expired. Sign in"*.
- `ChatHistory.openError` was cleared only by another open attempt, so it stood over a list that had
  since reloaded fine — the mirror of the `ProjectView.write()` NIT fixed in round one. Now cleared
  on a successful refresh.
- `lib/db/conversations.ts:83` still described the composite key as guarding against "the
  DEMO_USER_ID fallback the route uses when nobody is signed in". No such caller exists any more.
- The spec cited `20260802_015_projects.sql:130-143`; the block is **129-146**. Verified by
  `grep -n` and `sed`, not by trusting the finding.
- `ARCHITECTURE.md` gained entries for `api/client.ts`, `projects/client.ts`,
  `db/conversationScope.ts`, `components/projects/ErrorLine.tsx` and both new test files.
- §0 and §3 of this document corrected in place (above).

### 9.5 One thing the gate did not catch, found while closing its NITs

**`api/errorShape.test.ts` was written, passing, and NOT REGISTERED in `package.json`.** It existed
in the tree and passed when invoked directly, and would have been absent from every battery run —
including the one I would have cited as proof it guards anything. Found only because regenerating
the `ARCHITECTURE.md` test line from a command returned 32 files when I expected 33. Registered;
the counts below come from that same command.

### 9.6 The gate corrected my prompt, again

I briefed the reviewer with merge-base `bba0a21`. `git merge-base main fix/projects-honesty` returns
**`c27995a`** — merging main in moved it. Reviewing the range I gave would have dragged main's own
`fix/api-security` commits into scope. The reviewer caught it and reviewed `main..851e03b` instead.
Second round running, second stale number carried into a prompt from my own head.

### 9.7 Battery after round two

| check | result |
|---|---|
| `npm test` | **211 / 211** across **33 files** — both regenerated from commands (`package.json`'s test script for the file count, a real run for the test count) |
| `npx tsc --noEmit` | **exit 0** |
| dictionary parity | enforced by `tsc`; failed loudly mid-edit until `answerTruncated` existed in both locales |

### 9.8 The screenshots round two produced, now actually cited

Round two committed these and then referenced them from nowhere — `git grep -n projects-401-signin
-- docs` returned nothing, so the only eyes-on proof of the round-two BLOCKER fix was an orphaned
file. Cited here:

| shot | shows |
|---|---|
| `shots/2026-08-03-projects-401-signin-en.jpg` | `/app/chat/projects`, EN. **`Could not load your projects — Your session has expired. Sign in`** in the main banner, and the same treatment in the sidebar's RECENT CHATS. The projects line is the one that read `— unauthorized` with no button before the fix. |
| `shots/2026-08-03-projects-401-signin-he.jpg` | The same screen, HE, `dir=rtl`: `לא ניתן לטעון את הפרויקטים — תוקף ההתחברות שלך פג. התחברות`, sign-in link at the line's end. |

Both were forced from the real routes (`/api/conversations` and `/api/projects` each returning 401
temporarily), and both temporary edits were reverted with the revert proven by `git grep` and an
empty `git diff`.

**Still not photographed:** `ProjectView`'s own four banners. See §0.

---

## 10. Round three — the truncation fix had the same hole it was fixing

Third cold gate: **CHANGES** — 1 BLOCKER, 4 WARNING, 5 NIT.

### 10.1 BLOCKER — a cut-off answer became a complete one on reload

Round two split `errorKind` into `answer` / `truncated` / `save` so a cut-off answer would stop
being described as merely unsaved. But `errorKind` is **view state**, and a truncated turn has
NON-EMPTY content — the partial text — so it sailed through the empty-turn filter and was written
into the thread on the next successful send as an ordinary complete answer.

1. stream breaks at 60% → the screen honestly says *"This answer was cut off before it finished"*;
2. the user asks something else, that send succeeds → the 60% is persisted as a plain answer;
3. reload → **half an answer, rendered through `<Markdown>`, presented as Atlas's whole reply**, and
   replayed to the model as its own prior turn.

That is *worse* than what round one replaced: on main the partial was overwritten by the error text
— untrue, but visibly so. My fix made it invisible.

**It is the identical class to §4, which I had already fixed, one field away.** I persisted
`projectContext` because a notice that dies on reload is not a notice, and then introduced a second
notice that dies on reload. Fixed the same way: `ChatMsg.truncated`, written at persistence
(`m.truncated === true || m.errorKind === 'truncated'`), sanitised on read (`=== true` only), and
rendered on a reopened thread with copy that carries **no `{error}`** — the cause did not survive
the reload and naming one would be an invention.

### 10.2 The other findings

- **WARNING ×2 — my own §0 was stale in BOTH directions across two rounds.** Corrected above, with
  both wrong versions preserved. A "what this does not prove" list has to be re-checked against the
  committed artifacts every round, exactly like a count.
- **WARNING — the round-two screenshots were cited nowhere.** Fixed in §9.8.
- **WARNING — `errorShape.test.ts` claimed "reachable" with no stated limits**, unlike
  `apiAuthBoundary.test.ts` which states its own. It follows only DIRECT `@/…` imports (relative
  imports and two-hop modules are invisible) and `blankComments` mis-parses `//` and `/*` inside
  string literals — which fails safe for a hidden `handleResponse` but **fails open** for a hidden
  `fetch(`. All three limits are now in the guard's header.
- **NITs taken:** the empty-turn filter now uses `.trim()` (whitespace-only turns were persisting as
  blank bubbles); `open()` in `ChatHistory` and `openChat()` in `ProjectView` are sequence-guarded,
  so a slow rejected open resolving after a newer successful one can no longer report a failure
  about a chat the user is already reading.
- **NIT — `projects.send` is a scope stowaway.** An `aria-label` and a dictionary key in both
  locales that no evidence file, spec or architecture entry mentions. Disclosed here rather than
  removed: it is correct and additive, it was simply never declared.

### 10.3 Two findings I am NOT fixing, named rather than buried

- **`src/app/api/chat/route.ts:96` and `:324` fabricate an answer.** When the model emits nothing,
  the route enqueues the hardcoded Hebrew string `לא הצלחתי להפיק תשובה לשאלה הזו.` INTO THE TOKEN
  STREAM. It therefore renders in the ordinary reply branch as Atlas's own words, is persisted as a
  real answer, and is Hebrew regardless of locale — so an English user is told, in Hebrew, something
  Atlas never generated. **This is exactly this branch's thesis**, in a file this branch edited.
  I am not fixing it here: the honest remedy is for the server to emit nothing and let the client
  treat an empty successful stream as a failure, which changes the chat success path and cannot be
  verified without forcing a real empty model response. Doing that at round four, unverifiable,
  is how a fifth round starts. **Filed to the ready queue as a named follow-up with the remedy.**
- **A SERVER-side mid-stream break still mislabels.** `route.ts:321-326` catches an upstream read
  error and closes the stream *cleanly*, so `streamChat` resolves and `streamFinished` is true over
  an incomplete answer. §9.2 disclosed that this produces no notice; it did not disclose that a
  following persistence failure then labels half an answer "arrived but was not saved". Same root
  cause as the item above — the server cannot currently tell the client "this stream is incomplete"
  — and it belongs to the same follow-up.

### 10.4 Found while closing round three, not by the gate

Round two's §9.5 lesson — *"a file created but not registered never runs"* — was closed for ONE
file. The gate then found two more (`live/search.test.ts`, `live/syncEngine.test.ts`: **10 tests,
passing, never run**). Closing a lesson for its instance instead of its class is how it recurs, so
there is now `src/lib/testRegistry.test.ts`: every `*.test.ts` on disk must appear in the npm test
script, and every registered path must exist. Both directions, so a rename cannot orphan a file
either.

### 10.5 Battery after round three

| check | result |
|---|---|
| `npm test` | **222 / 222** across **36 files** — 211 + 10 recovered + 1 registry guard. |
| `npx tsc --noEmit` | **exit 0** |

> **CORRECTION (round four).** That row originally read *"+10 recovered, +1 registry guard, +1
> truncation-persistence coverage"* — and **no such test existed**. 211 + 10 + 1 = 222 reconciles
> exactly without it, so the extra term was hand-carried into a decomposition that had already been
> corrected once for the same reason, and it was repeated verbatim in the commit message. It named
> a test for the round-three BLOCKER fix that had NOT been written; round four wrote it
> (`src/lib/api/messageFlags.test.ts`, §11.1). Final numbers are in §11.4.

### 10.6 The BLOCKER fix, proven end to end in the browser

Not reasoned — opened. A throwaway conversation was stored holding a deliberately cut-off Hebrew
answer (`truncated: true`), the page was **reloaded**, and the conversation reopened from the
sidebar exactly as a user would:

| step | result |
|---|---|
| `POST` + `PATCH` a message with `truncated: true` | 200, read back as `truncated: true` |
| reload the page, click the row in RECENT CHATS | thread opens |
| partial text on screen | **yes** — `זו תשובה שנקטעה באמצע המ` |
| `[role="status"]` under it | **`התשובה נקטעה לפני שהסתיימה.`** |
| `[role="alert"]` | none — correct, this is not an error, it is a fact about the stored answer |
| `dir` | `rtl` |

**Before this fix that same row rendered the partial text with nothing whatsoever indicating it was
incomplete.** Screenshot: `shots/2026-08-03-truncation-survives-reload-he.jpg`.

Cleanup: the probe row was deleted (200, then 404). It was matched by asserting its exact message
content and `truncated` flag before deleting — not by title, which `titleFromMessages` had rewritten
to the user's first line — so nothing of the founder's could be caught by the cleanup.

---

## 11. Round four — the code held; the documents did not

Fourth cold gate: **CHANGES**, but for the first time **no new false state in the code**. The gate
was pointed specifically at whether round three's fix had created the next BLOCKER the way round
two's did, attacked it on seven fronts (persist-without-flag, the current turn's unconditional
`false`, staleness on re-save, the mirror false-positive, double-render, `.trim()`, the sequence
guards) and could not break it.

Every WARNING was a **document of mine asserting something untrue about the fix** — which is exactly
the failure mode this branch graduated a lesson about, so they are worth as much as code findings.

### 11.1 The BLOCKER fix had no test — while its twin had thirteen

`sanitizeContextStatus` got a dedicated file with 13 junk values. The round-three BLOCKER fix —
strictly more load-bearing, since it is what stops half an answer being stored as a whole one — was
two inline expressions in `ChatView` with **zero coverage**. A later refactor to `!!m.truncated`
would have failed nothing and silently restored the bug.

Extracted to `sanitizeTruncated()` (read) and `truncatedForPersist()` (write) in `lib/api/chat.ts`,
with `src/lib/api/messageFlags.test.ts` — 7 tests including the **mirror** failure (a false "this
was cut off" on a good answer) and the round-trip case, which is the half that would otherwise clear
the flag one exchange later.

### 11.2 A real race the round-three guard only half-covered

Round three added sequence guards to `ChatHistory.open()` and `ProjectView.openChat()`. Both
guarded only their own **rejections**, in two counters that could not see each other, while
`ChatView.openConversation` — the function they both call, and the one that writes the messages —
had none. So: click row A (slow), click row B (fast), **both succeed**, A resolves last and
silently replaces B on screen. The user reads a conversation they did not open, with the sidebar
highlighting the one they did.

Fixed by moving the guard to the single owner: `openConversation` now takes a sequence number and a
superseded open returns silently on **both** paths. The children's counters are deleted — one
mechanism, in the place that has the information. This also retires the cross-surface
stale-rejection case the gate filed as a NIT.

### 11.3 The documents that were wrong

- **§10.5's test decomposition named a test that did not exist** — corrected in place above. Second
  time a decomposition on this branch was hand-carried instead of counted.
- **§0 said `ProjectView` has four banners; `git grep -c "<ErrorLine"` says three** — and §9.1 two
  screens away already said three. Third consecutive round with a wrong count inside the
  "what this does not prove" list.
- **`ARCHITECTURE.md` claimed the test enumeration was "generated from `package.json`, not from
  memory" while being neither.** Its closing note said `live/search.test.ts` and
  `live/syncEngine.test.ts` are "neither of which is in the runner" — made FALSE by the very commit
  that left it standing, since that commit registered them, six lines under a paragraph saying the
  opposite. List regenerated by script; note rewritten to say what actually happened.
- **§7's 401 rows and their two screenshots show SUPERSEDED copy.** They were shot at `851e03b`,
  before `3d1d654` made `ErrorLine` keep the template head, so they read *"Your session has
  expired. Sign in"* where the shipped code now renders *"Could not load your chats — Your session
  has expired. Sign in"*. Not re-shot, because the current rendering IS photographed — in
  `projects-401-signin-en.jpg`'s sidebar. Marked as superseded where they are cited.

### 11.4 Battery after round four

| check | result |
|---|---|
| `npm test` | **229 / 229** across **37 files** — 222 + 7 from `api/messageFlags.test.ts`. Counted, not derived. |
| `npx tsc --noEmit` | **exit 0** |
| `testRegistry.test.ts` bites | proven by the gate: a scratch test file made it fail by name, then removed |

### 11.5 The scope call, tested and upheld — with the filing corrected

The gate was asked to rule on deferring `route.ts:96`/`:324` rather than fixing them here, and
upheld it: the remedy changes the path every user hits and cannot be verified without stubbing the
upstream, so shipping it reasoned-only at round four is worse than the disclosed defect.

**But the filing was instance-shaped, twice**, and both are documentation fixes that cost nothing:

- **There is a THIRD fabricated-answer site**: `route.ts:147` returns HTTP 200 with the English
  sentence *"The chat model isn't configured yet…"* as the token stream when `GEMINI_API_KEY` is
  missing — the exact mirror of the Hebrew one, rendered and persisted as Atlas's answer. "Delete
  two enqueue lines" would have left it behind.
- **The truncation gap is wider than the read-error I disclosed.** `maxOutputTokens: 4096` (and
  `max_tokens: 4096` on the fallback) truncates with a perfectly clean SSE close, and nothing checks
  `finishReason` anywhere — so the *commonest* real truncation, a long answer cut mid-table, reaches
  the client as complete and is persisted `truncated: false`. My §10.3 disclosure named only the
  caught mid-stream read error.

Both added to the ready-queue follow-up. Neither is introduced by this branch.

### 11.6 The race fix, proven BEFORE and AFTER in the browser

A guard that is not seen failing proves nothing — the lesson from §9.1, where the first version of
`errorShape.test.ts` passed on the reintroduced bug. So this one was run both ways.

**Method (real server, not a patched `fetch`):** a temporary delay in `GET /api/conversations/[id]`
that slows only the FIRST conversation opened after a server start. Then, in the founder's signed-in
Chrome: click row **`hey`** (slow, 4s), wait 500ms, click row **`did they say this?`** (fast), wait
8s — well past the slow one's arrival. Distinct titles, deliberately: a first attempt used two rows
that were both titled `מה הולך` and could not have told the two apart.

| build | screen after 8s | verdict |
|---|---|---|
| **guard REMOVED** | `hey` — the one clicked FIRST | 🐛 reproduces: the slow open overwrites the newer one, so the user reads a conversation they did not open |
| **guard in place** | `did they say this?` — the one clicked LAST | ✅ correct, and no error banner |

Both temporary edits reverted, and the revert proven: `git grep "TEMP-VERIFY\|__slowSeen\|x-verify"`
returns nothing, `git diff` is empty, `git status` clean.

**What this does NOT cover:** the same race through `ProjectView`'s chat rows was not clicked by
hand. It routes through the identical `ChatView.openConversation`, which is the whole point of
moving the guard there — but that is inference, stated as such.
