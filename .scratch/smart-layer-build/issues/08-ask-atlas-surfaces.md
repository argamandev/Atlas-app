# B2 · Ask Atlas surfaces

Status: in-progress — 08a done · 08b done · 08c SPLIT AGAIN: 08c-1 done · 08c-2 verified and
reviewed three rounds, MERGING · 08c-3 OPEN — and 08c-3 is what CLOSES this ticket
Blocked by: 07

Spec §2.3 + §6 B2. `TranscriptChatPanel` (live calls, transcripts, multiview) +
company-page chat onto the new backend: whole-call injection (6–18K), company scoping via
tools; retire the old `/api/chat` wire format (both callers updated in the same change).
Acceptance: `/verify-app` on live-call, transcript and company surfaces, both locales.
Cost: ≤ $0.06/answer; stuffed first turn ≤ $0.13.

## The split (founder decision, 2026-08-15)

Sized as one mission this slice is two surfaces + three refactors + `/verify-app` in both
locales + the cost measurements + ship; prior sessions on less have run to 374k and 650k
tokens. Split the same way B1 was split into 06/07, and for the same reason — **the browser
verification lands last, which is the worst place to run out of room**, because that is the
phase where skipping a locale is tempting.

**The ticket is NOT closed by 08a — and it is not closed by 08b either.** Its acceptance line is
the surfaces verified in both locales, and 08b verified only the two v2 can honour. A merged 08a
or 08b must not be read as a finished 08; **08c closes it.**

- **08a — plumbing. DONE** (slices 1–2; slice 3 moved to 08b, see below). Changes NO
  user-visible behaviour: the old route keeps serving every surface and `ChatView` behaves
  exactly as before. Verified by typecheck + the battery; `/verify-app` is deliberately not
  owed, because nothing a user can see moved.
- **08b — surfaces. DONE**, against a NARROWED scope the founder approved on 2026-08-15 when
  the sizing above turned out to be wrong a second time. See "what 08b actually cut" below.
- **08c — the remaining groundings.** What 08b could not honestly take. Still open.

These are SEQUENTIAL, not parallel worktrees — they touch the same files. 08a merges first;
08b branches clean off `main`.

### 08a slices, in order

1. **Domain types out of the transport module** — DONE, this commit. `ChatSnip`,
   `ChatSource`, `DocumentRef` → `lib/chat/grounding.ts`; the stored-message honesty helpers
   → `lib/chat/messageState.ts`. Eleven modules imported domain vocabulary from the old HTTP
   client, so 08b's "retire the wire format" would have dragged them; its blast radius is now
   `lib/api/chat.ts` + its two callers. Guarded by `chat/domainBoundary.test.ts`.
2. **One protocol module** — the `ChatEvent` union + incomplete codes are declared twice and
   enumerated four times (`chat2/loop.ts`, `chat2/terminal.ts`, `api/chat2.ts`,
   `chat/incompleteCopy.ts`), with a hand-maintained "kept in sync" list. Collapse to one
   module both sides import; `incompleteCopy` keys off an exhaustive `Record`, so a new code
   fails typecheck instead of rendering as `stopped_unknown`. Empties the one allowlist entry
   in `chat/domainBoundary.test.ts`.
3. **The `Grounding` union — MOVED TO 08b.** Planned as 08a's third slice; the law forbids
   it there, and the reason is worth more than the slice was.

   Spec §2.3 names exactly four recipes (blank · company · call · shelf); today they are
   eight optional fields across two request shapes, with the client holding a boolean for
   *which backend can honour which grounding*. The plan was to define the union and teach
   `/api/chat/v2` to accept it in 08a, leaving the surfaces for 08b.

   **`chat2/requestScope.test.ts` refuses that**, mechanically: *"every scope id the backend
   ACCEPTS is consumed by the backend"*, with `transcriptId` pinned by name as ticket 07's
   cold-review BLOCKER — it was uuid-gated onto the scope and read by nothing while the
   surface showed a chip promising that grounding. A `Grounding` union whose `call` variant
   the route accepts but no handler honours reproduces that defect exactly, one layer up.

   So the union lands **with the handler that reads it** — whole-call injection — which is
   08b's own work. 08b should define it FIRST and build the injection against it, rather
   than migrating the surfaces field-by-field and fitting a union afterwards.

   Shape to start from (not yet built, no code written for it):

   ```ts
   type Grounding =
     | { kind: 'none' }                        // Chat, blank → search mode
     | { kind: 'company'; companyId: string }  // @mention, or the company page
     | { kind: 'call'; transcriptId: string }  // live call / transcript → inject whole
     | { kind: 'shelf'; workspaceId: string }  // workspace chat
   ```

## What 08b actually cut, and why (founder, 2026-08-15)

**"Retire the old `/api/chat`, both callers onto v2" was sized wrong.** The old route does not
carry two groundings, it carries SIX, and v2 had code for one:

| Grounding | Surface | v2 before 08b | after |
| --- | --- | --- | --- |
| `companyId` | company page, `@mention` | ✅ | ✅ |
| `transcriptId` | `/app/chat?transcript=` | ❌ | ✅ **whole-call injection** |
| `liveContext` (captions) | live broadcast panel | ❌ | ❌ — 08c |
| `documentRef` (PDF pages) | multiview panel | ❌ | ❌ — 08c |
| `attachments` (snips) | multiview panel | ❌ | ❌ — 08c |
| `projectId` | project chats | ❌ | ❌ — 08c |

The law that decides this is the one `useV2` was built around: *a surface goes to v2 only when v2
can honour every grounding that surface displays.* `TranscriptChatPanel` displays a reference
block, snip thumbnails and a "connected to…" caption, so moving it wholesale would have meant
porting three more groundings — roughly three missions — with the both-locales verification landing
last, which is the exact failure the 08a/08b split was created to avoid.

**So 08b took the two surfaces v2 can fully honour** — `/app/chat?transcript=` and the company
page — and left the old route serving the other four, each named above. `useV2` is now one arm
(`!projectId`) instead of two.

### 08c owes — AND IS ITSELF SLICED THREE WAYS (founder, 2026-08-15)

Sized once more and once more wrongly: these are not one mission. Two of the three are ordinary
text groundings; the third needs the tool loop to carry IMAGE content blocks, which it never has.
Offered the three options, the founder took the smallest honest slice — **"Project grounding
only"** — so 08c runs as 08c-1 → 08c-2 → 08c-3, sequential, same reason 08a/08b were split.

1. **08c-1 — project-context injection. DONE.** `projectId` accepted, gated, injected, and
   `ChatView`'s `useV2` fork deleted. Branch `feat/smart-layer-b2c-project-grounding`; evidence in
   `docs/evidence/feat-smart-layer-b2c-project-grounding/verify-app.md`.
   **⚠ This ticket's own line "then delete the useV2 fork AND THE OLD ROUTE" was half-true and is
   corrected here.** The fork lived in `ChatView` and is gone. The ROUTE cannot die yet:
   `TranscriptChatPanel` still calls it directly for the two groundings below. A route dies when
   its LAST caller leaves, not when one does.
   **The design correction worth carrying forward:** a project is NOT a fifth `Grounding` recipe.
   The union answers *where the answer comes from*; a project answers *whose standing instructions
   it is written under*, and the two COMPOSE — a user inside a project can `@mention` a company and
   gets both today. A fifth variant would have made that ordinary pair unrepresentable and stopped
   the mention scoping while the chip still promised it. So `projectId` is its own field beside the
   union (`TurnScope`), and the "accepted ⇒ consumed" guard covers it.
2. **08c-2 — live captions. DONE.** `{kind:'live'}` carrying the caption text —
   the only recipe carrying CONTENT rather than an id, because a call in progress has no stored row
   to name, so the gate bounds it as content instead of pretending prose has a charset. Fenced and
   budgeted like a call but **truncated from the FRONT**: a live viewer asks about what was just
   said, so the surface says `liveTruncated`, never `callTruncated` — the wrong one names the
   stretch the model did not read. "No captions yet" is its own state on both routes.
   **The route choice moved from the MOUNT to the TURN** (`lib/chat/turnRoute.ts`): the live host
   also owns a document pane, and a turn carrying a snip falls back to the old route, which honours
   it in full. That replaced a throw which would have refused a question the product can answer.
   Verified against a real recorded call replayed mid-flight, both locales, plus the
   no-captions-yet state; the truncation notice and the snip fallback shipped UNSEEN and are
   listed as such in `docs/evidence/feat-smart-layer-b2c-live-grounding/verify-app.md`.
   **Still unpriced:** no `measure-chat-answer` run for a live turn against the ≤$0.06 line.
3. **08c-3 — `documentRef` + snips.** Needs image content blocks in the loop, not just text. The
   biggest of the three. Still open. **The old `/api/chat` dies at the end of this one.**
4. ~~A founder call on the "stuffed FIRST turn" wording.~~ **CLOSED 2026-08-15.** Founder chose to
   fix the wording rather than change the behaviour: §5's stuffed-document row now reads **"any
   turn"**, the per-turn re-injection stays as built, and the $0.13 number is unchanged. Reasoning
   and the alternative he declined are in `DECISIONS.md` and in §5 itself.

### Landed in 08b
The `Grounding` union at the request gate (refuses rather than downgrades); `chat2/callInjection.ts`
(fenced, line-id-anchored, budgeted, reports truncation) + `callSource.ts`; a non-terminal
`grounding` event carrying the citation source and the whole/truncated state; the error terminal
when a call cannot be loaded, before any model call; citation chips restored for call-grounded
answers; `callTruncated` persisted so a reload cannot turn a partly-grounded answer into a whole
one. Two real-data defects caught at verification: `transcripts.id` is `text` not `uuid` (the gate
would have 400'd every real call), and `server-only` made `callSource.ts` unloadable outside Next.

Provenance: the three slices come from an architecture review of the chat stack
(2026-08-15). Two further candidates from that review — a partial-result union for
`retrieveChunks`, and folding per-company diversification into `RetrieveOptions` — are
retrieval changes and belong to the dedicated retrieval session named in `STATUS.md`, NOT
here; both edit `retrieve.ts` and would collide.
