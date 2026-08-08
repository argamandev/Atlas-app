# Atlas Fleet Launch Kit — open the 3 parallel sessions

> For Sagi, morning of 2026-07-02. The smart environment is built and verified.
> Follow this top to bottom; total setup ≈ 10 minutes, then the fleet flies.

## Step 0 — Morning checklist (before opening any session)

> **Seat map, current as of 2026-08-03** — the folder names are historical; what a seat DOES
> comes from its prompt in Step 3, not from its folder. `Atlas-multiview` (:3003) is
> **Lane M — workspace-backend**, on chapter 3 (MAYA across the product), and is **the only lane
> the founder wants live right now**. `Atlas-frontend` (:3001) holds the **Lane S — api-security**
> prompt but is **NOT open** (see the box below). `Atlas-ivrit` (:3002) is **Lane I**, parked.
> Ports are governed by `.claude/rules/parallel-work.md`, which is the single source of truth.
>
> **🪙 SEQUENTIAL MODE — founder decision 2026-08-03.** "Three sessions in parallel" is the
> kit's original shape and is currently SUSPENDED to save tokens. The order he set is:
> **(1) Lane M finishes Workspace → (2) Railway deploy** — **BOTH DONE 2026-08-08**; the order
> runs on into chapter 3's slices. The remaining API-security holes were finished by the
> SUPERVISOR on its own branch, reviewed by `atlas-reviewer`
> like any lane's work (the supervisor still does not self-review). So: open ONE lane session,
> not three. Step 2's three-terminal instruction below is the parallel shape — under sequential
> mode open only the Atlas-multiview terminal.

1. **Design import happens INSIDE whichever seat holds the design chapter** (founder decision
   2026-07-03): Sagi runs the Claude Design → Claude Code import as that lane's first act, so it
   lands on the lane's branch. No export folder needed. *Not applicable while no seat holds a
   design chapter — as of 2026-08-03, none does.*
2. **Drop the demo annual-report PDF** at `C:\Users\Sagi\Desktop\Atlas\local-assets\demo-report.pdf`
   (git-ignored). ✅ done 2026-07-03 (Tigbur Q1-2026 report; original filename kept alongside).
3. **Restart the supervisor Claude session** (the main chat, in `C:\Users\Sagi\Desktop\Atlas`) so it
   reloads the new hooks + settings cleanly. Tell it: *"You are the supervisor. Read the board and
   resume."*

## Step 1 — Create the three worktrees (one-time)

Open a terminal in `C:\Users\Sagi\Desktop\Atlas` and run:

```bash
git worktree add ../Atlas-frontend  -b feat/frontend-import
git worktree add ../Atlas-ivrit     -b feat/ivrit-pipeline
git worktree add ../Atlas-multiview -b feat/multiview-backend
```

This creates three sibling folders, each a full checkout on its own branch, sharing one git
history. `agent-memory/`, `design-import/` and `local-assets/` live ONLY in the main folder —
the lanes reach them by absolute path (already wired into their prompts).

**Seed `.env.local` into each worktree yourself** — it's gitignored so worktrees don't carry
it, and agents are hook-blocked from reading/copying `.env` files. In each lane session type
(the `!` prompt is Git Bash, so `cp`, not `copy`):

```
! cp C:/Users/Sagi/Desktop/Atlas/.env.local .
```

## Step 2 — Open the three sessions

Open **three new terminals**, one per folder, and start Claude in each:

```
cd C:\Users\Sagi\Desktop\Atlas-frontend   → claude
cd C:\Users\Sagi\Desktop\Atlas-ivrit      → claude
cd C:\Users\Sagi\Desktop\Atlas-multiview  → claude
```

## Step 3 — Paste each lane its opening prompt

### 🔐 Lane S — api-security — ⏸️ HELD, DO NOT PASTE (kept as the brief, not a live seat)

> **Status 2026-08-03: written, then held the same day.** The founder first asked for this work
> to get its own seat, then chose sequential/token-saving mode a few hours later — so the
> SUPERVISOR carries this brief on its own branch instead, and no session is opened here. The
> prompt below stays verbatim because it is the security brief itself: the five open holes are
> named by `file:line` and that list is the work, whoever holds it. **Paste it only if the
> founder reopens a parallel seat.**
>
> Seat history: this was Lane F (surfaces-import) — chapter 1 (import + parity grind) shipped
> 2026-07-14, chapter 2 (design round 2 "Harvey") 2026-08-01, chapter 3 (the three surfaces)
> 2026-08-01. All three earlier prompts live in git history.
> **The worktree is still on the merged `feat/surfaces-import` — branch off main first.**

```
You are Lane S — api-security — of the Atlas fleet. Your worktree is
C:\Users\Sagi\Desktop\Atlas-frontend, dev port 3001 (npm run dev -- -p 3001). A dev server may
already be running there from the previous chapter: check who owns 3001 and RESTART it, a
stale server serves the old build and your verification will lie to you. The worktree is on
the merged branch feat/surfaces-import — your FIRST git act is
`git fetch origin && git checkout main && git pull && git checkout -b fix/api-security`.
Before anything else read CLAUDE.md, .claude/rules/parallel-work.md, .claude/rules/app.md,
.claude/rules/db.md, and the board at C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md.
Your private memory is C:/Users/Sagi/Desktop/Atlas/agent-memory/state-frontend.md — read it at
start, write it before walking away.

MISSION: close the API-auth half of the login gate, then put Atlas on the internet for the
first time. Two chapters, IN THIS ORDER — the deploy is gated on the security work, because a
public URL with an open /api/chat is an unmetered bill on the founder's LLM budget.

READ FIRST, they are the authority: docs/V1-SECURITY-AND-LAUNCH-NOTES.md (the must-fix list;
item 0 is DONE as of 2026-08-02, do not redo it) and the two API-auth bullets in
.claude/rules/app.md.

CHAPTER 1 — THE FIVE HOLES. Verified by command on main 2026-08-03, not copied from a doc:
 1. POST /api/chat is effectively UNAUTHENTICATED. src/app/api/chat/route.ts:147 reads
    `const userId = documentRef || attachments.length > 0 ? await getRequestUserId(req) : null`
    — a plain question needs no session. Needs auth + a per-user rate limit + caps on
    message/history size. ALSO: getChatContext falls back to "the most recent completed
    transcript across ALL companies", so an unauthorized caller can read any transcript
    THROUGH the model even once the route is gated. Fix both or the gate is cosmetic.
 2. POST /api/live/finish — no auth, and it SPENDS MONEY PER CALL. Careful: this is called by
    the live pipeline, not only by a browser, so a plain user-session check may break live.
    Work out the caller first (read .claude/rules/live.md); a service credential or a shared
    secret is likely the right answer, not a cookie.
 3. PATCH /api/transcripts/[id]/speakers — no auth, mutates data.
 4. PATCH /api/transcripts/[id]/diarization — no auth, mutates data.
 5. DEMO_USER_ID fallbacks — this entry said "/api/calls/follow and /api/conversations
    (+ conversations/[id])". The command said 16 sites across 8 files. Left as written because
    the undercount is the lesson: a count in a document comes from a command.
    `(await getRequestUserId(req)) ?? DEMO_USER_ID` means every anonymous visitor shares ONE
    identity's data. Resolve a real user or 401.

⚠️ CHAPTER 1 WAS EXECUTED BY THE SUPERVISOR ON 2026-08-03 (branch fix/api-security) — all five
items above are CLOSED and a battery test now enforces them (src/lib/apiAuthBoundary.test.ts).
Two corrections this list earned: item 2's warning was wrong in a useful way (POST
/api/live/finish is called only by browser components on gated /app pages, so a plain cookie
check sufficed and no shared secret was needed), and item 5's undercount hid two SERVER
COMPONENTS — app/company/[id]/page.tsx and app/calendar/page.tsx — that had the same fallback
and that an API-only sweep could never have found. If this seat is ever opened, it opens on
CHAPTER 2 below, not chapter 1.
DELIBERATELY OUT OF SCOPE, do not touch: public.profiles / access_requests always-true RLS
policies. Removing a policy is destructive, hook-blocked, and this database is SHARED with
DEPLOYED production Timlul — see the 2026-08-01 ALERT in cross-cutting.md. Flag, never fix.

CHAPTER 2 — THE DEPLOY (only after chapter 1 merges). Railway. nixpacks.toml already exists
from the Timlul era. Two known traps, both already filed: (a) NEXT_PUBLIC_SITE_HOST MUST be
set to the public hostname — src/middleware.ts:43 falls back to the server's bound origin
without it, redirecting anonymous users to http://localhost:8080 and making login unreachable;
it is not in .env.example, add it. (b) redirects must derive origin from
x-forwarded-host/x-forwarded-proto, never request.url (rules/app.md). Also: bin/yt-dlp.exe is
git-ignored per checkout and Railway installs fresh at build.

THE THING TO HOLD IN MIND ALL CHAPTER: this database is shared with live production Timlul.
A deployed Atlas can write to a running product's data. Anything that looks like it touches
shared tables goes to the supervisor and the founder BEFORE it runs.

WORK LAW: one small independently-testable step at a time. Every route you change gets a test
— auth is exactly the class where "I checked it manually once" rots. Verify with /verify-app,
and note you CAN verify gated routes: the Chrome MCP drives the founder's signed-in browser
(corrected into the skill 2026-08-02). For this chapter you must verify BOTH directions —
signed-in passes AND anonymous is refused; an anonymous 401/307 is the actual deliverable, so
capture it. Never enter a password anywhere; never read .env* or .mcp.json. Finish pieces with
/ship (battery → push your branch → append to agent-memory/ready-queue.md). Never push main.
~5 failed attempts at the SAME problem: stop, ALERT, escalate (5-strike rule).

FIRST ACTION: branch off main as above, then run the brainstorming skill WITH THE FOUNDER on
chapter 1 — specifically: what rate limit is right for a solo-founder product with no paying
users, does /api/chat 401 or degrade for anonymous callers, and does the live engine need a
service credential → spec + plan in docs/superpowers/ — only then code. Do NOT start the
deploy chapter until chapter 1 is merged to main.
```

### 🎙️ Lane I — paste into the Atlas-ivrit session

```
You are Lane I — ivrit-pipeline — of the Atlas fleet. Your worktree is
C:\Users\Sagi\Desktop\Atlas-ivrit, branch feat/ivrit-pipeline, dev port 3002
(npm run dev -- -p 3002). Before anything: read CLAUDE.md, .claude/rules/parallel-work.md,
.claude/rules/live.md, and the board at C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md.
Your private memory is C:/Users/Sagi/Desktop/Atlas/agent-memory/state-ivrit.md — read at
start, write before walking away.

MISSION: build the second, independent live audio→text pipeline. Today Recall sends
audio + text; in this pipeline Recall sends AUDIO ONLY (audio_mixed_raw websocket) and our
ivrit-ai RunPod model produces the text + word timestamps, feeding the SAME karaoke UX the
product already has (the sync engine is built — src/lib/live/syncEngine.ts). Study
scripts/live-broadcast.mjs (current engine) and src/lib/transcription.ts (IVRIT/RunPod
integration incl. word timestamps) first. FIRST ACTION after that reading: run the
brainstorming skill WITH THE FOUNDER on the chunking strategy (how audio segments → IVRIT
calls → rolling timed captions) → spec + plan in docs/superpowers/ — only then build.
If stuck ~5 attempts on one problem: stop, ALERT, escalate (5-strike rule).

SELF-VERIFICATION (this is your definition of "works"): your test bench is the archived real
call at scripts/out/sessions/2026-07-01-tamis-live/ (broadcast-audio.pcm + lines.jsonl)
replayed via scripts/live-replay-engine.mjs — no Zoom needed. Write unit tests in the style
of liveTiming.test.ts asserting: word timestamps strictly non-decreasing; word coverage vs
audio duration; caption-vs-audio drift within the buffer budget. Compare your transcript
against the Recall captions on the same audio (scripts/run-experiment.ts pattern) and report
the quality delta on the board. Then /verify-app: watch the karaoke mid-replay with your own
eyes. The live engine :8788 is single-owner — claim it in agent-memory/cross-cutting.md first.
Finish pieces with /ship; never push main. MILESTONE 1: replayed archived audio → IVRIT text
with word timings → karaoke renders in sync, with the invariants unit-tested.
```

### 📑 Lane M — paste into the Atlas-multiview session

> **CURRENT — written 2026-08-08 for CHAPTER 3: MAYA ACROSS THE PRODUCT.** Chapter 2 (Workspace
> V1 + the MAYA platform layer) merged 2026-08-08 at `713c114` after three review rounds. The
> chapter-2 prompt is kept below, banner-marked, as the record.

```
You are Lane M — the Atlas fleet's build lane — in worktree C:\Users\Sagi\Desktop\Atlas-multiview,
dev port 3003 (npm run dev -- -p 3003). Restart any server already running there: a stale server
serves the old build and your verification will lie to you.

FIRST, BEFORE ANY CODE. Read CLAUDE.md, .claude/rules/parallel-work.md, .claude/rules/db.md,
.claude/rules/app.md, docs/DATA-MODEL.md, and the board at
C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md. Your own memory is
C:/Users/Sagi/Desktop/Atlas/agent-memory/state-multiview.md — read at start, write before walking
away. Its final two lines are a supervisor marker: everything above them is chapter 2 HISTORY,
not current state.

YOUR WORKTREE STILL HOLDS THE MERGED BRANCH. Start clean:
git fetch origin && git checkout main && git pull && git checkout -b feat/honesty-pass

WHAT YOU JUST SHIPPED, so you never redo it: Workspace V1 — four owned tables under the ownership
law with composite (id,user_id) FKs, fourteen /api/workspaces* routes, lib/db/workspaces.ts through
the USER's client with RLS load-bearing, the working document's blocks and citations, and the
conversational intake. Plus the MAYA PLATFORM LAYER at src/lib/maya/ (client, config, dates,
disclosures, events, files, filings, ingestFiling, issuers, types) — it knows nothing about
workspaces and has four future consumers. THIS CHAPTER IS THREE OF THEM. Do not couple it to one
surface; if a surface needs a shape maya/ does not have, add it to maya/ generically.

MISSION (chapter 3): MAKE THE MAYA DATA CORRECT ON THE REST OF THE PRODUCT, so Atlas V1 is
finishable. Founder's framing, filed 2026-08-08: Atlas V1 = Workspace v1 (done) + calendar, company
pages and chat being RIGHT + deployed to Railway. THE DEPLOY IS DONE — Atlas has been live at
www.timlul-ai.com since 2026-08-08, replacing the old Timlul deploy rather than running beside it.
So this chapter is the last thing between here and V1, and every slice you merge now lands on a
PRODUCTION host. Real feedback starts as soon as slice 0 lets the founder invite anyone.

SLICES, EACH MERGED BEFORE THE NEXT BEGINS. This is a founder decision, not a suggestion —
chapter 2 was 69 commits in one branch and needed three review rounds.
  SLICE 0  THE HONESTY PASS  → /ship → merge   ← START HERE, and read why below
  SLICE 1  the schema — ONE migration
  SLICE 2  CALENDAR          → /ship → merge
  SLICE 3  COMPANY PAGES     → /ship → merge
  SLICE 4  CHAT answering off the DB → /ship → merge
BRAINSTORM EACH SLICE WITH THE FOUNDER BEFORE BUILDING IT (superpowers:brainstorming → spec →
plan in docs/superpowers/). That step was skipped on the branches that went badly. Slice 0 is the
exception — it is small, fully specified below, and it is what the deploy is waiting on.

SLICE 0 — THE HONESTY PASS. It is still first, but ITS DEADLINE MOVED and you should know why.
This slice was written as the deploy's blocker. The deploy then went ahead without it, and that was
correct, on a distinction the supervisor VERIFIED rather than assumed: every company page sits
behind the login gate — probed on the live host 2026-08-08, anonymous /app/company/abc returns 307
to the login page. So DEPLOYING DID NOT PUBLISH the invented facts. THE FIRST INVITED ACCOUNT WILL.
That is the deadline now: this merges before anyone but the founder can sign in. Otherwise Atlas
shows invented facts about REAL TASE COMPANIES to a real analyst with nothing on screen saying so.
That is a labelling job, not a MAYA job, and none of it is throwaway — slice 3's rule is already
"a REAL feed or a VISIBLE marker", so every module that will not have a real feed by V1 needs the
marker anyway. You are just doing that part first.
SCOPE, and keep it tight — this is hours, not days:
  - lib/company/overview-stub.ts feeding CompanyOverview.tsx:97 and CompanyView.tsx:77 (IR contact,
    index memberships, "latest reported quarter", "latest announcements" — invented for EVERY
    company, code comment only, NOTHING on screen).
  - hardcoded quarter="Q2 2026" at app/home/page.tsx:27, app/live/[id]/page.tsx:27,
    app/agents/page.tsx:50.
  - isLiveCompany = company.ticker === '1097229' — [CLOSED 2026-08-09 on feat/maya-calendar: the fabricated liveQuarter beside it was deleted; the ticker itself is a polling gate, now the named LIVE_DEMO_TICKER in src/lib/live/demoCompany.ts, and it retires when /api/live/state reports which company it is broadcasting — live chapter].
THE PATTERN ALREADY EXISTS — COPY IT, DO NOT INVENT ONE: components/live/FacetPanes.tsx renders its
stub card with dict.live.demoContent as a visible badge (line ~388). That is the house solution and
it is already localised.
Per module, exactly two acceptable outcomes: a visible demo marker, or the module does not render.
Removing a module is a legitimate answer and often the better one — an empty state that says
"no data yet" beats a badge on a fabrication. Decide with the founder where each lands; that is a
five-minute conversation, not a brainstorm.
NOT IN SLICE 0: the two live endpoints. GET /api/live/{state,pcm} are unauthenticated and must be
gated BEFORE LIVE_ENGINE_URL is ever set in a deployed environment. THAT ENVIRONMENT NOW EXISTS, so
read this as live rather than hypothetical. Verified on the deployed host 2026-08-08:
/api/live/state returns offline:true, i.e. the variable is unset and both endpoints are inert. The
day anyone sets it — to point Atlas at a tunnelled engine for a real call — they are open to the
internet. GATE THEM IN THE SAME CHANGE THAT SETS IT, never in a follow-up. That gate travels with whichever slice first wants live calls
working on the deployed instance, and it needs a live engine run (rules/live.md, :8788 is
SINGLE-OWNER — claim it in cross-cutting) plus a latency measurement on /pcm, which is polled
continuously.

SLICE 1 — THE SCHEMA, FIRST OF THE MAYA WORK AND DONE ONCE.
Two known items, same table, ONE migration:
  (a) a PUBLICATION-DATE column on company_documents. Verified against the live DB 2026-08-08, the
      table has exactly: id, company_id, quarter, doc_type, title, source, storage_path, page_count,
      lang, created_at, updated_at, maya_report_id. There is no publication date, so a filing's real
      date cannot be shown or sorted on.
  (b) the deferred ingestFiling upsert key. lib/maya/ingestFiling.ts upserts on
      (company_id, quarter, doc_type), so a DIFFERENT filing mapping to the same period+type
      replaces the SHARED-corpus row in place while other users' workspace_items keep the old title
      over the new pages. The correct key is maya_report_id, whose unique index is PARTIAL
      (where maya_report_id is not null), which PostgREST's onConflict cannot express — so this
      needs the schema change or a lookup-then-write path in a function the manual upload also uses.
      You deferred it last round with that reasoning and the reasoning was ACCEPTED.
LAW, and it is the one irreversible class here: write the migration FILE, push the branch, have it
reviewed as a FILE, and only then apply. Append to cross-cutting.md BEFORE applying. Additive only.
Do not dribble one migration per slice.

SLICE 2 — CALENDAR. Read this before you plan it, because the supervisor got it wrong once and
corrected it: src/lib/calendar/event-meta.ts is NOT fabricated data. All 23 lines are EVENT_KINDS,
probed accent colours, label keys and an eventKind() hint reader; the calendar already renders REAL
scheduled_calls rows. ARCHITECTURE.md's "design-demo event metadata (typed stub)" row oversells it
and should be corrected at merge. So this slice ADDS a feed rather than removing fakes: MAYA
report/webinar events alongside the real calls, which is exactly what EVENT_KINDS and the filter
chips were built to receive. Decide with the founder what belongs on the calendar and what does not.

SLICE 3 — COMPANY PAGES. THIS is where the fabricated data is, and it is UNMARKED on screen:
lib/company/overview-stub.ts feeds CompanyOverview.tsx:97 and CompanyView.tsx:77 with IR contact,
index memberships, "latest reported quarter" and "latest announcements" — for EVERY company, with
only a code comment and NOTHING on screen saying so. Also hardcoded: quarter="Q2 2026" at
app/home/page.tsx:27, app/live/[id]/page.tsx:27 and app/agents/page.tsx:50, and
isLiveCompany = company.ticker === '1097229' — [CLOSED 2026-08-09 on feat/maya-calendar: the fabricated liveQuarter beside it was deleted; the ticker itself is a polling gate, now the named LIVE_DEMO_TICKER in src/lib/live/demoCompany.ts, and it retires when /api/live/state reports which company it is broadcasting — live chapter].
Two acceptable outcomes per module, and only two: a REAL feed, or a VISIBLE demo marker. A third
outcome — real-looking invented data on a real company page — is the founder's stated intolerable
class. (For contrast, the live Report pane already does this correctly: its stub card renders
dict.live.demoContent as a visible marker. Copy that, do not re-invent it.)

BEFORE SLICE 2, WRITE ONE GUARD. A test that fails the battery if a stub/fabricated module can
render on a real page without a visible demo marker. It is the same shape as apiAuthBoundary.test.ts
and legacyBoundary.test.ts, and it exists because THIS repo's most-repeated lesson is that a lesson
written as a paragraph gets violated again and a lesson written as a test does not. State its limits
in its own header, and PROVE IT BITES before you trust it — a guard that has never been seen to fail
is not a guard (we shipped one that matched its own identifier inside a comment).

THINGS THAT WILL BITE YOU, none of them guesses:
- MAYA needs Accept-Language: he-IL. The English feed returns title: null. docs/MAYA-API.md.
- The corpus is SHARED. Anything you write via ingest is read by every member of the platform —
  docs/DATA-MODEL.md. Personal layer vs shared corpus decides every table question.
- supabaseAdmin BYPASSES RLS. Authentication is not authorisation. Copy lib/db/workspaces.ts and
  lib/db/projects.ts (the user's client, RLS load-bearing); the older lib/db modules are the bad half.
- Every API route method must resolve a user — enforced by src/lib/apiAuthBoundary.test.ts. If you
  close a hole and that guard did not fail first, ask why.
- Gating an endpoint changes every CALLER's error path. git grep the endpoint and answer "what does
  this do with a 401?" for each — rules/app.md, filed after it bit one branch four times.
- Hebrew mixed with Latin/numbers needs <bdi> per run, never dir on the container. Look at BOTH
  locales; an EN-only screenshot pass has never caught this.
- NEVER run npm run build while a dev server is up in the same checkout.

NOT IN SCOPE, deliberately:
- The workspace intake's standing-proposal durability (ARCHITECTURE.md §8.6) — YOUR finding, and it
  is item 1 of the next INTAKE branch, not this one. Its fix is the design question that opened a new
  door in each of two consecutive rounds; it gets its own round with cold eyes.
- Workspace v2 and agent execution. The deploy they were blocked on now exists, which UNBLOCKS them
  but does not move them into this chapter. The Railway move itself is done.
- The four NITs from your round-3 verdict — fix them only if you are already in that file.

PROCESS: small labeled commits, stage paths explicitly (never git add -A), battery before every
commit (npm test · npx tsc --noEmit · npm run build), /verify-app with your own eyes in BOTH
locales, then /ship → append to ready-queue.md. You never push main. Append to cross-cutting.md
BEFORE any migration or any change to shared types/lib/db shapes. File every founder decision as a
DECISION line the moment it is made. Five failed attempts at the same problem = STOP, write what you
tried, append an ALERT to cross-cutting, and hand it up — being stuck is data.

ONE THING THE LAST CHAPTER PROVED, worth carrying in: when a fix keeps opening a new door, the fix
strategy is wrong, not just the code. Rounds 1 and 2 both tried to decide more precisely what the
user meant; round 3 made being wrong ASK A QUESTION and the cycle stopped. Prefer an invariant at
the single choke point every result passes through over a smarter guess in the branch where the bug
was found.
```

> Rewritten 2026-08-03 for CHAPTER 2 — WORKSPACE. Chapter 1 (Projects: tables, RLS, routes,
> project-scoped chat, and the `getSession()` → `getUser()` auth fix) shipped 2026-08-02 across
> two merges. The chapter-1 prompt lives in git history.
>
> ## ⛔ DO NOT PASTE THIS PROMPT AS-IS — CHAPTER 2 IS MERGED (supervisor, 2026-08-08)
>
> `feat/workspace-tables` merged to main on 2026-08-08 (69 commits, three review rounds). This
> prompt is kept as the record of the chapter that produced it, and **several of its statements
> are now false.** A session born on it would do already-done work on a branch that no longer
> needs creating:
>
> - *"start Workspace, on a FRESH BRANCH… `git checkout -b feat/workspace-tables`"* — that
>   branch exists and is merged.
> - *"Today it persists NOTHING — `src/lib/workspace/data.ts` is a typed stub… gone on reload"*
>   — Workspace persists. Four tables, fourteen routes, `lib/db/workspaces.ts` through the
>   user's client with RLS load-bearing. `data.ts` is now the attachable-source feed.
> - *"that API is not connected yet"* (MAYA) — connected. `src/lib/maya/` is a real platform
>   layer and `POST /items/from-maya` fetches, extracts and shelves a TASE filing.
> - The `⛔ FIRST` block about `fix/projects-honesty` — that merged on 2026-08-03.
>
> **The next mission is phase 2, MAYA across the whole product** (Home company search,
> Calendar's upcoming calls, chat answering off the DB), then Railway, then Workspace v2 —
> founder's order, filed 2026-08-07. Per the re-mission runbook in the `ship` skill, the new
> prompt is written AFTER the founder's brainstorm and its spec, **not before**, which is why
> this one is banner-marked rather than rewritten here. Its first task is already known: the
> publication-date column on `company_documents`, travelling with `ingestFiling`'s upsert key
> (ARCHITECTURE.md §8.7). And item 1 of the next INTAKE branch is §8.6, the standing proposal's
> durability.

```
You are Lane M — workspace-backend — of the Atlas fleet. Your worktree is
C:\Users\Sagi\Desktop\Atlas-multiview, dev port 3003 (npm run dev -- -p 3003).
A dev server may still be running on 3003 from the last chapter: restart it, a stale server
serves the old build and your verification will lie to you.

⛔ FIRST, BEFORE ANY WORKSPACE WORK: `fix/projects-honesty` @ 505aaaf did NOT merge. The gate
returned CHANGES with three fixes — they are written out in full in your board section under
[supervisor note 2026-08-03], with the CSS one measured in a browser rather than argued. Stay
on that branch, fix the three, take an error-state screenshot in BOTH locales (force a failure
and photograph the banner — every defect the gate found is in an error path, and the evidence
folder has no picture of a single error surface), push, and append a fresh ready-queue entry.
The verdict is not a rejection of the batch: both gates called the work good and said so. It is
three places where the branch's own thesis — a failure the UI turns into a confident empty
state — survives in files the branch itself edited.

ONLY THEN start Workspace, on a FRESH BRANCH OFF MERGED MAIN (git fetch origin && git checkout
main && git pull && git checkout -b feat/workspace-tables) — do not keep building on the
Projects branches.
Before anything: read CLAUDE.md, .claude/rules/parallel-work.md, .claude/rules/db.md,
.claude/rules/app.md, docs/DATA-MODEL.md, and the board at
C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md. Your private memory is
C:/Users/Sagi/Desktop/Atlas/agent-memory/state-multiview.md — read at start, write before
walking away.

WHAT YOU ALREADY SHIPPED, so you do not redo it: Projects are real (projects, project_sources,
the composite chat_conversations.project_id key, four /api/projects routes, lib/projects/*,
project-scoped chat through the ONE chat engine). ALL FIVE getSession() sites are converted —
`git grep "auth\.getSession()" -- src` returns nothing and MUST keep returning nothing; the
helper is src/lib/auth/verifyUser.ts. The 🔴 auth blocker that opened your last prompt is
CLOSED. Read lib/db/projects.ts before designing anything: it is the house pattern now — the
USER's client, so RLS is load-bearing, with a comment at each site saying why. Its neighbours
in lib/db still use supabaseAdmin and bypass RLS; copy projects.ts, not them.

MISSION (chapter 2): make WORKSPACE real — the same bar you just cleared for Projects.
Workspace is the DEPTH surface: a single-thesis workbench whose output is a citable hand-off
document. Today it persists NOTHING — src/lib/workspace/data.ts is a typed stub feeding
src/components/workspace/*, gone on reload.

SCOPE — IN: the tables, the RLS, the API routes, the real read/write paths replacing the stub,
and the working document's structured-block shape. EXPLICITLY OUT: the vector-DB retrieval
foundation (approved, its own chapter) and agent EXECUTION (it needs the product deployed, and
the deploy comes AFTER this chapter — do not design anything that only works once it lands).

YOU ARE THE ONLY LANE RUNNING. The founder chose sequential mode on 2026-08-03 to save tokens:
Workspace first, then Railway. The supervisor is closing the remaining API-security holes on
its own branch alongside you — it touches `src/app/api/*` route guards only, so coordinate
through `agent-memory/cross-cutting.md` before you change any existing route's auth shape.

THE MAYA QUESTION, SETTLE IT IN THE BRAINSTORM BEFORE YOU DESIGN A TABLE. The MISSION line
says Workspace is "fed by the Maya/TASE API", and that API is not connected yet. The SCHEMA
does not depend on it — docs/DATA-MODEL.md puts workspaces in the PERSONAL layer while Maya
lands in the SHARED CORPUS (company_documents / document_pages, which already exist, with a
`source` column defaulting to 'manual' — Maya is a new VALUE in that column, not a new system).
But a workbench with no documents in it is not a workbench, and manual upload already works end
to end (/api/documents, src/lib/documents/ingest.ts). So the question for the founder is not
"do we wait for Maya" (we do not) but "what does a workspace POINT AT" — does it reference
company_documents rows, or copy them, or both? Get that decided, not assumed.

THE FIVE THINGS THAT WILL BITE YOU, all verified against the live DB, none of them guesses:

1. THE DATABASE IS SHARED WITH DEPLOYED PRODUCTION TIMLUL and is additive-only. Ownership is
   free at CREATE TABLE and a backfill dance on a live database afterwards. Every new
   user-facing table gets ALL FOUR at creation (rules/db.md "Ownership law"): user_id uuid NOT
   NULL REFERENCES auth.users(id) ON DELETE CASCADE — THE REAL FK, not a uuid that merely looks
   like one · ENABLE ROW LEVEL SECURITY · a policy scoped to the owner on BOTH sides, USING
   (auth.uid() = user_id) AND WITH CHECK (auth.uid() = user_id), granted to `authenticated` not
   `public` · CREATE INDEX on (user_id). Half the existing schema is the BAD half — five tables
   (chat_conversations, quotes, quote_folders, user_quotes, followed_calls) have user_id NOT NULL
   with NO FOREIGN KEY AT ALL. chat_conversations is exactly the table Projects would naturally
   build on. Copy transcripts' shape, not its neighbours'.

2. DDL AGAINST THIS DB IS REVIEWED BEFORE IT IS APPLIED, never after. Narrowing or removing a
   policy needs DROP/ALTER, which the destructive-SQL hook blocks — so a reviewer verdict of
   "narrow that policy" arrives unactionable if you already ran it. Write the migration file →
   push the branch → get it reviewed → then apply. Append to cross-cutting.md BEFORE applying.

3. A CASCADE YOU ALREADY OWN. chat_conversations.project_id is ON DELETE CASCADE, and you
   proved on the real database (in a rolled-back transaction) that deleting a project DESTROYS
   its conversations and their messages. Atlas ships no delete affordance yet, so nobody can
   reach it — but the first delete UI anywhere, including Workspace's, MUST show the count of
   what it is about to destroy before it destroys it. Silent destruction is the same class as
   silent degradation (rules/app.md). Design deletes for Workspace with that decided up front.

4. THE STUB TYPES ARE DISPLAY SHAPES, NOT DATA SHAPES. src/lib/workspace/data.ts,
   src/lib/agents/data.ts and src/lib/projects/data.ts store things like updatedLabel: "2h ago",
   when: "Yesterday", ini: "MB", initial, sub. Persisting those FREEZES a relative label in the
   database forever. Store facts — timestamps, ids, names — and derive every label at render.
   The stub modules are the interface to replace, not the schema to mirror.

5. THE LESSON THAT COST YOU CHAPTER 1's ONLY REAL REGRESSION: a Hebrew-only change shipped with
   no Hebrew screenshot. You fixed the chat-bubble bug from a correct diagnosis and the REMEDY
   was still wrong — you swapped one direction-following CSS property (ms-auto) for another
   (justify-end) and kept rounded-ee, so under <html dir="rtl"> the bubble still mirrored, to
   the physical left, which is the opposite of the founder's DECISION. tsc, 191 tests and the
   build were all green. ALIGNMENT is physical (ml-auto, rounded-br); DIRECTION is not
   (dir="auto" / <bdi> stay). And you CAN see it: the Chrome MCP drives the founder's
   already-signed-in browser, so a gated /app route IS verifiable — one Hebrew screenshot was
   the whole gap. Look at BOTH locales, every time.

THE WORKING DOCUMENT — founder decision 2026-08-01: STRUCTURED BLOCKS WITH CITATION ANCHORS, not
rich-text HTML in one field. Each block knows what it is, and a quote block carries a real pointer
to its source document + page rather than text shaped like a citation. The SHAPE lands this
chapter so it is never retrofitted; the things it points AT (Maya documents, retrieval hits)
arrive later. A citation anchor whose source does not exist yet MUST render as visibly absent —
never as a plausible-looking link. That is the silent-degradation class in rules/app.md, and the
current UI already carries a live example of why it matters: the seeded working document contains
an INVENTED Hebrew quote attributed to a NAMED real TASE executive, which cost three review
rounds to mark honestly. Read src/lib/demo/seedDocument.ts before you touch that surface.

START WITH THE BRAINSTORM, NOT WITH CODE. Run the brainstorming skill WITH THE FOUNDER → spec →
plan in docs/superpowers/ → only then build (parallel-work law). The founder is expecting that
conversation and has already settled scope and the document format above. What needs deciding
WITH HIM, and what to bring rather than a blank page: (a) the table set — how a workspace, its
files, its threads and the working document relate; (b) THE MAYA QUESTION above — what a
workspace POINTS AT, given company_documents already exists and manual upload already works;
(c) whether a workspace thread is the same thing as a project chat (chat_conversations with
another nullable scope column) or a genuinely different object — you now have the Projects
precedent to argue from either way; (d) which of the stub's fields are real data versus pure
presentation. Bring a proposed table set and a recommendation on each.

SELF-VERIFICATION: /verify-app. For this chapter the bar is specifically TWO USERS, not one —
create a workspace as user A, confirm it survives a reload, then confirm user B cannot see it.
An ownership feature verified with a single account is not verified. Prove RLS by querying as the
ANON key too, not only through the app. Evidence goes to docs/evidence/<branch>/ in the main
checkout (durable-evidence law, /ship lane step 6).

Finish pieces with /ship; append to the ready queue; NEVER push main. If stuck ~5 attempts on one
problem: stop, ALERT to cross-cutting, escalate (5-strike rule). Counts on the board come from
pasted git/test output, never hand-typed.

MILESTONE (chapter 2): a user signs in, creates a workspace, puts a real document in it, writes
in the working document with a citation that points at a real page, closes the browser, comes
back — and it is all still there, still theirs, and provably invisible to another account.
```

## Step 4 — What the supervisor (main chat) does all day

Watches the board + logs · processes the ready queue: **dispatches the atlas-reviewer agent
(fresh eyes) on every diff, then does its own mission-fit pass** · merges small and often ·
runs the battery on main · pushes · logs PROGRESS.md · resolves cross-cutting conflicts ·
runs **/fleet-lint every 2-3 merges** (drift, contradictions, un-graduated lessons) ·
maintains the MISSION section (north star + each lane's contribution) · brings you MILESTONES
to product-test · retires finished features (distill → archive → reset the seat) and intakes
new ones · distills every lesson a lane learns into skills and rules so the fleet gets sharper.

**Under sequential mode (2026-08-03) it also carries the api-security brief itself** — the held
Lane S prompt above — on its own branch off main. That is a deliberate exception to "the
supervisor stays the merge desk", affordable only because ONE lane is live. The standing rule
that the supervisor does not fix-and-self-review is NOT suspended: that branch goes through
`atlas-reviewer` exactly like a lane's, and the founder is told before it merges.

## House rules recap (enforced, not suggested)

- Destructive SQL (Bash AND Supabase MCP), `.env` reads, force-pushes, lane-pushes-to-main: **hook-blocked**.
- Every edit is auto-formatted + typechecked by the PostToolUse hook.
- DB is shared with production: additive-only, appended to cross-cutting.md first.
- One lane = one port (numbers live in `.claude/rules/parallel-work.md` only); live engine
  :8788 claimed in `agent-memory/cross-cutting.md`, released when done.
- Nothing is "done" without /verify-app evidence; nothing reaches main except through /ship.
