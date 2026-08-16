# Agents V1 — the thin Managed Agents wrapper

Status: **APPROVED — BUILDING. Plan 1 (foundations) shipped.** Supersedes tickets 10, 11, 12, 14
outright, and ticket 13 in part (scheduling is IN, §4.1; the Note Taker is not). Every ruling this
spec was waiting on is filed in `DECISIONS.md` (2026-08-16): the slice itself replacing 10–14,
memory at Anthropic, the $1.00 run cap, scheduling back in, "bring agent to life" plus assignment-
as-context, agents as scoped work rather than market-wide research, and the real cascading delete
taken at migration 032's own review gate. **Plan 1 landed against it** — SDK bump + run budget,
the mechanism smoke check, migration `20260816_032_agents.sql` applied to production and verified,
and the owner-scoped data layer. **Nothing user-visible ships yet:** no agent can be created or
run — that is Plan 2 (create flow + run engine) and Plan 3.
Branch: `claude/new-worktree-setup-35b4ef`
Decided with the founder: 2026-08-16 (brainstorm session).

**What this is.** The last slice of Atlas V1. A user creates an agent on the Agents page —
name, context, mission, an assignment — and the agent goes and does it, using the web, our
transcripts, MAYA, and its own file sandbox. Afterwards the user opens the agent and talks
to it. That is the whole feature.

**What this replaces.** Tickets 10–14 designed a five-slice agent platform: findings with
verify-at-write citations, agent memory in Supabase, two-fidelity chat, a live reflection
ticker, a Note Taker with scheduled crons, and per-fund cost accounting with a $100 alert.
The founder's call (2026-08-16): *"Tickets 10-14 are too complex for a v1 -> we only need to
do this and we are done with atlas v1 officialy."* Those tickets are superseded, not paused.

---

## 0 · Five calls made for you — veto any of them in review

**(a) Findings still go through a tool that demands a source.** You said a run's output can be
"just a report, excel, maybe even just text — whatever is most suitable", and files honour
that. But I kept one narrow mechanism: when the agent states a concrete claim ("margin
narrowed to 3.7%"), it records it through `report_finding(text, source)`, and the tool
**refuses a finding with no source**. Cost to build: one handler, one small table. What it
buys: an Atlas agent cannot put a fabricated number on screen with no traceable origin. This
is the one place I pushed back, because `rules/app.md`'s whole UI-truthfulness section exists
for that failure. Free-form prose and files are unaffected — this only governs the findings
list the dock already draws.

**(b) ~~The "Scheduled agents" panel is hidden in V1.~~ REVERSED by the founder, 2026-08-16 —
scheduling is IN.** His words: *"scheduling an agent should be very easy for us since anthropic
has this already ready right? I want us to incroprate this into this version."* Correct: the
cron, timezone, DST, jitter, retries and pause/resume are Anthropic's. The panel is real, not
hidden. Mechanism in §4.1. What stays out is the **Note Taker**, which is a different thing —
notes after a call are *event*-triggered, not scheduled, and fire off the transcript-polish
pipeline rather than a clock.

**(c) ~~The "Bring agent to life" confirm step is gone.~~ REVERSED by the founder,
2026-08-16 — it is IN.** His words: *"the bring agent to life is important so lets do that it
will work now!"* The ticket-06 flow stands: create → the agent introduces its plan and its
goal in Hebrew, human vibes → asks the user to confirm → and only then does it start. Beyond
the charm it earns its place mechanically: it is the user's last chance to catch a misread
mission before a dollar is spent. Flow in §2.1.

**(d) Assignment is optional, and it is CONTEXT — with one exception that is not.** Founder,
2026-08-16: *"a user will be able to assign the agent to a company or sector just to give him
a more 'personalized experience, a more context focused environment'. Maybe for the backend
this wont make a real change, just more context."* Right for Company and Sector, and the
exception matters — §2.2.

**(e) The brain is `claude-sonnet-5`, at high effort.** Your ONE BRAIN decision (2026-08-12)
and ticket 08 round 1 both name Sonnet 5 as the default everywhere. Opus 5 is measurably
stronger on exactly this kind of long-horizon agentic work and is a one-word change if a run
comes back thin — but it costs more per run, so it is a lever, not the default.

---

## 1 · The shape

Three moving parts.

**The agent** — a row we own: name, the context and mission the user typed, an assignment
(Company / Sector / Call / Workspace / Report — the picker already in `CreateAgent.tsx`), and
an owner. Creating it also creates, once, at Anthropic: **one agent object** (its system
prompt, tools and skills) and **one memory store** (its notebook).

**A run** — one job. Creating an agent starts its first run immediately (§0c); the card menu
can start another later. A run is one Managed Agents session, with the memory store attached.
Each run is its own record: findings, files, cost, and how it ended.

**A conversation** — the user asking that agent questions. Also a Managed Agents session with
the same memory store and the same tools attached, so a follow-up isn't answered from a
summary — the agent is back in its workspace and can go re-check MAYA or search again while
answering.

### Where memory lives — a reversal, filed deliberately

Founder call, 2026-08-16: *"i want the agent's memory to be on anthropic managed agents and
not inside our database."*

This reverses spec §2.8, which said memory-of-record lives in Supabase and the Anthropic-side
store is deleted the moment a run completes — "nothing of a fund's research accumulates
outside our DB". That sentence was the stated mitigation for the server-side-retention
tradeoff accepted at ticket 06 Q12. Removing it means a fund's accumulated research notes
live at Anthropic indefinitely. Named here because it is a procurement answer owed to an
institutional client, not because it is wrong.

The split that results:

| Lives at Anthropic | Lives in Supabase |
| --- | --- |
| What the agent **knows** — the memory store it reads and writes across runs | The agent row: name, mission, assignment, **owner** |
| The running session and its sandbox | Run records: status, findings, cost, how it ended |
| | Files the agent produced (Storage) |
| | Conversation turns, for rendering |

The Supabase side is not memory. It is the three things the page cannot render, and
ownership cannot be enforced, without: who owns this, what happened, and what came out.

---

## 2 · The four capabilities

| Capability | Source | Notes |
| --- | --- | --- |
| Search the web | Anthropic built-in (`web_search`) | Free. Results never reach our servers. |
| Read a page it found | Anthropic built-in (`web_fetch`) | Free. Added so a search hit can actually be read, not skimmed from a snippet. |
| Create files — Excel, Word, PDF, decks | Anthropic built-in (`write`, `bash`) + Anthropic's `xlsx` / `docx` / `pdf` / `pptx` skills | Agent writes to `/mnt/session/outputs/`; we download at run end into Supabase Storage. |
| Pull documents from MAYA | **Ours** — custom tool | Reuses `lib/maya/disclosures.ts`. |
| Read our transcripts | **Ours** — custom tool | Reuses the retrieval behind `lib/chat2/tools.ts`. |
| Record a finding | **Ours** — custom tool | Refuses a finding with no source (§0a). |

**How a custom tool works, and why it is the security design.** The agent emits
`agent.custom_tool_use`; its session goes idle; our server executes the call with our own
credentials and sends back `user.custom_tool_result`. No credential, no database connection
and no service-role key ever enters Anthropic's sandbox. The agent can only *ask*.

**Identity is never model-supplied.** `userId` and `agentId` come from the run row through the
handler's closure, exactly as `lib/chat2/tools.ts` does it. `companyId` may be model-set on
the two read tools, and that is safe here for one reason only: both read the **shared
corpus**, which every authenticated member may read in full (`docs/DATA-MODEL.md`), so
choosing a company selects a subset of what the caller could already see. The moment a tool
reaches a personal table that argument evaporates.

**Every tool result is fenced.** Corpus text, filing titles, and anything the agent quotes
ride through `lib/chat2/fence.ts` with titles defanged. Instructions never share a channel
with quoted material — the standing prompt-injection posture (spec §2.9), which matters more
here than in chat because this agent has `web_search` and a filesystem.

**Retrieval constraint, inherited and unfixed — and why it does not govern this slice.**
Founder, 2026-08-16: *"Agents are not built for market wide reaserch like the chat search
funtion for now. they are built for specific tasks with known context, of companies etc etc.
So this wont hurt us?"* Correct, and the reason is that the RED is specific to the **unscoped**
channel: at the real corpus size dense MRR roughly halved unscoped (0.254 → 0.131) and the
scan itself hits the ~8.6s statement timeout, while **company-scoped works** (0.268 → 0.195).
An agent pointed at a company or a sector rides the scoped channel by construction, so the
broken path is one it was never going to walk.

**The residual, and why V1 survives it.** Scoped retrieval is still ~27% down on its own
baseline, so an agent can miss a passage that genuinely exists. What makes that tolerable is
the *shape* of the failure, which is the property the founder accepted the deferral on
(DECISIONS 2026-08-14): it is **finding-less, not lying** — a citation that surfaces is real.
With §0a (no finding without a source) and `found_nothing` as an honest outcome (§5), the
worst case is an agent reporting three things where four existed, never inventing a fourth.

**Therefore: the unscoped query is UNREPRESENTABLE at the tool, not merely discouraged.** The
transcript tool's schema *requires* a company or a list of companies. Nothing stops a user
typing "scan the whole market for X" into the mission box, and a tool that merely preferred a
scope would let the agent issue the one query shape that hangs and dies — surfacing to the
user as a mystery stall. Required scope turns that into a limit the agent is *told*: it gets
back "search within companies, here is how to pick them" and adapts. `rules/app.md` M3.3 —
make the lying state unrepresentable rather than guarded.

A Sector agent therefore fans out over that sector's companies as N scoped queries, never one
unscoped one. **Its realistic reach is bounded by the $1.00 cap, not by retrieval** — a
40-company sector will hit `budget_reached` before it exhausts the sector, and §5 requires
that to be said on screen rather than presented as a finished sweep.

A dedicated parallel session owns the real retrieval fix; nothing here waits on it.

### 2.1 "Bring agent to life"

Founder call 2026-08-16, reversing §0c and restoring the ticket-06 flow he approved on
2026-08-12: *"after the user gives him a name, description and the option to assign him to a
sectior or company or both, than he will click on 'Bring agent to life' than the agent will
say hey and introduce the plan and his goal (human vibes) than he will ask the user to
confirm. and if he does great than we have an agent!"*

1. The user fills the form and presses **Bring agent to life**. Nothing is written yet.
2. **One Messages call** — not a Managed Agents session, which would be wasteful for a single
   reply. Copy the client shape already proven in `src/lib/chat2/`; do not stand up a second
   Messages client. The agent reads its own name, context, mission and assignment and answers
   in Hebrew: hello, here is what I understand you want, here is how I mean to go about it,
   shall I? Cost ~$0.01.
3. **Confirm** creates everything, in this order: the `agents` row → the Anthropic agent
   object → its memory store → its deployment if scheduled (§4.1) → run 1. The intro is
   stored as the agent's first chat message, so the dock opens on it rather than on nothing.
4. **Edit instead of confirm** re-runs step 2 against the amended form. Nothing persists until
   a confirm.

**If the intro call fails, the create flow says so and creates nothing.** It must not fall
through to an armed agent, and it must not show a canned Hebrew sentence dressed as the
agent's own words — that is the fabricated-fourth-state failure `rules/app.md` names. Two
honest outcomes only: an intro, or a stated failure with a retry.

The intro is a Hebrew line carrying Latin runs — company names, tickers, "TASE". The bidi law
applies at full strength: a `<bdi>` per run with `dir` on the container, verified rendered in
both locales, not read off the source.

### 2.2 What an assignment actually does

The founder's read is correct for the two kinds he named, and there is one kind where it is
not — worth stating because the difference is a security boundary, not a preference.

**Company and Sector — context, plus a soft default.** These name the *shared corpus*, which
every authenticated member may read in full (`docs/DATA-MODEL.md`). So the assignment does two
things: it goes into the system prompt as identity ("you follow Tigbur, a shipping issuer on
TASE"), and it seeds the **default** `companyId` on the two read tools. The agent may still
name a different company — exactly as `lib/chat2/tools.ts` already permits — because choosing
a company selects a subset of what the caller could already see. That is a scoping choice, not
an access one.

The default is not cosmetic, and this is the wrinkle in "no real change for the backend":
**unscoped market-wide search does not complete today** (§2, RED — a statement timeout, a hard
failure rather than a slow one). An assignment that only decorated the prompt would leave the
agent free to issue the one query shape that is currently broken. Seeding the scope keeps it
on the healthy channel. A Sector seeds the *list* of that sector's companies and the agent
works through them.

**Workspace and Report — an access boundary, not context.** These name the **personal** layer:
one fund's own documents. Here the id must come from the agent row through the handler's
closure and never from the model, because the shared-corpus argument above evaporates the
moment a tool reaches a personal table. `read_workspace` goes through the owner's
RLS-bearing client, never `supabaseAdmin`. Same law as chat2, restated because this is the
easy place to get it wrong while thinking of assignment as "just more context".

**No assignment at all** stays valid (§0d): the agent works from its mission text and can
resolve a company itself through `resolve_company`.

---

## 3 · Data model

Four new tables. Every one gets all four things `rules/db.md` requires at `CREATE TABLE` —
the real FK to `auth.users(id) ON DELETE CASCADE`, RLS enabled, an owner-scoped policy with
**both** `USING` and `WITH CHECK` granted to `authenticated`, and an index on `user_id`. They
copy `projects.ts` / `workspaces.ts` — user client with RLS load-bearing — not the
`supabaseAdmin` + app-filter shape. The run driver is the one exception and states it per
module, owner-filtering every query.

| Table | Holds |
| --- | --- |
| `agents` | name, context, mission, assignment (kind + target id + label), `anthropic_agent_id`, `anthropic_memory_store_id`, owner, status — plus the schedule (§4.1): cadence, `anthropic_deployment_id`, `next_run_at`, paused |
| `agent_runs` | agent, owner, status, `anthropic_session_id`, `trigger` (`manual` \| `scheduled`), started/ended, `list_cost_cents`, `outcome` (see §5) |
| `agent_findings` | run, agent, owner, text, source (required, non-empty), created_at |
| `agent_run_files` | run, owner, storage path, filename, bytes, mime |

Conversation turns reuse the existing `chat_conversations` / messages shape rather than
inventing a fifth table — the dock renders them the same way every other chat surface does.

**The DDL gate is not optional** (`rules/db.md`). Write the migration files → push the branch
→ run `atlas-reviewer` **on the files** → append to `COLLISIONS.md` → tell the founder →
*then* apply. Applying first is the one thing this database cannot take back, and it has gone
wrong twice already (20260801_014, and migration 029).

---

## 4 · How a run is actually driven

This is the one genuinely non-trivial engineering piece, and it is not a wrapper freebie.

A custom tool means the run **stops and waits for us**. If nothing is listening, the run sits
idle forever. So a run needs a driver:

1. `POST /api/agents/[id]/runs` creates the run row, creates the session (agent object +
   environment + memory store + budget), and starts a **long-lived async driver** in the Node
   process. Railway runs a real container, not a serverless function, so this is allowed.
2. The driver opens the SSE stream **before** sending the kickoff message — the documented
   ordering; stream-after-send loses the early events.
3. It answers every `agent.custom_tool_use`, persists findings as they are reported, and
   stops on `session.status_terminated`, or on `session.status_idle` with a `stop_reason`
   that is not `requires_action`.
4. At the end it downloads the session's output files into Supabase Storage, records the
   cost, deletes the Anthropic session (**not** the memory store — that persists by design
   now), and writes the run's outcome.
5. The dock polls the run row and its findings. No live reflection ticker — that was ticket
   12 and is dropped.

**Restart tolerance.** If the process restarts mid-run, the run row stays `running` with
nobody listening. Recovery: on server boot, and whenever an agent is opened, any `running`
run is re-attached — open the stream, then read `events.list`, dedupe by event id, continue.
That is the documented lossless-reconnect pattern. A run that has been waiting with no driver
past a threshold is marked degraded **on screen**, not silently retried.

### 4.1 Scheduled runs

Founder call 2026-08-16, reversing §0b. **Anthropic owns the clock; we own the attaching.**

A scheduled agent gets one Managed Agents **deployment**: agent + environment + memory store +
budget + the kickoff message + a cron expression and a timezone. Anthropic fires it, creating
a session on its own, and writes a `deployment_run` record per firing — success or failure.
Timezone handling, DST, jitter, retry semantics, pause/unpause and a manual "run now" all come
with it. That is the part we would otherwise have written badly.

**Why a webhook is not needed, and was declined.** Anthropic can POST to us the instant a run
starts. That would mean a public unauthenticated endpoint on the live site, a new signing
secret, HMAC verification, a manual registration step in Anthropic's console, and an entry in
`apiAuthBoundary.test.ts`'s `PUBLIC` allowlist (capped at 8, each needing a stated reason) —
and because deliveries are best-effort (three attempts, then dropped with no signal), we would
*still* need a periodic reconcile. Founder chose the simpler shape: **the reconcile IS the
mechanism.**

So the same minute-by-minute sweep that §4 already needs for restart recovery does double
duty: it lists recent `deployment_runs`, finds sessions Anthropic started that have no run row
or no driver, creates the run row, and attaches the driver. A scheduled run therefore starts
up to about a minute late; the session idles until then and **idle time is unbilled**.

**Schedule state lives on our `agents` row** (cadence, timezone, next fire, paused) so the
panel renders without calling Anthropic, and `anthropic_deployment_id` links the two. Timezone
is Israel — the founder's 2026-08-09 ruling that Atlas renders Israel time for every viewer —
so the deployment carries `timezone: "Asia/Jerusalem"` and every wall-clock string the panel
shows comes from `src/lib/i18n/format.ts`, the only file allowed to name a zone.

**Three deployment facts to design against, not discover:**

- **Firing is jittered** — up to 15% of the interval, capped at 9 minutes. The panel must not
  promise a to-the-minute time. Show the cadence ("weekly, Sunday morning"), not "08:00:00".
- **DST is literal wall-clock**: a time that does not exist on a spring-forward day is
  **skipped**; a time that occurs twice on a fall-back day **fires twice**. Anthropic's docs
  say to schedule outside 01:00–03:00 local. We restrict the picker to safe hours rather than
  letting a user choose 02:00 and silently lose a run twice a year.
- **Archiving is terminal and cascades.** Archiving an Atlas agent must archive its deployment
  deliberately; archiving the Anthropic agent auto-archives the deployment, with no unarchive
  anywhere. See §9.5.

---

## 5 · What the screen is allowed to say

`rules/app.md`: degradation must be visible, and no fabricated fourth state. Every run ends in
exactly one honest outcome, decided in **one function**, not per branch:

| Outcome | What the user sees |
| --- | --- |
| `completed` | Findings, files, and the agent's report |
| `found_nothing` | "Found nothing new" — a real result, stated plainly, never dressed as success |
| `budget_reached` | Stopped because it hit its spending cap, with whatever it had got to, marked partial |
| `failed` | It failed, and why, in both locales — never a partial answer presented as whole |
| `stalled` | Waiting on a driver that never came back (§4) — visible, not retried in silence |
| `never_started` | A **scheduled** firing Anthropic could not turn into a session at all — its `deployment_run` carries an `error.type` (rate-limited, archived environment, service unavailable). The agent's card must say the run did not happen. A schedule that silently stops firing is the worst version of this feature. |

`found_nothing` was your own call at ticket 06 Q7: *"every run leaves a visible record
including 'found nothing'."* It survives this simplification.

**Bidi applies to every new string.** Hebrew end to end; a line mixing Hebrew and Latin gets a
`<bdi>` per run with `dir` on the container. This is the repo's most-repeated defect — eight
occurrences, every one green through typecheck and tests. Both locales, rendered, in a
browser.

**Every state above gets driven in a browser before merge**, enumerated in the evidence table
per `/verify-app` step 8b, and re-checked at merge per 8c, because a drive expires when the
code under it changes.

---

## 6 · Cost

`$1.00` hard cap per run — founder-approved 2026-08-16, and the same figure ticket 10 carried.
Set as the session's native `budget`, which Anthropic enforces as a pre-request gate: the
agent paces itself against it and stops. Typical run ~`$0.50`.

**Open risk:** `budget` / `max_list_cost` are **not typed in the installed SDK (0.102.0)**,
verified by inspection. The feature is real server-side; our client is too old to express it.
Step 0 of the plan bumps `@anthropic-ai/sdk` and verifies the types exist — a shared
dependency on a live product, so `/api/chat/v2` is re-tested in the same step. If the bump
cannot land, the fallback is our own accounting on the run row, which is a **softer** cap, and
the founder is told before that ships.

There is no per-fund monthly view and no $100 alert. That was ticket 14 and is dropped;
`agent_runs.list_cost_cents` keeps the raw material for it.

---

## 7 · Security laws this inherits

- Every new route: `getRequestUserId` + `unauthorized()`. `apiAuthBoundary.test.ts` scans it.
- Post-auth **authorization** is the part no test sees: a non-owner must not reach another
  fund's agent, run, finding or file. Explicit tests.
- New tables use the user client + RLS (§3). The run driver, which cannot carry a user
  session, states its use of the service role per module and owner-filters every query.
- No shared fallback identity. `DEMO_USER_ID` stays deleted.
- Every route gaining auth changes its callers' **error** paths, not just the happy path — a
  401 in the dock sends the user to sign in, it does not render "agent unavailable" forever.
- Files are private and mutable → served `no-store`.

---

## 8 · Deliberately not built

Two-fidelity chat as a separate system (the dock's existing widen/dock is enough) · the live
reflection ticker · the **Note Taker** and every other event-triggered run (scheduling is in,
§4.1; firing off a finished transcript is not) · per-fund cost accounting and the $100 alert ·
verify-at-write citation drift rendering · agent memory in Supabase · free-play agents.

Worth knowing for later: the Note Taker becomes small once this ships. "Notes minutes after a
transcript lands" is the transcript-polish pipeline calling the same run path the Run button
already calls — no new machinery, just a trigger.

## 9 · Known risks, stated not smoothed

1. **Managed Agents is beta.** Accepted with eyes open at ticket 06 Q12; still true.
2. **The SDK bump (§6)** is the one thing that can change the shape of this slice.
3. **Railway's `ANTHROPIC_API_KEY` is unproven** (STATUS.md). On any agent failure in
   production, check for a 401 first.
4. **Retrieval is RED market-wide** (§2) — **closed for this slice, not open.** Agents are
   scoped work by founder intent, the tool refuses an unscoped query by schema, and the
   residual is finding-less rather than lying. The live edge is a Sector agent running out of
   budget before it runs out of companies, which §5 makes visible.
5. **Archive is permanent** on Anthropic agents, environments, memory stores **and
   deployments** — no unarchive anywhere. Archiving the Anthropic agent auto-archives its
   deployment, so a user "deleting" an Atlas agent silently ends its schedule forever.
   Deleting must be thought through, not wired to `archive()` reflexively. Pause is the
   reversible operation; archive is not.
6. **A schedule that stops firing is the quiet failure mode of §4.1.** Anthropic auto-pauses a
   deployment after a non-recoverable failure, and rate-limited firings do not retry — they
   just do not happen. The sweep must surface a paused-or-erroring deployment on the agent's
   card (§5 `never_started`), because nobody notices an agent that stopped waking up.
7. **Retention posture reversed** (§1) — filed in `DECISIONS.md` 2026-08-16, in his words.
