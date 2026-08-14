# B2 · Ask Atlas surfaces

Status: in-progress — SPLIT INTO 08a / 08b
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

**The ticket is NOT closed by 08a.** Its acceptance line is the surfaces verified in both
locales; only 08b can close it. A merged 08a must not be read as a finished 08.

- **08a — plumbing. DONE** (slices 1–2; slice 3 moved to 08b, see below). Changes NO
  user-visible behaviour: the old route keeps serving every surface and `ChatView` behaves
  exactly as before. Verified by typecheck + the battery; `/verify-app` is deliberately not
  owed, because nothing a user can see moved.
- **08b — surfaces.** Everything above: both callers onto v2, whole-call injection, delete
  the old route and the `useV2` fork, restore citation chips (v2 carries none), then
  `/verify-app` both locales, the three measurements, `/ship`.

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

Provenance: the three slices come from an architecture review of the chat stack
(2026-08-15). Two further candidates from that review — a partial-result union for
`retrieveChunks`, and folding per-company diversification into `RetrieveOptions` — are
retrieval changes and belong to the dedicated retrieval session named in `STATUS.md`, NOT
here; both edit `retrieve.ts` and would collide.
