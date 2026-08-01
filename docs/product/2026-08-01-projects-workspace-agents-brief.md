# Founder brief — Projects · Workspace · Agents (2026-08-01)

> STATUS: founder brief, ACCEPTED as the next chapter's starting point. Not yet a spec — the
> brainstorm → spec → plan cycle still owes one spec per feature. Sequencing and lane
> assignment were still open when this was filed. Supervisor's technical read is in a clearly
> separated section at the bottom; **the founder's words above it are the authority** — where
> the two disagree, the brief wins until the founder says otherwise.

Three related but distinct additions. They form a tiered model: **Projects** (breadth, general
Q&A), **Workspace** (depth, single-idea deep dive), **Agents** (automation, personal AI workers
assignable to either).

---

## 1. Projects

**What it is:** A container/folder for organizing chats around a topic, with persistent shared
context. Functionally it's the same chat experience as a standalone chat — the value-add is
organization and accumulating context, not new chat capability.

**Structure:**
- A Project has a name (e.g. "Mergers & Acquisitions")
- A Project has a **context layer**: free-form background info the user adds manually (notes,
  industry focus, whatever is relevant). This is not auto-generated — the user populates it.
- A Project has a **backlog of chats**: every conversation started inside the project is saved
  there, browsable, and revisitable.

**User flow:**
1. User creates a Project and optionally adds context (e.g. "industries most active in M&A
   right now: X, Y, Z")
2. User asks a question in a new chat inside the project: *"Which companies talked about M&A
   last quarter?"*
3. Atlas searches the transcript database and answers, informed by the project's context
4. User returns days/weeks later, asks more questions in the same project — context and chat
   history keep stacking, improving future answers within that scope

**Key behaviors:**
- Chats within a project are scoped/searchable to that project's backlog
- Context added to a project should be retrievable/injectable into every new chat within that
  project (RAG-style or direct context injection — implementation detail to decide based on
  existing Atlas architecture)
- No document generation, no file pulling — this is pure Q&A over the existing transcript/data
  layer plus user-supplied context

---

## 2. Workspace

**What it is:** A dedicated page (not a chat) for deep-diving into a single company or
investment thesis. Analogous to a GitHub repo: it accumulates its own files, context, and a
working document over the life of the investigation.

**User flow:**
1. User opens a new Workspace and tells Atlas what to pull (company, report types, date ranges)
2. Atlas connects to the Maya (TASE) API — via Claude's Agent SDK — and retrieves matching
   documents, PDFs, reports
3. Atlas presents the pulled materials to the user inside the workspace
4. A **left-side panel** lets the user chat with Atlas about the material, scoped to this
   workspace only (monitor progress, ask questions, request analysis)
5. The user builds a **working document** over time — inserting notes, analysis, and findings
   as they read through the pulled materials and interact with Atlas
6. End state: a polished document the analyst can hand to their hedge fund manager

**Key behaviors:**
- Workspace-scoped chat is separate from Project chat and separate from the general Ask Atlas
  experience — it should only reference this workspace's pulled materials and accumulated context
- The working document is the core deliverable and must support incremental editing over
  multiple sessions (not a one-shot generation)
- Existing Atlas UI patterns apply: this connects to the existing multi-view layout work
  (Transcript + Slides + Report panels), so Workspace may reuse those surfaces rather than
  being built from scratch

**Distinction from Projects:** Projects = broad, exploratory, low-commitment Q&A. Workspace =
the user already has conviction on a specific idea and wants to build it out into a formal output.

---

## 3. Agents

**What it is:** A page where users create personal, purpose-built AI agents using Claude's Agent
SDK, for tasks they define themselves. Aimed at letting domain experts (not engineers) automate
their own workflows.

**Primary use cases:**
- An agent that listens to a **live investor call** and takes notes in real time
- An agent that works inside a **Workspace**, reading documents/PDFs/reports and generating
  notes/analysis — potentially synthesizing across multiple companies into one detailed
  document for a hedge fund manager

**Page structure:** list/search view of the user's existing agents · "create new agent" flow

**Create-agent flow:**
- **Name**
- **Description** — what the agent needs to do and what its goal is. More context produces
  better agent behavior (communicate this in the UI, e.g. a hint or placeholder encouraging detail).
- **Assignment** — bind the agent to one of: a specific Workspace · a specific company · a
  specific investor call (including future/scheduled calls, e.g. "next week's call")

**Key behaviors:**
- Agents are persistent, reusable entities — not one-off prompts
- Assignment target determines what data/context the agent has access to and acts on
- Supports both real-time (live call) and asynchronous (document analysis) execution modes

---

## How the three fit together

| | Projects | Workspace | Agents |
|---|---|---|---|
| Nature | Organized chat + shared context | Dedicated single-idea workbench | Personal automation, assignable to targets |
| Scope | Broad, topic-level | Deep, single company/thesis | Task-level, user-defined |
| Output | Conversational answers | A produced document | Notes/analysis feeding into workspace or standalone |
| User intent | "Let me ask things about X over time" | "I have a lead, let me dig in and produce a deliverable" | "Let me automate a recurring task" |

Agents can be assigned into a Workspace (feeding its working document) or operate independently
against a company/call — they're the automation layer that plugs into the other two.

---
---

# Supervisor technical read (2026-08-01) — NOT founder words

Grounded in the code at `b2e9f8a`. Recorded so the brainstorm starts from facts, not guesses.

## The load-bearing finding: Atlas cannot search across the archive

`src/lib/chat/getChatContext()` loads **exactly one transcript** — the specific call, else the
company's latest, else (global `/chat` only) the single most recent completed transcript —
capped at 40,000 characters, stuffed into the prompt. There is no vector DB and no cross-call
search. `CLAUDE.md` records "context-stuffing, no vector DB" as a deliberate choice.

The brief's own Projects example — *"Which companies talked about M&A last quarter?"* — is a
question over **all 60 transcripts**. Today's chat cannot answer it and would not fail loudly;
it would answer confidently from whichever single transcript it happened to load. That is the
silent-degradation defect class already recorded in `.claude/rules/app.md`.

**So cross-archive retrieval is not a Projects sub-task — it is a foundation all three features
sit on.** Workspace's scoped chat and the Agents' document synthesis both need the same
machinery. It should be specced once, on its own, and it is the largest hidden item in this brief.

## Dependency structure (corrects an earlier supervisor assumption)

These three are **siblings, not a hierarchy**. There is no tenancy tree — a Project does not
contain Workspaces, and Agents bind to Workspace / company / call, never to a Project. The only
hard dependency in the brief is **Agents → Workspace** (an agent can be assigned to a Workspace,
so Workspace must exist first). Projects is independent of both and can ship at any time.

## Rough sizing

- **Projects** — smallest by far *except* for retrieval. `chat_conversations` already exists
  (15 live rows, read path `src/lib/db/conversations.ts`); a project is a table, a foreign key,
  and injecting user-written context into the existing context block. The user-written context
  layer is small enough for direct injection — it does not need RAG. The *archive search* does.
- **Workspace** — three hard things wearing one name: (a) the Maya/TASE integration, an external
  data source Atlas has never touched, needing its own research spike before it can be estimated
  (auth, rate limits, document formats, Hebrew handling, terms of use); (b) a persistent,
  incrementally-editable **working document** — a real editor with autosave and revision
  behaviour, not a generated blob; (c) workspace-scoped chat, which is the retrieval layer again.
- **Agents** — an execution runtime, the largest of the three. The live-call agent runs attached
  to a 2-hour call, on a live engine with two known unfixed limits (`.claude/rules/live.md`): a
  ws close permanently ends the session with no reconnect, and PCM accumulates unbounded in
  memory (~230MB per 2h). Async document agents need a job queue, retries, cost control, and a
  visible failure surface. "One agent that works end to end" is the honest first target.

## Prerequisite — half moved, 2026-08-01

**Pages ARE gated now** (`src/middleware.ts`, same day this brief was filed): `/app/*` and
`/print/*` redirect anonymous visitors to the login page. `/print/[id]` had been serving whole
transcripts to anyone with the URL.

**But API auth is not verification-strength**, which is the part that actually blocks these
backends. `getRequestUserId`, `getCurrentUser` and `requireAdmin` resolve the user with
`getSession()`, which reads it out of the cookie with no signature check — so a forged cookie
passes, and the routes then query with the service-role client, bypassing RLS. All three
features here are per-user data behind RLS, and RLS is worth nothing if the user id is
attacker-supplied. Switching those call sites to `getUser()` is the top security item
(`.claude/rules/app.md`, and item 0 of `docs/V1-SECURITY-AND-LAUNCH-NOTES.md`). **There are FIVE
of them, not the three this brief said until 2026-08-02** — the two missed sites are
`api/transcripts/[id]/route.ts` :92 + :136, the PUT edit-rights check `docs/DATA-MODEL.md` calls
load-bearing. Three routes
still have no auth at all: `PATCH …/speakers`, `PATCH …/diarization`, `POST /api/live/finish`.

## Open questions for the brainstorm

1. **Maya API** — does it offer a documented API with credentials, or would Atlas be scraping a
   portal? This single answer swings the Workspace estimate more than anything else in the brief.
   Also: why the Agent SDK for retrieval? Pulling documents from a known API is a plain
   integration; the SDK earns its place when something must *navigate or decide*.
2. **Retrieval design** — vector DB (new infrastructure, ongoing cost, embedding pipeline over
   60+ growing transcripts) vs. structured pre-filter + targeted stuffing (cheaper, no new
   infrastructure, weaker on fuzzy questions). This is a real architectural fork.
3. **Working-document format** — plain rich text, or structured blocks with citations back into
   the source PDFs/calls? Citation-carrying is much more valuable for an analyst handing work to
   a manager, and much harder to retrofit later.
4. **Agent execution model** — where does an agent actually run when the user's browser is
   closed? Atlas has never been deployed; there is no server that stays up and no CI. A live-call
   agent implies infrastructure that does not exist yet.
