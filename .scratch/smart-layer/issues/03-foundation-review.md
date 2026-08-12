# Foundation review — is the ground safe to build on?

Type: task
Status: resolved

## Question

A scoped review of only the pieces the smart layer will sit on: the two chat backends
(`/api/chat`, `/api/workspaces/[id]/chat`), auth on those routes, transcript / workspace /
document storage, the citation-anchor machinery (`workspace_doc_blocks`), and the seams
named in `foundations.md`. Output: what is sound to build on, what must be fixed first
(each with severity), and nothing else — this is NOT a general audit (ruled out of scope on
the map). Findings that demand fixes become facts the architecture ticket (08) plans around.

## Answer

Resolved 2026-08-12 by four parallel read-only reviews, one per slice. Full evidence with
file:line for every claim: [`research/03-foundation-review.md`](../research/03-foundation-review.md).
Severity: **BLOCKER** = cannot safely build until fixed · **MAJOR** = ticket 08 must plan
around it explicitly · **MINOR** = fix opportunistically.

**Verdict: the ground is sound to build on, provided the smart layer copies the RIGHT
templates and treats five findings as design inputs, not code to inherit.**

### Sound — the templates to copy

1. **Auth primitives** — `getRequestUserId` + `unauthorized()`, `getUser()`-only validation,
   the boundary test with its capped allowlist. Copy for every new route. Known limit: the
   test cannot see auth-before-work *ordering* and does not check post-auth *authorization*.
2. **Ownership schema template** — migrations `20260802_015` / `20260803_016` / `017`: FK to
   `auth.users`, RLS both sides `to authenticated`, `user_id` index, composite `(id, user_id)`
   child FKs (RI checks bypass RLS). New `agents` / `agent_runs` / memory tables copy this,
   never the five FK-less tables; `chat_conversations` can never gain an FK.
3. **Client-choice pattern** — user client + RLS load-bearing (`projects.ts`/`workspaces.ts`),
   not `supabaseAdmin` + app filter. The workspace chat route is this pattern end-to-end.
4. **`document_embeddings` conflicts with nothing** — shared-corpus RLS shape is live and
   correct to copy verbatim (`20260714_012` / `20260801_014`). `transcripts.id` is TEXT.
5. **The honesty machinery in workspace chat** (`truncated[]`/`omitted[]`/`unreadable`,
   visible no-answer path, correct hedging) is closed on every dropping path found — this and
   `/api/chat`'s three-state `x-project-context` are the degradation patterns to generalize.
6. **The anchor quartet + visibly-broken rendering** (`workspace_doc_blocks`) — the
   best-constrained tables in the repo. Inherit the *shape*.

### Must fix first

- **[BLOCKER · citations law] The anchor machinery trusts the writer.** Nothing verifies an
  anchor at write time (a fabricated `L0099` renders as an intact citation); drift detection
  (`citationState()`) is built, tested, and wired to nothing; a cited quote's `body` is
  editable away from its snapshot; line ids renumber on re-processing; and the "minute"
  coordinate doesn't exist (line timestamps hardcoded `00:00:00`; `word_segments` cover 4/56
  calls, unjoined). Anchors are also personal-layer (workspace item), not corpus-level. The
  smart layer's citations are model-generated, so 08 must design the verify-at-write choke
  point (M3), a resolution primitive, a corpus-level anchor, and real timestamps — built new.
- **[BLOCKER · before tools] Prompt-injection fencing is incomplete where it exists and
  absent where it doesn't.** `/api/chat` concatenates transcripts, client-supplied
  `liveContext`, and PDF text into the SYSTEM prompt unfenced; workspace chat defangs window
  bodies but leaves titles and window labels (document-controlled text) raw on the fence
  line. Bounded today (no tools); must be closed before any prompt gains tools.
- **[BLOCKER · history quality] `/api/chat` poisons stored conversations today.** Mid-stream
  provider failure closes the stream cleanly so partial answers persist marked complete, and
  the Hebrew "couldn't answer" sentinel streams as success text and is saved as a real
  answer. The rewrite kills the class, but memory/retrieval design must treat pre-rewrite
  stored threads as suspect data.
- **[MAJOR · live defect, founder decision needed] Speaker-edit authorization is missing:**
  any signed-in user can rewrite any transcript's diarization, and the speakers path rewrites
  *other users'* saved quotes with attacker-chosen text. Corpus curation (admin gate) or
  personal write (owner check)? → ticket 12. Fix in a normal session, before any smart-layer
  route copies these routes.
- **[MAJOR · retrieval design] The failure mechanism behind "unable to pull required
  documents" is named:** fairness spends budget on score-zero files with no threshold; terms
  come from the last message only (follow-ups score ~everything 0); the `length > 2` filter
  drops "Q3"; prefix-stripping strips one letter only. Query rewriting and selection policy
  are part of the retrieval design (07/08) — embeddings alone don't fix it.
- **[MAJOR · seam scope] "Swap step 2" is real but is not the vector work.** The scorer
  boundary (`terms()`/`scoreWindow()`, ordinal consumption) is clean, but the architecture is
  load-everything-then-rank: stable chunk identities and a persistence layer don't exist, and
  the planner is synchronous. 08 scopes vectors as a new retrieval subsystem, not a swap.
- **[MAJOR · agents' thread model] `workspace_threads` is whole-jsonb, last-writer-wins, no
  version token; any server-side writer (an agent) races the client's whole-array PUT. Agent
  runs/memory need append-only child rows or CAS before any server-authored turn exists.
- **MINOR items** (dead `buildContext` still claiming to be the seam, duplicated
  `FENCE`/`defang`, full-transcript logging, `x-chat-fallback` unread, silent 40k cut of
  `/api/chat` context, and more) are enumerated in the full report.

### Also delivered

The `/api/chat` rewrite contract — the exact wire format, headers, request shape, persistence
back-compat rules, and the two client components that must move with any change — is
enumerated in the full report's "Constraints on the rewrite" section for ticket 08.
