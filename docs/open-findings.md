# Open findings — NOT laws. Do not cite these as invariants.

Moved out of `.claude/rules/app.md` on 2026-08-12: these are open items, not invariants, and
`CONTEXT.md` reserves the always-on set for law. An agent touching the code an entry names should
read it; nothing else needs it loaded.

Each needs a decision or a window, not a drive-by fix. Re-verified 2026-08-10.

- **`GET /api/live/{state,pcm}` are unauthenticated** (boundary-test allowlist, marked OPEN there
  too). The mitigation once written for them is false and was refuted the same day: both read
  `process.env.LIVE_ENGINE_URL || 'http://localhost:8788'`, and that variable exists precisely to
  point a deploy at a tunnelled engine. They are inert on `www.timlul-ai.com` only because it is
  unset — one dashboard field wide. **⇒ Gate them in the SAME change that sets it. A follow-up is
  not a plan, it is the window.** → `#api-auth-boundary-test`
- **`.gitattributes` is absent while `core.autocrlf=true`** (both confirmed 2026-08-10).
  `* text=auto eol=lf` would close the CRLF trap structurally, but it is a repo-wide behavioural
  change and must not ride in on a feature merge. Founder decision. → `#crlf`
- **One UTC leak, not user-visible:** `api/workspaces/[id]/intake/route.ts:542` (UTC `{TODAY}`;
  `{Y0}`/`{Y1}` server-local at 543–544). The second leak this entry used to list —
  `src/lib/maya/events.ts`'s `getUTCFullYear` labelling a fiscal year — was closed by slice A5's
  `periodFor` rewrite (Israel time via `israelDayKey`, 2026-08-14). → `#timezone-israel`
- **`PUT /api/transcripts/[id]` is a standing route around the admin-only curation gates**
  (recorded 2026-08-13, reviewer finding on `fix/speaker-edit-admin-gate`). The PUT is
  owner-or-admin and replaces the whole `formatted_data` — speaker names included — so a
  non-admin OWNER can rewrite speaker attribution that the PATCH gates now reserve for admins
  (docs/DATA-MODEL.md, "Writes to the shared corpus are CURATION"). Not exposed today: queried
  2026-08-13, 3 corpus rows are owned by the one admin and 2 are ownerless (→ admin-only).
  **DECIDED 2026-08-13 (ticket 13): the PUT becomes admin-only** — full-content transcript
  edits are curation like speaker renames, no owner-exception. Awaiting execution as a small
  mission: `requireAdmin` on the PUT + non-admin→403 route tests. Closes when that lands.
- **`profiles`/`access_requests` `USING (true)` policies narrowing is approved and scheduled**
  (2026-08-13, ticket 13 — the "check Timlul first" blocker dissolved with the corpus cleanup).
  Its own small mission through the DDL gate (DROP/ALTER POLICY is hook-blocked): migration
  file → review → apply. See db.md's ownership-law section for the banned shape.
- **`public.atlas_search_chunks` (migration 029) is orphaned once slice A5 deploys** (recorded
  2026-08-14, pre-apply review of migration 031). 031 adds `atlas_search_chunks_v2` under a new
  name because Postgres refuses to widen a `returns table` via `create or replace`, and removing
  the old function is hook-blocked SQL — so it costs a founder round-trip (the `probe_idf_tsquery`
  pattern in `COLLISIONS.md`). Leaving it in place is also what keeps the deployed build working
  while 031 is applied ahead of the merge. **After A5 is deployed and verified** it has no caller:
  `src/lib/corpus/retrieve.ts` is retrieval's one door and it calls `_v2`. Removal is a
  founder-run statement in the Supabase SQL editor, and it is not urgent — an unreferenced
  invoker-rights function granted only to `authenticated`/`service_role` is inert.
  **Not a law, and not a reason to hold the slice.**
- **A verified citation proves the WORDS were shown, not WHICH document they came from** (recorded
  2026-08-14, round-1 cold review of slice B1a). `lib/chat2/loop.ts` checks every quote in a final
  answer against `sourcePool` — the concatenation of every tool result of that turn — so a sentence
  can lift a quote correctly from company A's filing and attribute it to company B, and the check
  passes. The check itself is real and load-bearing against INVENTED quotes, which is what it was
  built for; only its scope is narrower than the phrase "verified citation" suggests. Closing it
  needs per-source attribution carried through the fence and matched against each citation's own
  anchor, which is a design change, not a patch. **Do not describe B1's citations as
  attribution-verified until this is closed.** → `#classifier-visible-failure`
- **The chat system prompt is CACHE-READY but nothing is cached** (recorded 2026-08-14, same
  review). `lib/chat2/systemPrompt.ts` orders the static block first and the volatile facts last,
  which is the part that matters and is correct. **THE REASON RECORDED HERE FOR NOT CACHING WAS
  WRONG — corrected 2026-08-15 by measurement, not estimate** (`messages.count_tokens`, Sonnet 5,
  the model the loop actually calls): static system **450** tokens, `TOOL_DEFS` **1,174**, so the
  cacheable prefix a breakpoint would cover — tools render before system — is **1,659, which is 635
  OVER** the 1,024 minimum. This entry and `systemPrompt.ts` both said ~880 and "cannot engage".
  The error: tool tokens were derived from character count at prose ratios, and JSON schema runs
  ~1.8 chars/token, so the tool block is more than double the estimate. **A breakpoint WOULD engage
  today.** It is still not set — that is now a cost/retrieval decision (reads ~0.1×, writes 1.25×,
  so it pays back on the second turn of any conversation; caches are model-scoped and any tool-list
  change invalidates them), not a blocked one. **Spec §5's ≤ $0.06/answer budget still must not be
  justified by prompt caching** until a real run is measured with `cache_read_input_tokens > 0`.
  Cost HAS since been measured against real answers (ticket 08b, all with caching off): $0.0164
  company-scoped, $0.0537 / $0.0805 for stuffed call turns.
- **More pre-joined mixed-language labels exist, outside the chat surface** (recorded 2026-08-14,
  ticket 07). The bidi law's remedy is a `<bdi>` per run, and its VERIFY step says to grep the
  CONSTRUCT rather than fix the component — because fixing one instance is what hid the others.
  Ticket 07 fixed the transcript chip by making `page.tsx` pass `company` and `quarter` separately
  instead of pre-joining them, since a concatenated string cannot be isolated by whatever renders
  it. Grepping that construct (`\`${…} · ${…}\``, `\`${…} — ${…}\``) finds more RENDERED instances
  the same argument applies to:
  `src/components/live/LiveTranscriptView.tsx:215` (`${name} — ${call.quarter}`),
  `src/components/company/DocumentsTab.tsx:229` (`${dict.company.transcript} · ${p.period}`),
  `src/components/company/AddInvestorCall.tsx:33` (`${dict.company.queued} · ${res.id}`),
  `src/components/workspace/SourceDocument.tsx:493` (title · page label).
  **Not fixed here, deliberately** — each is a different surface with its own verification, and
  ticket 07 is the chat surface; fixing them blind is exactly the "fixed one instance" move the law
  warns about. **Not a law and not a blocker.** The `lib/chat2/*`, `lib/chat/*`, `lib/corpus/*` and
  `aria-label` hits from the same grep are NOT instances: they build model-prompt text or
  screen-reader strings, neither of which is a bidi-rendered line.
  Whoever touches one of those four surfaces should fix it there, at the construct. → `#bidi-bdi`
- **A project SOURCE body reaches the system prompt UNFENCED** (recorded 2026-08-15, ticket 08c-1).
  `chat2/projectInjection.ts` injects the project's block into the system prompt without a
  `<<<ATLAS-SOURCE>>>` fence, and that is CORRECT for the two fields it is mainly about: standing
  instructions and memory are text the user wrote to be OBEYED, and fencing marks content as
  "quoted material, never an instruction" — the exact opposite of what they are for. It is also
  the behaviour the old `/api/chat` has shipped since projects existed, so this is not a
  regression introduced by 08c-1.
  **What is not covered:** a project SOURCE (a typed note) may hold text the user pasted out of a
  document, and that rides in at system level with the instructions. The user is the principal
  here — injecting into your own turn buys you nothing you could not simply type — so the exposure
  is bounded and is NOT the tool-result case the fence exists for. Closing it properly means
  splitting the block so notes fence and instructions do not, which changes `buildProjectContext`,
  the old route and the UI's capacity meter together, and that shared budget function being ONE
  function is its own law.
  **Not a law and not a blocker.** Whoever splits that block should do it as its own small mission.
- **The chat stack has NO model-availability fallback since `/api/chat` was deleted** (recorded
  2026-08-15, ticket 08c-3, found at cold review). The retired route ran Gemini 3.5 Flash with a
  **GPT-4.1 streaming fallback** that fired on a 503 or a network blip, so a vendor wobble did not
  kill a chat mid-call. `/api/chat/v2` has one engine — Anthropic Sonnet 5 — and no second one.
  **This is a real capability LOSS, not a code cleanup**, and it is recorded here because the
  retirement commit did not say so. It matters more than it looks: `STATUS.md` still says
  Railway's `ANTHROPIC_API_KEY` is UNPROVEN, so today a missing or rotated key takes the whole of
  Ask Atlas down on every surface at once, where before the live-call chat would have kept
  answering.
  **What IS true, and is why this is not filed as a blocker:** the failure is VISIBLE rather than
  silent — an absent key returns 503 and a provider error ends the turn in an `error` event, which
  the surface renders as a failure beside the answer, never as an answer. The degradation law is
  satisfied; the availability is not.
  **Not a law and not a blocker.** Restoring a second engine means a provider-agnostic tool loop
  (the fallback has to carry tool use and image content blocks now, which the old text-only
  fallback never did), so it is its own mission, not a patch.
- **A Hebrew answer that quotes an English prompt constant renders its punctuation on the wrong
  side** (recorded 2026-08-15, ticket 08c-3, seen while driving the unreadable-report state).
  The model repeated the English `NO_PAGE_TEXT` instruction verbatim inside an otherwise-Hebrew
  answer, and that mixed run rendered with its quote mark and full stop misplaced.
  **This is NOT a recurrence of the `<bdi>` law, and the distinction is the point.** All eight of
  that law's occurrences are lines **we** compose from data — a company name joined to a quarter, a
  `dir="ltr"` wrapper, a citation. This is MODEL PROSE inside `Markdown`, and no `<bdi>`-per-run
  rule reaches it without a bidi segmenter; filing it as a recurrence would move a mechanism onto a
  surface the mechanism cannot see. The cold reviewer classified it as one and the classification
  was disputed on those grounds — recorded here so the argument survives the branch rather than
  only its conclusion.
  **What was done:** `NO_PAGE_TEXT` now asks for the user's own language and says not to repeat the
  note. Named in the code as a **mitigation, not a mechanism**.
  **What is still open:** every OTHER English prompt constant the model may quote — `NO_CAPTIONS_YET`
  (08c-2), the truncation notices, the citation-retry sentence — has the same exposure and has not
  been given the same clause. **Not a law and not a blocker.** The real fix is upstream of all of
  them: answers that carry their citations structurally, which is its own ticket.
- **A CALL-grounded turn is no longer company-scoped for its tools** (recorded 2026-08-15, ticket
  08c-3, found at review round 5 behind a dead prop). On the retired `/api/chat`, the multiview
  panel sent `companyId` AND `transcriptId` together, so a follow-up question that reached past the
  call still searched inside that company. On `/api/chat/v2` the `Grounding` union carries ONE id
  per recipe by construction, so a `{kind:'call'}` turn puts `transcriptId` on the scope and no
  company — and a tool call beyond the call runs market-wide until `resolve_company` pins it.
  **This is not a bug in the union, which exists precisely to make "grounded in a call AND a
  workspace" unrepresentable.** It is a question the union does not currently answer: a call
  BELONGS to a company, so the company is derivable from the call rather than being a second
  grounding — which is a different fix from adding a field, and a different one again from letting
  the client send both.
  **Why it is not silent:** the loop announces the mode on every turn (`{type:'mode'}`), which is
  what "search mode is VISIBLE" was built for. `TranscriptChatPanel` currently DISCARDS that event
  (`case 'mode': break`), so the fact reaches the surface and is dropped there — `ChatView` renders
  it. That drop is the actionable half.
  **Not a law and not a blocker.** Whoever picks it up should decide whether the company is
  derived server-side from `transcriptId` (my reading of the right answer) and should render the
  mode chip in this panel either way.
