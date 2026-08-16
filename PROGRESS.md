# PROGRESS.md

Decision log across sessions — what shipped and *why*. Newest first. Keep entries to ~3-5 bullets.
For the project overview, stack, and conventions, see `CLAUDE.md`.

---

## 2026-08-15 — The gate says don't build it (`feat/smart-layer-b3-workspace-chat`, ticket 09 — CLOSED)

- **The ticket's deliverable turned out to be a MEASUREMENT, and the measurement said no.** B3 gates
  the retrieval swap on "measurably beats the planner on the eval set" — a comparison nobody had ever
  run. Run on a workspace-shaped shelf under the route's own 18,000-token budget, at shelf sizes
  3/6/12: planner **12/8/8**, the swap **11/9/8**. They trade the lead by ONE case in each direction,
  which is not "measurably beats", so **workspace chat is unchanged** — the outcome the ticket names
  in advance as COMPLETED, not blocked. Retrieval's own chunk shape loses at every size.
  Harness `scripts/retrieval-eval/workspace-gate.mjs` is standing, beside `run.mjs`.
- **The first run said the planner won outright, and that was a harness artifact.** Arm E — the arm
  the ticket DEFINES as the swap — was embedding raw window text while production and arm R embed a
  deterministic metadata prefix. Given the same recipe it went 6/14 → 9/14. Six harness bugs in
  total, three of which moved a number that was about to be reported; all six are written down in
  the evidence, because a gate that hides its own repairs is not a gate. **The verdict survived
  every repair** — which is the only reason it can be trusted.
- **The real lead is UNION, not replacement.** P and E miss *different* cases at every shelf size
  with stable membership — the planner keeps the W4 garble case (the source says «הרווח הטיפולי»
  and the user's own words still find it), the swap keeps the headline numbers. ⚠ Recorded as an
  ORACLE BOUND: a real union sends both selections through the one shared budget every arm was held
  to, so it is not an achieved score. Its own ticket, its own gate.
- **The ungated half was a prompt-injection hole, and it took EIGHT passes to close.** Only the source
  BODY was defanged; then the fence marker LINE (a title, a kind, an id), then the shelf listing and
  partial list, then the `"""` quote blocks, then the conversation turns, then the clip caption,
  then `intake/selectSources.ts` (the builder that decides which FILES get fetched), and finally the
  compose route's own inline caption and the intake route's inline prompt. Each fix
  landed where the bug was noticed, which is what M3.1 forbids. **Two are the instructive ones: door
  six was the SCAN — bought to end the sequence — repeating the mistake by naming two builders when
  the defect spanned three; and door seven was a site review had ALREADY named, a fix had cited, and
  this branch's own review record recorded as FIXED while it stayed open for two more rounds.** Six
  of the eight were found by fresh eyes after the boundary had been declared closed. A law is filed
  in `app.md`, and door seven is why its mechanism is a TYPE and not another scan: `askModel`'s
  `captions` takes a `FenceSafe` only the sanitisers produce, so a route cannot pass a raw string
  whether the scan names its file or not.
- **09b: the intake takes a company by `@`, not by spelling.** The founder tested this branch and hit
  a surface it had not touched: he asked for בית זיקוק אשדוד's filings and Atlas said it had none,
  about a company holding **12** reachable MAYA filings. Measured — `בז"א`, `בית הזיקוק באשדוד` and one
  typo all match NO MAYA registered name, and the resolver is right to refuse them, because a
  near-match between בז"א and בז"ן is the other refinery's report under the name you typed. His call:
  *"why not just allow the user to type @ … it will be accurate"*. It does not improve the matching,
  it REMOVES it — the id travels and the spelling never does, which is the impossible tier rather
  than a guard. Ask Atlas has had this since 07; the intake was the surface that never got it.
  **Two things the review caught in my own fix are the lesson:** gating the "I couldn't understand
  that" notice on "a company was settled" made a pinned request with a failed interpretation report
  NOTHING — the same call carries the PERIOD — and the first Enter guard, reasoned from how
  `ChatComposer` is wired, both picked a company and sent the half-written sentence, green through
  `tsc` and the whole battery (M1). The notice decision now lives in `intake/notice.ts` as a pure
  function, and the two dead ends have separate sentences: advising `@` to someone who just used `@`
  names the action that failed.
- **Two founder-reported bugs, fixed the same day (2026-08-16).** **(1)** The documents tab offered
  an ANNUAL row for a year still in progress. `periodFor` builds a label from two independent
  sources — a period CODE off the MAYA event ids and a YEAR off a regex on the title — and nothing
  made them agree: a capital-markets deck tagged with the annual code met the year of a MONTH NAME.
  A deck is now refused a period that had not ended when it was published. **The first version of
  that rule was a BLOCKER at review, and the catch is the lesson:** it also checked reports, and
  against a year it had INFERRED when the title stated none — which for an annual can never pass, so
  every annual with a year-less title would have left the catalog to fix two rows. I had reasoned
  that class was rare instead of counting it. Counting it settled the design: **8,804
  document-eligible filings across all 233 issuers, 81 labels changed, every one a deck, zero
  reports** (`node --import tsx scripts/measure-period-labels.ts`, committed so the number can be
  re-derived rather than quoted). The sweep also found real reports the naive rule threw away — a
  foreign-track issuer whose FISCAL quarter is not a calendar one — and one more class, filed as an
  open finding: forecasts carrying the annual code, competing with the statements for a period's
  report slot.
  **(2)** Ask Atlas answered "this grounding cannot be honoured" to every question asked from a
  period page with no transcript. That screen fabricates `period:<companyId>:<period>` as a routing
  key, and the view chose its chat grounding with `call.id !== 'demo'` — a PROXY that named one of
  the two screens without a stored row and could not see the other — so it offered the chat route a
  call id that is not even shaped like one, and the turn died at the shape gate before any lookup.
  `LiveCall` now carries a REQUIRED `storedTranscriptId`, which made `tsc` name every producer, and
  the recipe is chosen by `lib/live/askGrounding.ts`, a pure function whose sweep includes the
  property binding the two sides: every `{kind:'call'}` it produces passes the same shape test the
  route applies. Seven sites read that proxy — the caption among them, so the screen also PROMISED a
  call it did not have. The panel now reads the grounding itself and the second input is deleted:
  one input cannot disagree with itself.
  **Scope, stated plainly:** the period-label half is company-catalog work riding a workspace-chat
  branch, at the founder's explicit request, and it changes the documents tab for all 233 issuers.
- **Verified:** **1179/1180**, `tsc` clean. The one red is environmental and predates this work —
  `environment.test.ts` counts a second `CLAUDE.md` inside a registered git worktree under
  `.claude/worktrees/`; any registered worktree turns it red for whoever has one. Both fixes driven
  in a browser in both locales, including the A/B that matters: a period WITH a transcript still
  grounds in the call, and a period without one grounds in the company and answers 200 where it used
  to 400. Evidence: `docs/evidence/feat-smart-layer-b3-workspace-chat/founder-bugs-2026-08-16.md`.
  The workspace honesty states were driven in a browser in both locales at 09b, then **re-driven**
  after review changed the code under them, because a drive expires (8c); that battery measured
  1168/1168 at the time, and the line above is the same tree re-measured after these two fixes.
  Evidence, review record and all runs: `docs/evidence/feat-smart-layer-b3-workspace-chat/`.

## 2026-08-15 — The loop learns images, and the old `/api/chat` dies (`feat/smart-layer-b2c-doc-grounding`, ticket 08c-3 — CLOSES ticket 08)

- **The tool loop carries IMAGE content blocks.** Up to four snipped report-page PNGs ride the user
  turn, each captioned with its page; the marked pages' extracted text rides beside them, fenced and
  budgeted per page. That capability is the only thing that had kept `/api/chat` alive through three
  slices, so the route is deleted — along with `lib/api/chat.ts`, `lib/chat/turnRoute.ts`,
  `lib/chat/context.ts`, `lib/chat/documentBlock.ts` and their tests. **A route dies when its LAST
  caller leaves**, and `TranscriptChatPanel` was it.
- **The attached document is a THIRD orthogonal question**, beside the `Grounding` union and
  `projectId` — the same correction 08c-1 made for projects. Multiview is a call AND a report at
  once, so a fifth recipe would have made the ordinary case unrepresentable.
- **Five review rounds, and rounds 1–3 each found a blocker the PREVIOUS round's fix had caused** —
  twice in the sibling branch of one `if`. Four successive "better conditions" each shipped the next
  defect. What stopped it was structural: the decision moved into `documentContextState()`, a pure
  function of four named facts, swept as a table. **The degradation law gained a fifth tier** for the
  general shape — *a state naming one channel must never be measured against the union of every
  channel* — with the three rounds in `docs/case-history/app.md#two-channel-degradation`.
- **Two real-data defects the battery could not see**, both found by driving the surface: a report
  whose pages hold no extracted text reported `ok` while the screen said nothing, and the 400 for a
  malformed attachment called it a "grounding".
- **Two capability losses recorded rather than papered over** (`docs/open-findings.md`): the chat
  stack has no model-availability fallback since the Gemini→GPT-4.1 route went, and a call-grounded
  turn is no longer company-scoped for its tools.

## 2026-08-15 — The live panel reaches v2: captions become a grounding recipe (`feat/smart-layer-b2c-live-grounding`, ticket 08c-2)

- **Live captions are the fifth `Grounding` recipe, and the only one carrying CONTENT rather than
  an id** — because a call in progress has no stored row to name; the transcript is written when
  it ends. So the gate bounds it as content (a size ceiling, a bounded newline-free label) instead
  of pretending prose has a charset, and what defends it is the same fence every other source goes
  through plus a system prompt (`LIVE_SCOPE_SUMMARY`) that never interpolates it. A live call is a
  recipe for the same reason a project is *not* one: it answers the union's own question, where the
  answer comes from.
- **It truncates from the FRONT, the opposite of a stored call, and the surface says the opposite
  half.** A finished call is read from the top; a live viewer is asking about what was just said,
  so keeping the head would drop the material on screen. That is why `chat.liveTruncated` is its
  own string in both locales — telling a live viewer the answer covers "the first part" names the
  one stretch the model did not read. "No captions yet" is a third state, with its own sentence to
  the model on both routes, so the first seconds of a call cannot answer from the corpus underneath
  a caption promising the live call.
- **The route choice moved from the MOUNT to the TURN** (`lib/chat/turnRoute.ts`). The live host
  also owns a document pane, and v2 cannot read snips until 08c-3 — so a turn carrying one falls
  back to the old route, which honours it in full. That replaced a `throw` which was correct while
  no v2-grounded host had a document pane and would have refused a question the product has always
  answered the moment the live host sent a grounding. A fallback where nothing on screen is left
  unfulfilled is not a downgrade; the distinction is whether the screen is left promising something.
- **Cold review found two honesty defects, both fixed at the choke point.** A long call would have
  400'd *every* question — the client sent its whole caption stream, so past the request ceiling the
  gate refused, on exactly the calls the front-truncation exists to serve; the client now bounds the
  payload and stays ABOVE the injection budget, because capping at the budget would have deleted the
  truncation notice from the screen while the degradation grew. And empty captions leaked a
  different grounding: the old route's `liveContext || undefined` turned a silent live call into a
  company lookup under a caption promising the call (a recurrence of the visible-degradation law —
  it type-checks now).
- **Verified against a real recorded call, not a fixture**: `2026-07-04-real-zoom-2` replayed
  mid-flight, both locales, answers grounded in the actual captions and honest about what the call
  had not yet said, `POST /api/chat/v2 200` twice and no legacy call, zero console errors. **Two
  states shipped unseen and are named in `STATUS.md`**: the `liveTruncated` notice (no recorded
  session is 60,000 chars long) and the snip fallback. Battery 1090/1090.

## 2026-08-15 — Project chats reach v2, and the `useV2` fork dies (`feat/smart-layer-b2c-project-grounding`, ticket 08c-1)

- **Ticket 08c was sliced three ways; this is slice 1.** Its three remaining groundings are not one
  mission: project context reuses an existing budgeted builder, live captions is a new recipe, and
  `documentRef`+snips needs IMAGE content blocks the tool loop has never carried. Shown that, the
  founder took the smallest honest slice — *"Project grounding only"*. **The old `/api/chat` is
  still alive**: `TranscriptChatPanel` calls it for the other two, and a route dies when its LAST
  caller leaves. Ticket 08's own line saying slice 1 would delete the route was half-true and is
  corrected in the ticket rather than quietly satisfied.
- **A project is NOT a fifth `Grounding` recipe, and that was the load-bearing call.** The union
  answers *where an answer comes from*; a project answers *whose standing instructions it runs
  under*, and the two COMPOSE — a user inside a project can `@mention` a company and today gets
  both. A fifth variant would have made that ordinary pair unrepresentable, silently dropping the
  company scope under a chip still promising it. So `projectId` is its own field beside the union
  (`TurnScope`), refused rather than dropped when malformed, and swept by the accepted-⇒-consumed
  guard — mutation-tested: removing every `scope.projectId` read makes that guard fail.
- **A failed project does NOT end the turn — the deliberate asymmetry with whole-call injection.** A
  call IS the answer's source, so a call that will not load ends the turn. A project is a modifier:
  the corpus, the tools and any company scope all survive, so the answer is still worth having
  provided it says so — to the user (a persisted `projectContext` event) and to the MODEL, so the
  answer cannot sound fully informed underneath a notice saying it is not.
- **Verified in a browser in both locales against real data**, with a token planted in the project's
  instructions so compliance had one unambiguous reading, and a CONTROL request proving the token
  came from the project and nowhere else. All five request states driven, `failed` through real RLS.
  Cost measured for the first time on this path: **+$0.0216** for injection on a near-maximal block;
  the $0.06 breach on a composed project+company turn is ticket 07's existing red, proven by a
  company-only control at $0.1010 with no project at all.
- **Cold review returned CHANGES with six findings; four were `RECURRENCE: yes`, and three bought a
  structural fix rather than a comment** (ADR-0002): a missing supabase client now THROWS instead of
  masquerading as "RLS said no" (an M3.2 proxy), the load failure is logged at the point where three
  causes collapse into one user-visible state (M1 — the old comment claimed another file logged it,
  and that file did not), and the honesty facts are now settled by ONE function both the success and
  failure paths call, closing a hole where a stream breaking after `projectContext: 'failed'`
  rendered a partial answer with no notice at all. Battery 1052 → **1056**, all green.

---

## 2026-08-15 — Chat plumbing, so ticket 08 is one change (`feat/smart-layer-b2a-chat-plumbing`, ticket 08a)

- **Ticket 08 was split into 08a (plumbing) / 08b (surfaces), the way B1 was split into 06/07, and
  for the same reason** — as one mission it is two surfaces + three refactors + `/verify-app` in
  both locales + three measurements + ship, and the browser verification lands LAST, which is the
  worst place to run out of room. 08a changes no user-visible behaviour: the old `/api/chat` still
  serves every surface. **08a does NOT close ticket 08** — its acceptance is the surfaces verified
  in both locales, which only 08b can do.
- **Domain vocabulary left the transport module.** `ChatSnip`, `ChatSource` and `DocumentRef`
  described what a user is looking at but were declared inside `lib/api/chat.ts`, the client for
  the route ticket 08 deletes — and eleven modules imported them from there, most of which never
  call chat (the PDF viewer, the workspace shelf, the live facet panes). The stored-message
  honesty helpers were worse: they already read v2's `incomplete` code, so machinery that outlives
  every wire format was filed under the transport scheduled for deletion. Now
  `lib/chat/grounding.ts` + `lib/chat/messageState.ts`; **08b's blast radius drops from 12 files to
  `lib/api/chat.ts` plus its two callers.**
- **One protocol module for the v2 wire, closing a silent drift.** The event vocabulary was declared
  twice and the incomplete-code list a third time — as a TYPE in `chat2/terminal.ts` and as a
  hand-maintained RUNTIME array in `api/chat2.ts` marked "kept in sync", with only the array
  consulted at parse time. A ninth code would therefore have been rewritten to `stopped_unknown` by
  the parser with tsc, the battery and both locales' copy all green — undoing round 4's deliberate
  split of the four non-clean stops. `chat2/protocol.ts` declares the codes once and DERIVES the
  type from them, so there is no second declaration to disagree with.
- **Two new mechanisms, both verified able to fail.** `chat/domainBoundary.test.ts` fails if
  anything under `src/lib/chat` imports transport — it shipped as a ratchet with one named
  exception and that exception was removed by the very next slice, so the allowlist is empty.
  `chat2/protocol.test.ts` asserts the closed drift behaviourally: every server code round-trips the
  parser unchanged, an unknown one still lands on the generic branch, the copy map covers the
  vocabulary at RUNTIME, and the terminal set has not grown a fourth member. The boundary guard was
  deliberately broken with a real violation to confirm it fails before being trusted.
- **Slice 3 (the `Grounding` union) moved to 08b, blocked by a law rather than by effort.**
  `chat2/requestScope.test.ts` refuses any scope id the backend accepts but does not read, pinning
  `transcriptId` by name as ticket 07's cold-review BLOCKER. A union whose `call` variant the route
  accepts before whole-call injection exists reproduces that defect one layer up, so the union must
  land WITH the handler that honours it. The shape to start from is written into the ticket.
- **Cold review returned four findings, all fixed on the branch; three named M1.** The sharpest:
  `domainBoundary.test.ts`'s docstring claimed a dynamic import would fail it, and the pattern
  matched only `import … from` — so dynamic imports AND re-exports passed silently. A guard
  advertising coverage it lacks is worse than none, because the next reader trusts it. Broadening it
  immediately caught an `export … from` probe the original missed. Regenerating ARCHITECTURE's test
  index then showed **24** registered files missing from it, not the 4 this branch touched — stale
  since tickets A3–07. Record + the ADR-0002 payment:
  `docs/evidence/feat-smart-layer-b2a-chat-plumbing/review.md`.
- **Verified:** `npx tsc --noEmit` clean · `npm test` 996/996 · `npm run build` green ·
  `git diff --shortstat a7435f2^ a7435f2` (301+/106−) agrees exactly with its `-w` form, so no line
  endings were rewritten (the `#crlf` trap). No `/verify-app`, and that is a claim not an omission:
  nothing a user can see moved, and the old route still serves every surface.
  **Cold review corrected this bullet**: it first cited "34+/105−", which was a `git diff --stat` of
  the WORKING TREE taken before the guard test and the moved files were staged — a real measurement
  of a different question than the sentence asked, which is M1 in miniature, inside the bullet
  claiming M1 compliance. The conclusion held; the quoted pair did not.

---

## 2026-08-14 — Chat reaches the new brain (`feat/smart-layer-b1b-chat-surface`, ticket 07 / B1b)

- **Chat's UI is on `/api/chat/v2`, so B1a's honesty machinery finally reaches a person.** Visible
  search mode decided from SCOPE alone (`chat2/mode.ts` takes no question text, so guessing the mode
  from the words is a type error rather than a discouraged practice), one tap between market-wide and
  pinned, nine degradation states rendered from a code in both locales, per-company diversified
  results so a market-wide question cannot be answered about one issuer, and alias-aware `@mention` —
  the dropdown was strictly less able to recognise a company than the answer engine behind it.
- **Two acceptance rows are RED and filed with their numbers, not re-scored (M2).** Market-wide
  search does not complete — an unscoped scan over 98,042 chunks hits a statement timeout — while
  scoped search, the channel both MUST-PASS eval cases close through, works end to end. And the
  $0.06/answer budget does not hold: three real answers priced $0.086 / $0.025 / $0.097, with prompt
  caching measured OFF (`cache_read = 0` on all three). Both levers are eval-gated retrieval
  parameters owned by the dedicated retrieval session, so retuning them here would have been
  re-scoring the gate to make it green.
- **The unscoped failure proved the degradation design against a real, unplanned fault:** visible
  tool errors, terminal `incomplete{all_sources_failed}`, and the model saying so in Hebrew. No
  `done`, no fabricated answer, no silence.
- **Three cold-review rounds, and the same lesson each time: the instance got fixed and the class got
  claimed.** A scope the backend accepted and ignored while the UI promised it; a contradiction fixed
  in two chips and missed in the hint one block below; and the guard written to prevent the first
  defect, defeated TWICE — a substring cannot tell a declaration from a use. It now requires a
  value-position read and is proved against both prior defeats. Two evidence-file claims were false
  and are marked corrected in place rather than deleted.
- **Verified in a browser, both locales, every reachable state** — including driving the
  "resolved company whose name lookup failed" state end to end, and measuring the bidi fix in the DOM
  (`dir=rtl` at x=905 beside `dir=ltr` at x=980) rather than trusting it. 986/986 battery, `tsc`
  clean, zero console errors. **Railway's `ANTHROPIC_API_KEY` remains unproven — it needs a deploy,
  and a 401 there is the first thing to check.**

## 2026-08-14 — The corpus becomes real (`feat/smart-layer-a5-maya-backfill`, slice A5)

- **26 documents → 1,296, across 233 TASE issuers.** `selectLatestOfEach` implements the depth the
  founder approved (latest quarterly + latest annual + 12 months of decks), classifying by event ids
  101/104/105/106/270 and never by `.xbrl` presence — the rule that keeps dual-listed issuers like
  ICL and אבוג'ן in the corpus instead of silently dropping them. Backfill, the 10-minute poller and
  the nightly sweep (which IS the backfill re-run) all reconcile through ONE door,
  `syncCompanyFilings`, so a poll and a sweep racing on one filing converge on one row.
- **`index_status` is visible to a person** at `/app/admin/corpus`, which A3 deferred and this slice
  owed. It COUNTS rather than lists — a cold review caught that listing every row would have made
  the screen start under-reporting at ~1,000 documents, i.e. exactly the size that made it worth
  building, and my browser check had passed it against 26.
- **Migration 031 closes the truncation blind spot A4 owed** (`atlas_search_chunks_v2`): completeness
  now reads `saw < least(pool, in_scope_capped)` instead of comparing against a pool. Three pre-apply
  review rounds killed two wrong versions of that rule before either reached production — including
  one of mine that would have reported every production query as truncated.
- **Four defects the run itself surfaced, each fixed at the choke point:** a NUL in extracted PDF
  text was killing whole documents at the pages insert (~0.5%); a text-less row would have been
  marked `indexed`; the run reported `failed: 0` while 816 documents had no embeddings; and the
  embedding writes were sequential, one round trip per chunk. The third is the one worth remembering
  — every ROW was honest and the SUMMARY was not, which is the same lie one layer up, in the place a
  person actually reads.
- **Verified:** battery green (875 tests, re-run AFTER the STATUS.md rewrite — the first claim here said 874 over a RED battery, caught in pre-merge review); migration applied and driven end-to-end through
  `retrieveChunks` against the live corpus; the admin screen in both locales with the bidi law's
  x-position probe; the poller and live feed run against real MAYA. **NOT verified: the retrieval
  gate at this corpus size** — deferred past the merge by founder decision to unblock B1, which is a
  real weakening of A5's own acceptance and is recorded as such in STATUS.md and the ticket.

---
## 2026-08-13 — Search mode's quality is gated, not assumed (`feat/discovery-eval-cases`, ticket 15)

- **Two discovery cases join the standing eval set as class G** (`docs/eval/retrieval-eval-set.md`
  cases 19–20, mirrored in `cases.json`): «אילו חברות דיברו על עלויות מילואים?» (the founder's own
  ticket-07 phrasing) and «אילו חברות דיברו על בינה מלאכותית?» (offered from a measured theme menu
  of the live corpus, approved 2026-08-13). Every lead carries an anchor verified against the live
  DB on 2026-08-13; מילואים macro-boilerplate mentions (יעקב פיננסים/תורפז/דוראל) are documented
  NON-leads for the answer layer.
- **The harness scores `mode: "discovery"`**: market-wide ranking diversified per company
  (ticket 08's leads answer); pass = all lead companies within the top-5 company order; per-lead
  anchor rank recorded as evidence, never gated.
- **Measured: the decided C-gemini design passes both** (all leads @ company-rank 2 and 4);
  quoting the run's printed verdicts, "B-gemini: FAIL (case 20)" (the lexical channel rescues
  בתי זיקוק from company-rank 7 to 4 — fresh evidence for hybrid), "B-openai: FAIL (case 20)",
  "C-openai: FAIL (case 19)" — the same discrimination that chose the design in ticket 07. The
  report prints those verdict lines by design: prose quotes them, never re-derives from ranks
  (a hand-derived "fails both" was caught in cold review).
- **Verified:** full harness run committed (`scripts/retrieval-eval/results/run-2026-08-12T23-29-52.md`
  + debug top-20s). No app code in the diff — `/verify-app` would measure surfaces this branch
  never touched. Corpus note: 26 docs / 3,031 pages now, so pinpoint numbers are not comparable
  to the 08-12 report; within-run design comparison is what the gate measures.

---

## 2026-08-12 — The retrieval method is MEASURED and decided (`feat/retrieval-eval-harness`, ticket 07)

- **The standing eval harness exists** (`scripts/retrieval-eval/`): scores retrieval designs
  against the founder-approved 18-case set on the real corpus (3,202 chunks live from
  Supabase), entirely in-process — no pgvector, no migration; the extension is now a
  *conclusion* of measurement, not a prerequisite. ~$1.40 of embeddings, cached; reruns free.
- **The winner: hybrid + deterministic metadata prefix + company scoping on
  `gemini-embedding-001` @1536** (10/15 anchors in top-20, MRR 0.365), routed by scope size
  (small resolved scope → stuff whole docs; else top-20 retrieval). **OpenAI's
  `text-embedding-3-large` is ruled out for Hebrew by measurement**: 2/15 on identical
  chunks, plus a ~2–4× Hebrew token tax (5.0M metered tokens for 5.0M chars). The prefix is
  load-bearing (one case: rank 1 → 417 without it). D8's "measured, not assumed" caught it.
- **Founder approved with three amendments, filed in `DECISIONS.md`:** structured-facts
  lookup for filings' known numerics (ticket 14 checks what MAYA already provides), @company
  mentions as explicit scoping UX over the alias table, and a **visible Chat search mode**
  for market-wide discovery — leads-style answers, per-company diversified, mode chosen
  deterministically (@ present or not), never by a hidden classifier.
- **Corpus evidence for the map:** the `PyuMxe88e8g_live` duplicate pollutes every design
  (→ ticket 13's menu); the W1 attribution trap survives scoping (answer-layer guard
  confirmed); the alias table is the first build item (case 14 passes by construction,
  "טבע" honestly returns nothing).
- **Verified:** 700/700 tests · `tsc` clean · `build` green · harness output committed at
  `scripts/retrieval-eval/results/run-2026-08-12T13-52-12.md` (+ per-case top-20 debug).
  No app code in the diff — `/verify-app` would measure surfaces this branch never touched.

---

## 2026-08-12 — The workflow reset: the rituals become mechanisms (`chore/workflow-reset`, ticket 03)

- **`npm run ship:gate` is what a merge now has to satisfy.** Eviction: STATUS.md rewritten rather
  than appended to, a PROGRESS.md entry present, and any `.scratch/<feature>/` whose every ticket
  reads done copied to `docs/archive/` verbatim and removed. Promotion: a review record at
  `docs/evidence/<branch>/review.md` where every finding carries a `RECURRENCE:` answer, and a
  `yes` names one law main already holds whose enforcement declaration got stronger on this branch
  — or is honestly marked `UNENFORCEABLE` with a reason, which is a mandatory hatch, not a leak.
- **Why it is not a skill step.** All three of these were already written in `/ship` after ticket
  02, and `CONTEXT.md` counts prose as the weakest tier and not as enforcement. `git merge` onto
  `main` now runs the gate through `pre-bash-gate.mjs` and refuses on failure, so the ritual does
  not depend on anyone opening the skill. Override with `ATLAS_SHIP_OVERRIDE="<why>"`, which lands
  the reason in the transcript.
- **The laws no mechanism can reach are printed, generated from `app.md`, not copied into a
  checklist.** Five today, each with its `**VERIFY**` step in full, alongside the unenforced-law
  count for the branch and for main. Compliance stops depending on recalling rule 14 of 27, and
  the list cannot drift from the file it comes from.
- **Append-only and always-on are provably disjoint.** `APPEND_ONLY` (COLLISIONS.md, PROGRESS.md,
  DECISIONS.md) is declared once in `env-manifest.mjs`, asserted disjoint from `ALWAYS_ON` by the
  battery, and `append-log.mjs` derives its doors from it instead of restating them.
- **Verified:** 692/692 tests (21 new for the gate's rules, driven through their failing cases
  first) in Asia/Jerusalem and under `TZ=UTC` with the zone printed from inside the run · `tsc`
  clean · **116/116 hook fire-tests, up from 103**. Two defects the new matrix cases caught before
  merge: the eviction check read "no deletions" as "appended" and so accused the branch that
  *creates* STATUS.md, and the merge door's whitespace tokeniser read two words of a `-m` commit
  message as branch refs.

---

## 2026-08-08 — Atlas is DEPLOYED (founder + supervisor): live on Railway at `www.timlul-ai.com`, replacing the old Timlul deploy

- **The old product was retired, not paralleled — founder's call.** The existing Railway service
  was repointed from `argamandev/Investor-Transcript` to `argamandev/Atlas-app` on `main`. The
  supervisor had recommended standing up a SECOND service to protect the old deploy, then withdrew
  it when the founder said nobody uses that product: a recommendation whose entire justification
  has disappeared is a habit, not a recommendation. Repointing also preserves the service's
  variables and domain, so the shared Supabase credentials never had to be re-sourced — which
  matters because `.env*` is hook-blocked and the assistant could not have recovered them.
- **Verified by probe on the live host, not by the founder's report.** Iron rule 3 applied to a
  deploy: anonymous `/app/home`, `/app/workspaces`, `/app/company/abc` and `/print/abc` all `307`
  to `https://www.timlul-ai.com/?next=…`; `/api/workspaces` and `/api/projects` return `401`. The
  redirect resolving to the PUBLIC host is the meaningful part — it proves `NEXT_PUBLIC_SITE_HOST`
  is set and `resolveOrigin` honoured `x-forwarded-host`, so the Railway trap filed in
  `rules/app.md` (origin resolving to internal `localhost:8080`) did not bite. First production
  confirmation of a rule that until today had only ever been reasoned about.
- **Deploying did NOT publish the fabricated company data, and that distinction moved a deadline.**
  Every company page is behind the login gate, so `companyOverviewStub`'s invented IR contacts and
  index memberships are visible only to accounts the founder creates. The honesty pass (Lane M
  slice 0) was written as the deploy's blocker; its deadline is now **before the first invited
  account**. The founder challenged the supervisor's "honesty pass first" ordering on exactly this
  point and was right — deployed is not published.
- **`LIVE_ENGINE_URL` is UNSET, verified rather than assumed:** `/api/live/state` on the live host
  returns `offline:true`. That is what keeps the two allowlisted-unauthenticated live endpoints
  (`/api/live/{state,pcm}`) inert. The rule tightens accordingly — a deployed environment now
  exists, so gating them must land in the SAME change that ever sets that variable.
- **Open, and filed rather than remembered:** whether Atlas keeps `timlul-ai.com` (the product is
  no longer called Timlul); the cold meta-review, which was scheduled to fire immediately BEFORE
  the deploy and did not; and the live-calls hardening (no ws reconnect, ~230MB PCM per 2h) that
  must land before a real two-hour investor call runs on this host. Deploying is not the same as
  running a live call on it.

## 2026-08-08 — Workspace V1 + the MAYA layer SHIPPED (Lane M): a workspace persists, and Atlas can fetch a filing off TASE

- **Workspace stopped being demo state.** Four owned tables (`workspaces`, `workspace_items`,
  `workspace_threads`, `workspace_doc_blocks`) under the ownership law in `.claude/rules/db.md`,
  with composite FKs `(id, user_id)` so referential integrity cannot reach across owners — RLS
  protects rows, but a plain FK would not have. Fourteen `/api/workspaces*` routes and a data
  layer that queries through the **caller's own** client, so RLS is load-bearing rather than
  decorative. Shelf, panes, the working document's blocks and citations, and the intake
  conversation all survive a reload. The `LegalDueDiligence` demo pane and the workspace demo
  constants are deleted, not left dormant.
- **A MAYA platform layer that knows nothing about workspaces** (`src/lib/maya/`, 18 modules,
  four future consumers). Name a company and a period in the intake and Atlas queries TASE,
  offers the filings it found, downloads the PDF, extracts it and shelves it. `maya_issuers` is
  a shared-corpus table read-only to members; `companies_tase_issuer_uniq` exists because
  `ensureCompanyForIssuer` is check-then-insert and two analysts pulling the same new company
  concurrently would otherwise create two rows for one issuer.
- **The intake's agreement logic is now code, not a prompt** — and that took THREE review rounds,
  which is the part worth recording. Round 1: `resolveSelection` unioned the agreed set at status
  `ready`, so "כן, רק את הראשון" ("yes, only the first") silently attached all three and fetched
  them into the shared corpus. Round 2: the fix for that returned an empty set while the route
  still said `ready`, so Atlas announced *"I'm pulling them in now"* over nothing — and it fired
  on ordinary agreements too, because the narrowing vocabulary holds `לא`/`no`. Round 3 stopped
  patching vocabularies and **bought the invariant instead**: the route has ONE exit, and
  `intakeResult` makes `ready` + an empty selection unrepresentable. A resolution failure now
  asks a question, in both locales, naming which of the two ways it failed.
- **The lesson that outlived the bug: a classifier over an OPEN vocabulary will keep being wrong,
  so buy visible failure rather than a longer word list.** Each of the first two rounds' fixes
  opened the next round's door, both times by deciding *more precisely* what the analyst meant.
  The third round instead made being wrong ask a question. `rules/app.md` already carried this as
  standing law — degradation must be VISIBLE, never success UI for content the server dropped —
  and this branch is its fourth occurrence.
- **Filed, not fixed, and the deferral was reviewed rather than assumed:** the standing proposal
  is not durable — any non-empty model selection replaces it however far it diverges, so Atlas can
  name three filings in prose and store a different two (measured 6/6 turns substituting a file,
  one never named to the analyst). The lane found this ITSELF while verifying its own fix and
  reported it rather than burying it. It is deferred because its fix is the same design question
  that opened a door in each of the two preceding rounds, and it is item 1 of the next intake
  branch (ARCHITECTURE.md §8.6). Also deferred with a checked reason: `ingestFiling`'s upsert key
  needs DDL, so it travels with the publication-date column in the MAYA phase.
- **Verification.** Two independent gates per round — a cold `atlas-reviewer` on a worktree pinned
  at the reviewed commit (never the live lane's checkout) plus the supervisor's own pass — for
  three rounds; rounds 1 and 2 returned CHANGES and were NOT merged. Battery on the real merge
  result, which was byte-identical to the reviewed commit because the merge-base was main's tip:
  **556/556 tests across 63 files · tsc exit 0 · build green · Middleware 81.8 kB**. 69 commits.
  Migration 020 retires two indexes migration 018 had created in error — applied by the founder by
  hand, because `drop index` is hook-blocked on both doors and the guard has no approval override.

## 2026-08-02 — Projects backend SHIPPED (Lane M): a project is real, its chats persist, and `getSession()` is gone

- **Projects stopped being demo state.** `projects` + `project_sources` are real tables under
  the ownership law in `.claude/rules/db.md` (FK to `auth.users`, RLS with both `USING` and
  `WITH CHECK`, owner index), served by four `/api/projects*` routes and a split domain layer
  (`lib/projects/` validate · derive · present · client). A project you create, name, give
  instructions and memory to, and hang context sources off, is still yours on reload.
- **Project-scoped chat works end to end**, driven by the ONE chat engine rather than a second
  implementation: `ProjectChat` mounts `ChatView` with a `projectId` and receives `{send,
  sending, open}` back through `renderMain`. The project's instructions/memory/sources are
  injected server-side (`lib/chat/projectContext.ts`) and the conversation row is stamped with
  `project_id`. Verified signed-in in the founder's browser: sent a Hebrew message inside a
  project, got a Hebrew answer, left the page, and reopened the conversation from the project's
  own list. Console clean.
- **`getSession()` is gone from `src` and must stay gone** — all five call sites now use the
  verifying `getUser()` via `src/lib/auth/verifyUser.ts`. This was THE top item in
  `docs/V1-SECURITY-AND-LAUNCH-NOTES.md`; the forged-cookie hole is closed. It does **not** make
  the data layer safe: `supabaseAdmin` still bypasses RLS in every `lib/db/` module except
  `projects.ts`, which is the pattern to copy.
- **The database link is a COMPOSITE key, and that was the DDL gate paying for itself.** The
  spec's `project_id → projects(id)` was rejected as a file, before application, because it
  constrains *which* project but not *whose*; the applied shape is `(project_id, user_id) →
  projects (id, user_id)`. `rules/db.md`'s "review DDL before applying" rule caught this on the
  one class of change that cannot be reverted afterwards.
- **⚠️ Deleting a project permanently deletes every chat inside it** (`ON DELETE CASCADE`,
  founder-countersigned). The signature was given against an evidence file stating that no
  project chat could exist yet — true when written, false three commits later. Corrected in
  place at merge rather than reworded, and re-confirmed with the founder. Nothing yet
  demonstrates the cascade; it is asserted from the schema.
- **The bubble-alignment collision, resolved to the founder's decision.** Two branches
  independently fixed the same bug (a logical `ms-auto` on a `dir="auto"` element resolves
  against the element's *own* direction, so one Hebrew message jumped sides). Lane M moved the
  choice to the container with `justify-end`; that is *also* logical, so under `<html dir="rtl">`
  it lands left. Merged as physical (`ml-auto`, `rounded-br`) keeping Lane M's `<bdi>` isolation.
  Measured in both locales: `gapToRowRight: 0`, 4px corner bottom-right, inner `<bdi>` still RTL.
- **Merged with known follow-ups, deliberately.** The reviewer filed 19 findings; the evidence
  BLOCKER and the two worst user-facing defects are fixed, the rest (a truncation header nobody
  reads, a `contextChars()` undercount, a blank-source count, a swallowed project-context
  failure, and a missing test for the chat wiring) are filed in `ready-queue.md` as Lane M's next
  task. Battery at merge: 191/191 · tsc clean · build green.

---

## 2026-08-01 — Projects · Workspace · Agents SHIPPED as FRONTEND (Lane F; 3 review rounds), and transcripts became the shared corpus

- **The three surfaces are in, and they are deliberately backend-less.** Projects (inside the
  chat shell), Workspace (picker → shell → working document → detail column) and Agents (list,
  dock, create-agent) are real navigable Next.js routes in both locales, fed by typed stub
  modules so a backend chapter swaps the module instead of rebuilding the page. Nothing
  persists. The founder's scope call is what made this shippable: *"everything the reviewer
  said we don't have code to is completely fine since this is only a frontend import."*
- **The distinction that decided 24 findings, and is worth keeping:** "we haven't built the
  backend yet" is fine in a UI-import chapter; "the UI tells the user something untrue" is
  not, and needs no backend to fix — it is a label, a locale string, or an attribute. Five
  findings were of the second kind and were fixed before merge: a document claiming "Saved
  just now" while saving nothing, a fabricated Hebrew quote from a NAMED real TASE executive
  carrying an English-only deletable marker, two radios selecting at once, a `dir="ltr"`
  reversing a Hebrew sentence, and a send button that threw a swallowed TypeError.
- **Three rounds went to ONE element** — that fabricated quote. Round 1: the marker was
  hardcoded English, invisible to a Hebrew reader. Round 2: the fix moved it outside
  `contentEditable`, which put it at the top of a scrolling pane, and `window.print()` clipped
  to scroll offset and exported the quote unmarked — a regression, proven with a real Chromium
  `page.pdf()`, not argued. Round 3: bidi isolation on the mixed-direction `<cite>`, plus three
  false claims in the evidence file corrected. Export as PDF is now disabled outright; a correct
  Hebrew PDF needs a server-side render, which is a feature, not a stopgap.
- **transcripts stopped being a per-user table.** It held two products at once: 30 rows with
  `user_id NULL` (Atlas's shared company calls) and 30 owned by three users (Timlul's personal
  transcriptions). Its only policy was `auth.uid() = user_id`, which against NULL is not true —
  so the shared corpus was invisible to every user under RLS and reached the app *only* through
  the service-role bypass. Migration `20260801_014` adds a shared-read policy (additive; no
  policy touched or dropped). `getUserTranscripts()` deleted so the wrong model stops being
  available to copy. **`transcripts.user_id` is still load-bearing for WRITES** — it is the one
  shared-corpus table carrying a user_id, history rather than design, and new shared tables
  must not copy it.
- **The data model is now written down** (`docs/DATA-MODEL.md`, founder decision): shared corpus
  (one copy, any signed-in user reads, no `user_id`) vs personal layer (`user_id NOT NULL`
  REFERENCES `auth.users`, RLS on both USING and WITH CHECK). The smart layer reads shared and
  writes personal. `.claude/rules/db.md` gains the four things every new user-facing table needs
  at CREATE TABLE — because half the existing schema is the bad half: five tables have
  `user_id NOT NULL` with **no foreign key at all**.
- **Process lesson graduated:** DDL against the shared DB must be reviewed BEFORE it is applied.
  Migration 014 was applied first and reviewed second, and since narrowing a policy needs
  hook-blocked `DROP`/`ALTER`, a "narrow the scope" verdict would have been unactionable by
  design. It is the one change class that cannot be reverted, and it had the weakest gate.
- Battery on merged main: **160/160 tests** (108 before this chapter) · `tsc` clean · build green.

---

## 2026-08-01 — The login gate SHIPPED (supervisor; 5 reviewer rounds, 38 findings)

**Status:** merged to `main` (`f05b659`) + pushed. `/app/*` and `/print/*` now require a session.
Until today the pages were open: typing `/app/home` walked you in, and `/print/[id]`
server-rendered a whole transcript to anyone holding the URL.

- **What shipped:** `src/middleware.ts` (matcher-scoped, `getUser()` so the token is revalidated
  rather than the cookie believed) + pure unit-tested `src/lib/auth/gate.ts` + `?next=` return-to
  in `LoginForm`. `GET /api/live/finished-call/[id]` gained auth in the same branch — it returned
  the identical transcript payload, so gating the page alone had closed nothing.
- **The reviewer found 3 BLOCKERs in the supervisor's own code**, all reproduced before fixing:
  the open-redirect guard was defeated by backslash/tab/CR smuggling (`/\evil.com` → off-site);
  the `/print` leak was still reachable via API; and the evidence file certified as safe a route
  whose auth doesn't verify. Later rounds found a `javascript:`-scheme redirect and a
  chained-proxy `https,http` value that made `new URL()` **throw inside middleware — a 500 on
  every gated route**. Final state: 79 redirect payloads and 765 host×scheme combinations, zero
  escapes.
- **🔴 The real finding, deliberately NOT fixed here:** `getSession()` reads the user out of the
  cookie — shape check plus a cookie-supplied `expires_at`, no signature check, no network call
  — and it backs `getRequestUserId`, `getCurrentUser` and `requireAdmin`. A forged cookie passes,
  and the routes then query with the service-role client, bypassing RLS. Switching those three to
  `getUser()` is now item 0 of `docs/V1-SECURITY-AND-LAUNCH-NOTES.md` and the 🔴 entry at the top
  of `.claude/rules/app.md`. It changes the auth path of every request and wanted its own branch.
- **Process lesson, earned the hard way:** zero code defects survived, but the DOC SWEEP FAILED
  FOUR TIMES — each round I corrected the files I remembered rather than grepping the falsified
  claim. The sharpest miss was last: `agent-memory/` is git-ignored, so a tracked-file sweep is
  blind to the documents a new session is *born* from — and `state-frontend.md` was still teaching
  Lane F a screenshot recipe this branch invalidated, where an anonymous capture silently yields
  a picture of the login page and passes review as evidence. Both rules graduated into `/ship`.

---

## 2026-08-01 — Design round 2 "Harvey" SHIPPED (Lane F; reviewer-APPROVED after one fix round)

**Status:** merged to `main` (`e977823`) + pushed. 16 commits, 52 files. The founder's second
Claude Design round imported app-wide: ONE light theme replaces the whole theme-cycle system.

- **The theme cycle is gone.** `data-scheme`/`atlas-scheme` and the dark-call token family
  (`callDark`…`callFaint`) are removed; call views are now light like the rest of the app, with
  a one-shot `localStorage` migration in `NavRail` for users carrying an old scheme. A 100-hex
  warm→Harvey sweep was driven by the design's OWN translation table (`Atlas MVP.dc.html`
  line 154), not by eye. New: `lib/live/snipBridge.ts` (TDD) moves the Pinge snip scissors into
  the Ask Atlas composer, so both entry points arm the same crop.
- **One deliberate deviation from the design, on the record:** the import's `railText` `#6B6862`
  scored ~3.6:1 on the `#0A0A0A` rail — under WCAG AA. Founder decision: legibility wins.
  Shipped `#85817A` = **5.109:1**, verified by real luminance math (`probe/rail-contrast.json`),
  recorded at the token so a future parity probe does not "fix" it back to the design value.
- **Verification (two-gate, two rounds):** round 1 returned CHANGES — 1 BLOCKER + 7 WARNING +
  6 NIT, all 14 filed to the ready queue. The BLOCKER was an *evidence-integrity* failure, not a
  code bug: the verification file cited a screenshot for "Ask Atlas panel visible" in which the
  panel is closed, and the branch's headline surface had no committed visual evidence at all.
  Lane F fixed all 14, captured the panel open in EN **and** HE, and closed both residuals it had
  honestly carried (Gemini round-trip from a real snip; live surfaces run against a real `:8788`
  replay engine). Round 2: APPROVED. Supervisor battery on merged main: 108/108 · tsc · build.
- **Lesson filed:** two sessions were live on this branch at once and the supervisor killed the
  lane's dev server after asking the founder whether the port was "leftover" — a question the
  founder cannot answer. The supervisor must detect a live lane itself before touching anything
  in another worktree. No work was lost. See `agent-memory/cross-cutting.md` 2026-07-31.

---

## 2026-07-23 — Review-warnings sweep SHIPPED (Lane M; reviewer-APPROVED, zero findings)

**Status:** merged to `main` (`78af6fe`) + pushed. All 6 earmarked reviewer WARNINGs from
the pinge + multiview verdicts fixed in one small branch (4 commits, 14 files) — deliberately
merged BEFORE the founder's new app-wide design round lands on the same surfaces.

- **Chat history hygiene:** snip-only sends no longer poison follow-ups into silent GPT-4.1
  fallback — new pure `lib/chat/history.ts` `sanitizeHistory` (drops empty turns, prefers
  `apiContent` = what the model actually received), applied client-side AND on the untrusted
  body in `/api/chat`. Behaviorally probed against real Gemini (pre-fix history 400'd).
- **Silent degradation made visible** (the rules/app.md defect class): oversized snips now
  refused client-side with a toast (same constant + arithmetic as the server cap — no drift
  possible) · live view toasts snip-capture failures · stub report card carries a
  demo-content pill in both locales (covers no-doc, fetch-error, and 401 paths).
- **Supply-chain fix:** `pdfjs-dist` pinned exact `5.4.296` as a direct dependency, matching
  the committed `public/pdf.min.mjs` copies (was transitive via pdf-parse — a bump would
  have silently desynced viewer and ingest).
- **Verification (two-gate):** atlas-reviewer APPROVED with ZERO findings — verified each
  fix against the original finding text, re-ran 104/104 + tsc itself · supervisor battery
  independent on branch AND merged main: 104/104 (5 new TDD tests) · tsc · build ·
  evidence `docs/evidence/fix-review-warnings/`.

---

## 2026-07-23 — Pinge (snip-to-chat) SHIPPED (Lane M; reviewer-APPROVED, founder one-look passed)

**Status:** merged to `main` (`2d6d409`) + pushed. Same-day founder-brainstormed feature
(2026-07-17: brainstorm → spec → 9-task TDD plan → build → verify): financial tables are
miserable as extracted text, so users snip them **as pixels** and Atlas reads the image.
11 commits, 17 files, +2125/−40 on `feat/pinge` (stacked on merged multiview).

- **The chain:** scissors on the Report pane → OS-style drag-rect → offscreen 2× pdf.js
  re-render crop (zoom-proof PNG ≤1600px, no server round-trip) → thumbnail chips in Ask
  Atlas (≤4, ✕-removable) → `/api/chat` gains additive `attachments` (validated in pure
  `lib/chat/attachments.ts`, auth-gated exactly like `documentRef`) → Gemini `inline_data`
  + Hebrew page captions + page-text grounding ride-along (GPT-4.1 fallback: `image_url`).
  Real e2e: streamed answer cited page 6 and read the table digits from the pixels.
- **Marking-UX unified (founder decision):** PDF text-mark no longer auto-opens chat —
  floating Ask-Atlas button when chat is closed, auto-reference when open; same behavior
  for text marks and snips, finished and live views.
- **Verification (two-gate):** atlas-reviewer APPROVED — 0 blockers, 4 WARNINGs + 4 NITs
  filed in ready-queue (headline: snip-only send poisons follow-up history with an empty
  Gemini text part → silent GPT-4.1 downgrade; client never pre-checks the 2MB attachment
  cap → silent server-side strip) · supervisor battery independent on branch AND merged
  main: 99/99 (13 new TDD tests) · tsc · build · evidence `docs/evidence/feat-pinge/`.
  Founder one-look passed 2026-07-23 ("works amazingly") — real-hand drag confirmed.
- **Why merged before the founder's new design round:** the redesign touches the same
  surfaces (chat panel, call view); merging first keeps the import on a clean base.

---

## 2026-07-17 — Multiview M1 SHIPPED (Lane M; reviewer-APPROVED, founder rounds 2–4 included)

**Status:** merged to `main` (`2c2b464`) + pushed. Mission 4.2's first milestone: a REAL
quarterly-report PDF lives beside the transcript — rendered, markable, and Ask-Atlas-able
(the core differentiator). 24 commits, 38 files, +3180/−129 on `feat/multiview-backend`.

- **The chain, end to end:** additive migration `20260714_012` (`company_documents` +
  `document_pages`, RLS, private bucket — applied to the shared DB) → Hebrew-safe per-page
  extraction (y-group → RTL descending-x with LTR-run handling, quirk-case unit tests) →
  idempotent ingest CLI (Tigbur Q1+Q2 2026 seeded, 31/31 pages) → auth-gated `/api/documents`
  + file stream → pdf.js viewer with selectable Hebrew text layer → marked passage seeds
  Ask Atlas with `documentRef`, grounded on stored page text (auth-gated in `/api/chat`).
- **Why pdf.js is committed to `public/`:** Next 14's webpack mangles the pdfjs-dist 5.4 ESM
  bundle; the viewer imports `public/pdf.min.mjs` natively — re-sync both copies on any bump
  (reviewer WARNING filed: declare pdfjs-dist as a direct pinned dep).
- **Founder rounds 2–4 (all filed):** native yellow-wash PDF selection (no doubled glyphs) ·
  zoom 75–200% + pan + auto-recenter + page nav · rail-black audio bar (token change) ·
  bar-close keeps playback · Multi auto-collapses the rail · `usePlayerTimeDerived()` fixed
  hour-long calls freezing (60fps full-tree re-renders) · real Tigbur Q1-2026 call
  (`PyuMxe88e8g_live`, 275 word-timed segments) via new `retranscribe-call.ts`.
- **Also ships:** `scripts/append-log.mjs` — the fleet's sanctioned append-only log door
  (ad-hoc shell appends are classifier-blocked; allow rule in settings.json).
- **Verification (two-gate):** atlas-reviewer APPROVED — 0 blockers, 2 WARNINGs + 4 NITs, all
  filed as FINDINGs in ready-queue (headline: pdfjs-dist undeclared; stub-report fallback on
  fetch error has no demo marker) · supervisor battery independent on branch AND merged main:
  86/86 · tsc · build · eyes-on e2e evidence: `docs/evidence/feat-multiview-backend/`.
  Open founder item: one-look at the new call's audible playback (Chrome defers media in
  never-visible automation windows).

---

## 2026-07-14 — Environment-audit fixes SHIPPED (supervisor; 25/26 findings, reviewer-APPROVED, warnings fixed pre-merge)

**Status:** merged to `main` (`bd49940`) + pushed. Founder-approved execution of the
2026-07-07 cold-context environment audit (report + disposition: `docs/audits/`). Theme: the
environment's self-correction stopped depending on supervisor memory and mood — rituals are
now mechanical, evidence is durable, and append-only is enforced by hooks, not etiquette.

- **Rituals mechanized:** ARCHITECTURE update + plan/spec stamping moved to merge-time /ship
  steps (retirement never fired for seats that roll on); each merge appends a `MERGE` line
  and ≥3 since the last `LINT` line forces /fleet-lint; the lane re-mission path is a written
  runbook (we'll use it for Lane I).
- **Append-only became physics:** settings.json denies Edit/Write on the two logs; the bash
  gate blocks truncation AND (post-review) deletion/copy-over/dd/noclobber — 60-case gate
  suite green. Supervisor got a narrow dated note/graduation-marker exception so stale lane
  sections stop being uncorrectable.
- **Evidence durability:** Lane I's M1 quality report + real-Zoom captures rescued from the
  deletable worktree into `docs/evidence/ivrit-m1/` + `scripts/out/sessions/`; convention
  README; first agent-memory snapshot under `docs/archive/agent-memory-snapshots/`.
- **Drift killed:** ARCHITECTURE caught up with both merges (two engines, 77 tests, full
  harness table); CLAUDE.md two-engine line; VISION's double "Mission 4" disambiguated;
  8 shipped plans/specs stamped; stale pointers in transcript-review/live-test fixed.
- **Verification:** atlas-reviewer APPROVED (4 WARNINGs + 3 NITs — all warnings + 2 nits
  fixed pre-merge, findings filed in ready-queue) · 77/77 + tsc on branch and merged main ·
  reviewer independently probed the hook with 10 bypass payloads. Open: finding 18 —
  Supabase token rotation stays a FOUNDER action.

---

## 2026-07-14 — Claude Design frontend SHIPPED (Lane F; reviewer-APPROVED, founder parity verdict passed)

**Status:** merged to `main` (`69a98be`) + pushed. Mission 3 delivered: the Claude Design
frontend imported as an exact replica — Home, Calendar, Chat, Company, Call view (live +
finished, Single/Multi facet panes with drag-resize gutters), plus new Workspace + Agents
shell pages — then hardened through SEVEN founder-driven parity rounds until the founder's
verdict: "okay its good". 63 files, +4568/−746, 26 commits across feat/frontend-import +
feat/design-parity (stacked, merged together).

- **Why 7 parity rounds:** the first import was visibly worse than the design source; the
  hard-won truths are that the design uses the SYSTEM font stack (not Inter/Calibri) and TWO
  stacks — headlines are an SF Pro Display stack that resolves to Arial on Windows, verified
  byte-identical by canvas `measureText`. Fonts are probed from the rendered page, never
  assumed from bundle CSS.
- **Founder decisions along the way (all filed):** original charcoal player bar kept over the
  design's docked pill; color-scheme toggle restored (Warm/Black-rail/Black+white); transcript
  pane removable in Multi view (beyond the design); call dark bg `#0A0A0A` = rail.
- **Stubs discipline held:** Workspace/Agents/company-extras fed by typed stub modules with
  unit tests (`lib/{workspace,agents,company,calendar,live}/…`), real pages keep real data
  wiring. Live-viewer invariant code untouched (reviewer verified byte-identical fallback path).
- **Verification (two-gate):** atlas-reviewer APPROVED — 0 blockers, 3 WARNINGs + 6 NITs all
  filed as `FINDING` lines in ready-queue.md (headline follow-ups: fake "Q2 2026" quarter
  hardcoded on Home, company overview stub facts need a demo marker before launch, countdown
  `ringSecsRef` should reset on session change) · supervisor battery independent: 77/77 tests,
  tsc, production build — on the branch AND on main post-merge · founder eyes-on gate on :3001.

---

## 2026-07-04 — IVRIT live pipeline M1 SHIPPED (Lane I; reviewer-APPROVED, founder-tested on real Zoom ×2)

**Status:** merged to `main` (`9c6f0e7` + follow-up `e06ca7a`) + pushed. The fleet's first lane
ship. Lane I's mission line delivered: live Hebrew transcription WITHOUT Recall producing the
text — Recall is now an audio tap only (audio-only bot → silence-aligned 20–45s PCM chunks →
RunPod IVRIT → monotonic word-timeline stitcher → engine on :8788 serving the SAME /state+/pcm
contract, so the app viewer runs unchanged).

- **Why chunked-live works:** RunPod ivrit accepts base64 blobs (no storage churn), warm
  ~2.5s per 35s chunk; quality compare vs Recall captions AND a whole-file IVRIT reference
  showed no chunking content loss (divergences = loanword spellings + filler repeats).
- **Real-world proof:** two founder-attended Zoom tests — round 2 end-to-end (19 chunks all
  on time → karaoke → source end → auto finish → Gemini polish → finished-call page).
  Founder verdict: "works really really good".
- **Round 1 found a latent BOTH-pipeline viewer bug** (stale tab mixes two calls): fixed via
  `sessionId` in /state + viewer reset (`liveSessionChanged`), unit-tested with the real repro.
  Reviewer's one WARNING (offline poll fallback could trip that reset) fixed pre-push
  (`e06ca7a`). Invariant graduated to rules/live.md: viewers SURVIVE ENGINE RESTART.
- **End-of-call UX parity was a founder decision** (filed): engine writes the shared
  `broadcast-*` capture files, existing finish flow works unchanged over IVRIT output.
- **Verification:** 64/64 tests (chunker byte-conservation, stitcher monotonicity on a real
  RunPod fixture, session-reset repro) · tsc · build · /verify-app with eyes — run
  independently by the lane, the cold reviewer, AND the supervisor. Follow-ups filed: engine
  ws-reconnect + PCM memory (blocks 2h calls, M2) · mixed-language Whisper fillers (M2) ·
  `tsconfig.scripts.json` so `scripts/**` gets typechecked (repo-wide gap).

---

## 2026-07-03 — Doc-growth guards SHIPPED (reviewer-APPROVED, 1 nit fixed pre-merge)

**Status:** merged to `main` (`5fb8f6b`) + pushed. Founder-ordered after the supervisor's honest
audit of the md structure named the three ways the docs will rot as the fleet scales — each
weakness filed as a lesson, not left in chat.

- **fleet-lint check 8 — PROGRESS.md compaction:** >1000 lines (884 today) → propose era
  compaction to the founder (distill oldest era + archive raw entries; append-only stays law).
- **fleet-lint check 9 + ship retirement step — stale-plan banners:** shipped plans/specs get a
  `STATUS: SHIPPED` historical banner so no future session executes a dead plan. Stamped in
  place, never moved (moves break cross-doc references). One-time sweep stamped all 30 existing
  files; reviewer verified every stamp.
- **fleet-lint check 5 hardened — ARCHITECTURE.md drift bar:** concrete minimum per lint —
  sample ≥5 named paths (must exist) + verify 1 behavioral claim against code.
- Also: `.obsidian/` gitignored (editor config nearly leaked into a commit via `git add -A` —
  lesson graduated into the ship skill: stage explicitly).
- **Check 8 executed same day (founder-initiated):** the June/Timlul era (25 entries, 779
  lines) compacted to the ERA SUMMARY at the bottom; raw entries verbatim in
  `docs/archive/PROGRESS-2026-06-timlul-era.md`. 903 → 187 lines.

---

## 2026-07-02 — Knowledge-compounding upgrades SHIPPED (Karpathy-lens advisory R1-R5)

**Status:** merged to `main` (`e55c6c5`) + pushed, after a two-round atlas-reviewer gate
(CHANGES: 5 findings → all fixed → APPROVED with the reviewer re-running evidence itself).
Advisory source: an independent agent given Karpathy's LLM-wiki doc + the full environment.

- **`/fleet-lint` skill** — the missing "lint" operation: periodic sweep (every 2-3 merges) for
  board-vs-git drift, doc staleness, contradictions, un-graduated lessons, queue hygiene,
  repeated FINDING classes, un-filed decisions. Timing law: lint BEFORE recycling any memory.
- **Nothing evaporates anymore:** reviewer findings persist as greppable `FINDING` lines in
  ready-queue.md (repeat classes graduate into rules); founder decisions file immediately as
  `DECISION` lines in cross-cutting.md (typed prefixes on both logs); nontrivial answers are
  FILED into docs, not spoken ("chat is not storage" — rules/parallel-work.md).
- **Gate fire-test suite checked into the repo** (`.claude/hooks/gate-tests.mjs`, 36 cases) —
  was previously in session-temp scratch, a dangling pointer the reviewer caught. Meta-proof
  moment: the knowledge-consistency branch was itself caught violating its own new rule.
- **Mission 5 design hook planted:** per-company knowledge wiki added to VISION roadmap
  (Karpathy's pattern as Atlas's intelligence layer); Lane M's prompt now shapes the documents
  table + chat context for a future `company_knowledge` interface.
- Advisor's NOT-now list honored: no search infra, no unified log, no metadata/graph frontmatter,
  no cron-lint — foundation first. Obsidian: adopted as founder's read-only dashboard (pin the
  board + logs + PROGRESS in a vault; full graph workflow waits for Mission 5).

---

## 2026-07-02 — Harness audit fixes + brain upgrades SHIPPED (reviewer-APPROVED)

**Status:** merged to `main` (`bf66d79`) + pushed. An unbiased cold audit (founder-ordered) graded
the Mission-2 environment against the harness playbook; all real findings fixed same-day.

- **`atlas-reviewer` agent** (`.claude/agents/`) — independent cold-context reviewer, now a
  mandatory `/ship` gate before any merge (closes "one agent grades its own work"). Its first
  review (of this very branch) returned APPROVED + 8 findings; the 5 actionable ones were fixed
  pre-merge (per-statement SQL checks, rmdir /s coverage, wider MCP matcher, stale db.md ref).
- **Gate v2 guards BOTH DB doors** — Bash and the Supabase MCP tools — with additive-SQL still
  flowing; all audited regex bypasses closed. 35/35 fire-tests. The gate blocked its own author
  twice during this work (a commit message and a heredoc) — enforcement provably model-proof.
- **Board v2:** MISSION section (supervisor = navigator, each lane's line to the north star) +
  append-only `cross-cutting.md` / `ready-queue.md` (collision-proof). **Feature-retirement
  ritual** added to /ship: distill → PROGRESS → archive state → reset seat → intake next feature.
- **Permissions:** `settings.local.json` no longer pre-approves blanket supabase commands
  (was auto-approving resets against the shared DB). CLAUDE.md trimmed to ~430 tokens;
  app gotchas → `rules/app.md`. **Founder action still open: rotate the Supabase token.**
- Accepted, documented limitations: .env-mention false positives are by-design friction;
  symlink read route + branch-names-containing-"main" false positive are known edge cases.

---

## 2026-07-02 — Mission 2 SHIPPED: the Atlas smart environment (fleet harness)

**Status:** merged to `main` and pushed. Spec `docs/superpowers/specs/2026-07-02-smart-environment-design.md`
(founder-approved via interactive brainstorm) · plan `docs/superpowers/plans/2026-07-02-smart-environment.md`.
Built overnight per founder pre-approval; fleet launches in the morning via `docs/LAUNCH-KIT.md`.

- **Two enforcement hooks, fire-tested:** `pre-bash-gate.mjs` (blocks destructive SQL vs the shared
  DB, unsafe `rm -rf`, `.env` shell access, force-push, lane-push-to-main; 15-case matrix; it
  blocked this session's own test command live) and `post-edit-verify.mjs` (prettier + incremental
  tsc on every edit; broken-file test surfaced the exact error). Two real bugs caught by testing:
  lane *branch* pushes must be allowed, and `Atlas-frontend` passed a naive `startsWith` supervisor
  check (path-prefix bug).
- **The shared brain:** `agent-memory/BOARD.md` + per-lane state files — git-ignored, ONE physical
  copy in the main checkout, reached by absolute path from all worktrees (proven: instant
  cross-worktree sync). Harness itself (settings/hooks/rules/skills) now **tracked in git** so
  every worktree runs identical enforcement (was `.claude/*`-ignored — would have shipped lanes
  with no hooks).
- **Context diet:** CLAUDE.md 279→54 lines (standing facts + doc map); vision/roadmap →
  `docs/VISION.md`; gotchas → `.claude/rules/{parallel-work,db,live}.md`. Cold-session dry run
  PASSED: a fresh agent oriented fully from the environment alone (rules, board, ship flow).
- **Skills:** `/verify-app` (self-seeing loop + per-lane recipes) and `/ship` (lane/supervisor
  ritual) — this very merge was `/ship`'s first real run. One-time prettier baseline (134 files,
  behavior-neutral, 45 tests re-verified) so the format hook never creates diff noise.
- **Assets staged for the lanes:** yesterday's real-call capture archived to
  `scripts/out/sessions/2026-07-01-tamis-live/` (Lane I's test bench). Founder drops
  `design-import/` + `local-assets/demo-report.pdf` in the morning (Lane F / Lane M inputs).

---

## 2026-07-02 — Timlul Wave 1 DELETED (clean-start Phase 1) — merged to main, pushed

**Status:** merged to `main` (`bd7a951`) and pushed to `Atlas-app`. −2,584 lines / 29 files, +3 lines.
Verified: `tsc` clean · 45 tests · clean `next build` (34 routes) · founder click-through · **a real
Recall+Zoom live test end-to-end on the cleaned tree** (bot → captions → 4-min buffer → drain →
finish `completed`, correct call: 2026-07-01, 382.6s).

- **Deleted per `LEGACY.md` Wave 1:** legacy routes (`/home /dashboard /companies /processing /transcript`),
  components (`landing dashboard transcript processing companies platform layout`, `ui/Button`, `ui/Badge`),
  orphaned `useProcessingTimer`, and `src/middleware.ts` (its matcher only guarded deleted legacy routes).
- **Login repointed first** (the trap the guard test can't see — string navigation): `LoginForm` +
  `auth/callback` redirected to the legacy `/dashboard` → now land on **`/app/home`**. PROGRESS had
  claimed this was already done; the code disagreed — fixed for real now.
- **Wave 2 gateway kept** (4 files: `/` page, `LoginForm`, `JoinForm`, `dotted-surface`) until Atlas
  has its own login/landing.
- **Flagged for a dedicated pass (not fixed here):** `/app/*` has no middleware auth gate (the deleted
  middleware never covered it either — pre-existing); ARCHITECTURE.md still lists deleted files
  (Phase 4 rewrite covers it).

---

## ERA SUMMARY — 2026-06-07 → 2026-06-27: the Timlul/V1 era (compacted 2026-07-03)

The 25 raw entries of this era (779 lines) live verbatim in
`docs/archive/PROGRESS-2026-06-timlul-era.md`. Below is everything from them that still
governs today. The era's product knowledge already lives in ARCHITECTURE.md, docs/VISION.md
and `.claude/rules/`; its plans/specs are stamped historical.

**The arc:** transcript-quality gate + correction pipeline locked (06-07→06-10) → vision
level-up to the institutional platform (06-10) → V1 scoped + data layer seeded (06-11) →
transcript experience + chat + design pass (06-13/14) → Railway deploy + first real live
Zoom test (06-14) → rebrand to Atlas (06-15) → live→finished "one call matures" UX
(06-15→17) → live UX polish + keep-LIVE-through-drain (06-18/19) → feat/live-phase2 shipped
after a real 13-min Zoom test (06-20) → Global Live Call, live-tested on a real call
(06-22/26) → shipped to production timlul-ai.com (06-27). Then 07-02: Timlul Wave 1
deleted — clean Atlas start.

**Decisions still in force (dated — references elsewhere resolve here):**
- **2026-06-09/10 — quality-over-metric:** Gemini holistic formatting chosen over GPT-4o
  constrained diff (~40 vs 31 token-errors on the אמפא gold) because analysts read the
  output; deliberate trade-off (referenced from VISION's transcript-quality gate).
- **2026-06-09 — the entity list is the lever, not the model:** Claude Sonnet 4.6 correction
  tested, did not win; the per-company entity DB remains the biggest unexplored quality lever.
- **2026-06-11 — live calls' finished transcripts = Recall raw → Gemini** (no IVRIT
  re-transcription; measured tie, Recall adds speakers/timing free). IVRIT stays for the
  YouTube path. Lane I / Mission 4 deliberately revisits this with our own IVRIT live engine.
- **2026-06-11 — engine bake-off:** Recall-accuracy + Gemini live correction, the 72–188s
  caption delay embraced as the buffer; Gladia kept as a possible "instant mode" (2.7s lag,
  ~25 err/3min); ElevenLabs disqualified (no live events).
- **2026-06-13 — raw-live + polish-after:** no LLM in the live path (scales to concurrent
  calls); Railway chosen for the permanent webhook URL.
- **2026-06-15 — rebrand → Atlas;** only brand-name uses of תמלול renamed — it is also the
  Hebrew noun "transcript", a blind find-replace breaks product vocabulary.
- **2026-06-15 — quotes = anchor, auto-upgrade & deep-link** (not frozen text); build path
  C→A toward "one transcript page, two modes" (the "Thread A" design — raw block in the archive).
- **2026-06-22 — two live bars (Option B):** the live page keeps its in-column bar; the
  global bar appears only after navigating away; both read the same provider.

**Dead ends — do not retry:** source-side IVRIT biasing (proven no-op) · report-as-context
for transcript correction (over-reach + token-burn on both models tested) · Zoom OAuth to
bypass webinar registration (only helps auth-only meetings; registration `tk` links are
single-use — the fix is auto-register → fresh tk → launch bot, see VISION Core 2).

**Tech debt carried out of the era (still open):**
- **No live speaker capture:** live captions render as ONE speakerless block —
  `scripts/live-broadcast.mjs` captures word+timestamp but no participant data, and the
  finished transcript leans on Gemini's proportional speaker turns (06-14/06-16). Production
  fix = capture Recall's per-word participant → real speaker segments. Lane I / Mission 4 territory.
- `LiveAudioProvider` puts 10fps values in React context → consumers re-render 10×/s; port
  `PlayerProvider`'s `useSyncExternalStore` pattern before adding consumers (2026-06-27 review).
- The "call ended → finish pipeline" effect lives on the live PAGE — a user elsewhere at call
  end delays the finish until they return. Fine single-call; fix before report-season concurrency.
- `live.active` doesn't auto-clear when a call goes `over` while the user is away;
  `endedInFlight` sticks on a `failed` polish (treat `failed` like `completed`); recorded +
  live global bars can overlap if both active (all from the 2026-06-27 review, non-blocking).
- `feat/atlas-ui-kit` (design overhaul) still unmerged on origin — reconcile onto Atlas or retire.
- Parked: personal-transcribe (branch `personal-transcribe-parked`; its additive DB columns are
  inert) · Hebrew inside markdown tables pins left · leftover foreign Supabase tables
  (`products` has RLS disabled — founder cleanup advisory).
- Deliberate Feature-1 leftovers: per-company entity DB · IVRIT per-word confidence scores ·
  per-line `startSec`.

## 2026-08-03 — API auth closed and made structural (`fix/api-security`, supervisor)

- **Every API handler now requires a signed-in user.** Three methods had no auth at all — both
  `PATCH /api/transcripts/[id]/{speakers,diarization}` (they write via `supabaseAdmin`, which
  bypasses RLS; diarization rebuilds a transcript's whole speaker attribution from one call) and
  `GET`+`POST /api/live/finish` (POST fires the paid finish pipeline). `POST /api/chat` resolved a
  user only when a document or snip was attached, so a plain question — the common case — ran
  anonymously against the founder's model key.
- **The shared-identity fallback is gone, and the documented count was wrong.** Our own notes said
  `DEMO_USER_ID` was in "two routes"; `grep` said 16 sites across 8 route files, plus two SERVER
  COMPONENTS an API-only sweep could never have found (`app/company/[id]`, `app/calendar`) that
  rendered another identity's quotes and followed calls as the visitor's own. The constant is now
  DELETED, so nothing can re-import it.
- **The durable part is a test, not the patches.** `src/lib/apiAuthBoundary.test.ts` brace-matches
  every exported handler under `src/app/api` and fails the battery for any that resolves no user —
  or resolves one and never acts on the result — with a `PUBLIC` allowlist where each entry must
  state its reason. These holes were months of drift, not one mistake, so a per-route fix would
  have rotted the same way.
- **Two review rounds, and both earned their keep.** Round 1 returned CHANGES on a BLOCKER *in the
  guard*: it matched the mere presence of an auth call, so a route that asked who you were and
  ignored the answer passed. Round 2 APPROVED but proved four more ways to fool it — a comment
  quoting the auth call, a re-exported handler, an unbound `401` token, and a regex literal that
  blanked the rest of the file. All fixed and re-proved by adversarial fixture. Twice the branch
  filed the "a claim comes from a command, not another document" lesson and then violated it in
  its own commit message.
- **Verified in both directions in a real browser** — anonymous 401 on every gated route including
  `POST /api/conversations` and `POST /api/chat`, signed-in 200 with a real Hebrew answer, and a
  follow/unfollow round trip that left no rows behind. `POST /api/live/finish` was deliberately NOT
  fired anonymously: a failed guard would have spent money and written to the database shared with
  deployed Timlul. Evidence: `docs/evidence/fix-api-security/`.
- **NOT claimed closed** — `/api/chat` still has no rate limit or size cap and `getChatContext`
  still spans all companies (now any-member rather than anonymous); `GET /api/live/{state,pcm}`
  stay anonymous and must be gated **before `LIVE_ENGINE_URL` is ever set on a deploy**, since the
  "localhost-only engine" mitigation was false; and every `lib/db` module except `projects.ts`
  still queries through `supabaseAdmin`, so authentication is not yet authorisation.
- Battery on merged main: **194/194 · tsc exit 0 · build green**. Merge `164c892`.

## 2026-08-03 — `fix/projects-honesty` merged (`af85deb`): the UI stops saying untrue things

Lane M's Projects debt round, finished by the supervisor across four cold review rounds because the
founder chose not to interrupt a live Workspace lane to do it.

**What changed for a user.** An error is no longer rendered as Atlas's answer, and a save failure no
longer destroys an answer that already arrived. The "answered without your project's full context"
notice and the "this answer was cut off" fact are both persisted, so one page refresh no longer
turns a degraded answer into a confident complete one. An expired session offers a route back to
sign-in instead of the bare word `unauthorized` under a heading blaming the wrong thing. Opening a
slow conversation can no longer silently replace a newer one on screen. And `POST /api/conversations`
refuses an unidentified caller instead of writing rows under a shared demo identity.

**The decision worth recording is the one about verification, not the code.**

Four gates ran. Three found a BLOCKER in the supervisor's own work; the fourth found none, and that
convergence — not fatigue — is what the merge decision rested on. Each blocker was created by the
previous round's fix, which is the pattern the fourth round was explicitly pointed at.

Three lessons graduated to `ready-queue.md`, all sharper versions of rules this repo already had:

1. **A command answers the question you typed, not the question you meant.** The standing rule "a
   count comes from a command, never from another document" was FOLLOWED and still produced a false
   claim: coverage of a new sign-in branch was checked with a grep for the PROP, and half the sites
   had the prop while being unable to use it. When the claim is about behaviour, the check must
   execute the behaviour.
2. **Close a lesson for its class, not its instance.** One unregistered test file was fixed as one
   file; the next round found two more that had never run. Both directions are now enforced by
   `testRegistry.test.ts`.
3. **A guard is worthless until it has been seen to fail.** The guard written to prevent recurrence
   passed on the reintroduced bug, because it matched an identifier inside a comment — the same
   defect `apiAuthBoundary.test.ts` had been fixed for days earlier. Every guard added here was
   proven to bite before being trusted.

**Deliberately not fixed, and filed with its remedy:** `/api/chat` fabricates an answer at three
sites when the model returns nothing or is unconfigured, and the server cannot tell the client a
stream ended early (the token cap ends it with a clean close; nothing checks `finishReason`). The
honest fix changes the path every user hits and could not be verified without stubbing the upstream.
Shipping that reasoned-only at round four is how a fifth round starts.

Battery on merged main: **229/229 across 37 files · tsc exit 0 · build green · Middleware 81.8 kB**.
`feat/workspace-backend` deleted, both tips verified contained first. Next: Railway.

## 2026-08-09 — MAYA becomes the calendar and the company page, and the invented facts go

`a94f33d` on main. One linear unit: `feat/maya-calendar` → `feat/company-profiles` (a strict
superset of it) → the supervisor's `fix/calendar-empty-state`. Battery on the merge result:
**610 tests / 0 fail · tsc exit 0 · build green · Middleware 81.8 kB**.

- **The MAYA report schedule is now Atlas's calendar.** 234 companies (was 5) and 891 synced
  events, under migration `021`'s natural key — the schedule feed ships no row id, and
  `scheduled_calls` had no unique constraint of any kind, so a second sync would have duplicated
  every row with `DELETE` hook-blocked. Additive-only against the shared production DB, reviewed
  as a FILE before it was applied per `rules/db.md`; that gate caught two things that would have
  been PERMANENT. Sync run twice in full: identical counts, zero duplicates.
- **A time nobody published is never displayed.** Conference calls carry a time in 452 of 453 rows,
  report publications in 0 of 472, and `scheduled_at` is NOT NULL — so a publication has to be
  stored at *some* instant. `time_known` makes that visible instead of letting midnight pose as an
  appointment. The invariant is structural rather than asserted: all 467 report rows carry
  `time_known=false`, so a report *cannot* render a clock.
- **Real company identity, from one `company-details` call.** sector / sub-sector / description
  234 of 234, website 211, logo 220. No migration — the columns already existed and
  `lib/db/companies.ts` already read all five; the page had been rendering `sector` against nulls
  the whole time. Never overwrites a human-written value, per FIELD not per row.
- **The fabricated company facts were removed, not badged** — `lib/company/overview-stub.ts` and
  the hardcoded `"Q2 2026"` call sites. That closes the FINDING filed 2026-07-14 the way the
  founder asked (*"let us remove all of this mock data"*): with a real feed, not a demo marker.
  One issuer had also been wearing another company's logo for months — a name-substring guess that
  fired only for companies with no logo, i.e. exactly the ones that could be given the wrong one.

**What it cost, which is the part worth keeping.** Four review rounds on a single sentence: the
calendar's empty state saying *"Nothing scheduled this month"* over months holding real events.
Each fix opened the next door. (1) The guard was a JSX condition, `kinds.size > 0`, that could
never be false — the filter set is seeded with all three kinds and webinars have no rows, so the
webinar chip is never drawn and never removable. (2) The fix moved the decision into one testable
function — correct — and fed it a PROXY, whole-feed kinds rather than this month's contents, so it
still lied whenever a month's events were all of the filtered-away kind (`2026-11` holds 2 reports
and 0 calls; that month reproduced it). (3) The test written beside it ASSERTED that outcome, so
the battery defended the defect. (4) The supervisor's fix for all of it then said the same untrue
thing in "My calendar", where the counts cover only followed calls.

It closed on two moves: giving the function the two counts it is actually deciding between
(`visibleCount`, `monthTotal`) so no vocabulary or set arithmetic can drift from the screen, and
**rendering every state in a browser instead of reasoning about them** — nine states, both locales,
console clean (`docs/evidence/fix-calendar-empty-state/`). Round 4 was found by a cold reader; 610
green tests, a clean typecheck and a green build all sailed past it.

**The lesson, filed to `rules/app.md` as an addendum to the choke-point rule: a choke point is only
as honest as its inputs.** Given a proxy for the fact it is deciding about it will decide
confidently and wrongly, and the test written beside it will make that permanent.

Also swept at merge: `ARCHITECTURE.md`'s test enumeration had rotted to 38 names against 65
registered (every `maya/*` and `workspace/*` chapter invisible, plus one phantom file) beneath a
sentence promising it was machine-generated by a script that has never existed. Regenerated, with
the actual command inline. Three separate counts in this chapter were hand-carried and wrong —
including two written while correcting other counts.

## 2026-08-09 (later) — production was telling the wrong time, and only the deployed site could say so

`796fdbd` on main, a hotfix merged the same day as the chapter above. Battery **618/618 under
BOTH `TZ=UTC` and `Asia/Jerusalem`** · tsc 0 · build green.

- **The bug:** `www.timlul-ai.com/app/home` listed every investor call **three hours early**.
  יעקב פיננסים read 07:00 for a call the database puts at 10:00 Israel time — while the calendar,
  in the same session, rendered the same event as 10:00.
- **The mechanism, which is the part worth keeping:** the formatters pinned no `timeZone`, so they
  used the runtime's. Home is a **Server Component** — it formatted on Railway in UTC and handed
  the browser a finished string the browser never re-formats. The calendar is a client component
  and formatted correctly. **The bug could not be seen on any machine it was developed on, because
  they are all in Israel**, and it was invisible to tsc, to the build, and to 610 passing tests.
- **Founder decision:** Israel time for every viewer, everywhere. `ISRAEL_TZ` is pinned in
  `lib/i18n/format.ts`, and `israelDayKey`/`israelMonthParts` now bucket the calendar — which also
  closes the long-documented limit that report dates landed a day early outside Israel.
- **Verified, not asserted:** a cold gate ported the implementation to plain JS and ran it under six
  timezones (14/14 each), confirmed 7 of 8 tests go red on the pre-fix code under UTC, and
  simulated 2,473 hourly instants against the calendar grid looking for events that would fall into
  no cell — zero. Browser check against a server deliberately run as UTC: server-rendered HTML now
  reads 10:00/11:00/12:00/15:30, matching the DB, Home and calendar agreeing.
- **Left open ON PURPOSE and scheduled, not deferred:** the calendar's today-pill and
  `CompanyOverview.isFuture` still read the viewer's local midnight, `lib/db/calls.ts`
  `scope:'upcoming'` floors at UTC midnight, and this branch shipped without a `docs/evidence/`
  folder. All filed by the gate; none affects an Israeli viewer, which is why the wrong time went
  first.

**The lesson, filed to `rules/app.md`: never format an instant without a timeZone, and run the
battery under `TZ=UTC` as well as locally.** A test that only ever runs in one environment asserts
that environment, not the property. Every gate in this repo was green while the live product was
wrong about the single number it exists to publish — and the only thing that found it was opening
the deployed site and comparing two pages against the database.

---

## 2026-08-09 — The documents catalog: the loop closed, and the invented slides deleted

`feat/documents-catalog` (Lane M, 12 commits) → main `47bf674`, with merge-time fixes in `227edd5`.
Reviewed cold by `atlas-reviewer`: **CHANGES, no blockers**.

- **What it does:** a company page now lists the fiscal years it filed in; a year opens to
  Q1/Q2/Q3/Annual (the Israeli filing calendar has no Q4); a period opens report + presentation +
  transcript-if-any into the **same `LiveTranscriptView` a live call uses** — so Ask Atlas, the
  snipping scissors, page navigation, zoom and Single/Multi came for free rather than being rebuilt.
  Back-navigation returns to the open drill-down because the year and period live in the URL.
- **No schema, and that is what made it shippable today.** No new table, no new column, no
  migration — verified by command, not by claim (`git diff --name-only main...HEAD -- supabase/`
  is empty; no DDL in any added line). The catalog lists **live** from MAYA and stores one PDF only
  when a user opens it, through the `ingestFiling` path Workspace already ran. **So the screen is
  also Atlas's ingestion path**: every document a user opens becomes corpus, correctly attributed
  to its company — which fills the corpus with exactly the documents real users want. The founder's
  tiebreaker for the chapter, filed verbatim: *the goal is the best possible user experience; the
  corpus is a by-product, never the objective.*
- **`slideStubs()` and `reportStub()` are DELETED, not gated.** Four invented Hebrew slides about
  אפגלו and Gulf sovereign wealth funds had been rendering for **every call of every company on the
  live host**. The two panes are now one implementation ending in exactly three states —
  loading · error · noDocument — so a deck gets the real PDF viewer it never had, and a failure
  says which failure it was. This closes the FINDING of 2026-07-17 the right way: the fallback has
  no fabricated content left to fall back to.
- **Three defects the lane found by looking rather than by testing**, all in the evidence:
  `formatDate('')` threw `RangeError` and **500'd the whole period route for any period with no
  transcript** — the common case, since 5 of 895 events carry an attributed transcript — and it was
  invisible to 652 passing tests, a clean tsc and a green build because it lived in a state nobody
  had rendered. A Hebrew publication date read "במרץ 31 2024". And a scripted edit silently did not
  apply against a CRLF working tree while its commit message asserted it had.
- **Two pre-existing bugs fixed in passing**, both on the return path: `?tab=reports` was
  unreachable by URL, and `listCompanyTranscripts` took the UTC day off `created_at`, so a
  transcript created 00:00–03:00 Israel rendered a day early — on these very rows. That was the
  last user-visible survivor of the timezone class filed this morning.
- **Fixed at merge, by the supervisor:** the `<bdi>` rule's **5th, 6th and 7th occurrences**. The
  lane fixed the construct in `DocumentsTab` and wrote a careful comment about it, while the
  identical `dir="ltr"` sat on the transcript viewer's identity header — the one the new period
  page feeds a publication date into — so the catalog's headline screen rendered "ביולי 2026 16".
  Grepping the *construct* rather than the *component* then found two more: the live-call header
  and the company page's latest-call date. Also normalized both i18n dictionaries back to LF; the
  branch had committed them CRLF with a bare `\r` welding two keys onto one line, turning a
  30-line change into 2774 lines of diff.
- **Verified:** battery **652/652 in three genuinely applied timezones** (Asia/Jerusalem, UTC,
  America/New_York — set from PowerShell with the resolved zone printed inside each run, because a
  `TZ=` value containing a slash is silently dropped in Git Bash). `tsc` exit 0 · build green ·
  `/app/company/[id]/period/[period]` compiled · Middleware 81.8 kB unchanged. Eyes-on in Hebrew on
  a real company: transcript + the real 41-page deck + the real 31-page report, console clean —
  and the bidi fix proved by **mutation in the live DOM**: restoring `dir="ltr"` on the element
  re-garbles the date to "ביולי 2026 16", so the fix demonstrably changes rendering rather than
  merely looking correct.

**The lesson, filed to `rules/app.md`: when you fix a bidi defect, grep the whole repo for the
CONSTRUCT, not the component — and prove the fix RENDERS differently.** A `<bdi>` that changes
nothing looks exactly like a `<bdi>` that fixes everything. Fixing one instance is what hid the
other three; `git grep -n 'dir="ltr"' -- src` found them in seconds.

## 2026-08-13 — Speaker edits are admin-only corpus curation (`fix/speaker-edit-admin-gate`)

Smart-layer ticket 12, founder-decided ("1A 2A Q3 okay q4 a", `DECISIONS.md` 2026-08-13), then
the live hole fixed in the same session.

- **The defect:** `PATCH /api/transcripts/[id]/speakers` and `.../diarization` accepted ANY
  signed-in user — one user could relabel who-said-what on any transcript, and the speakers
  path rewrote the `speaker` field on **every user's saved quotes** via `renameSpeakerInQuotes`
  with caller-chosen text. Both routes passed `apiAuthBoundary.test.ts`, which proves a user was
  *resolved*, not *allowed* — precisely the gap the foundation review (ticket 03) flagged.
- **The law (new, `docs/DATA-MODEL.md`):** writes to shared-corpus rows are **curation**,
  admin-gated; personal rows are owner-only; the one sanctioned exception is corrections flowing
  from corpus curation into derived personal data (the quotes propagation — now a feature, since
  only admins can trigger it).
- **The fix:** shared `requireAdmin(req)` in `src/lib/auth.ts` (401 no user / 403 non-admin /
  null pass); both routes delegate as their first statement; `LiveTranscriptView` gained an
  `isAdmin` prop (threaded from `getCurrentUser()` on both server pages and through
  `LiveSession`) so non-admins never see an edit pencil that can only 403; `renameSpeaker` in
  the view now checks `res.ok` instead of toasting "saved" on a refusal.
- **The mechanism (ADR-0002):** new `src/lib/curationAuthz.test.ts` — a structural guard listing
  the curation routes and failing the battery unless each imports and delegates to
  `requireAdmin`, with the one-handler-per-file premise pinned. Registered in `npm test`
  (the test-registry guard caught the unregistered file on the first run).
- **Verified:** 702/702 · `tsc` clean · anonymous PATCH → 401 on both routes (curl) · admin
  session passes the gate (400 validation, no write) · pencil visible + edit mode toggles as
  admin, console clean · non-admin 403/hidden-pencil states NOT browser-driven (no non-admin
  credential; limit stated in `docs/evidence/fix-speaker-edit-admin-gate/`). STATUS.md rewrite
  also brought the always-on set back under its 9,000-token budget, which main's battery had
  been failing since the ticket-11 rewrite.

## 2026-08-13 — Slice A1: the smart layer's foundations are in the database (`feat/smart-layer-foundations`)

- **What:** the six founder-approved foundations migrations (spec §6 slice A1) are applied to
  production: pgvector; `company_aliases` (the resolver's table); `document_chunks` (dual-form
  `tsvector` via the new immutable `atlas_dual_tsv()`, HNSW + GIN, exactly-one-source and
  anchors-match-source CHECKs, generated `source_type`); `filing_facts` (UNIQUE NULLS NOT
  DISTINCT per fact); `company_documents.publication_date`; `transcripts` identity
  (`source_key` + partial UNIQUE, `revision`, `CHECK (company_id IS NOT NULL) NOT VALID`).
- **Why:** Phase A of the smart-layer build — the corpus becomes searchable. Every shape is the
  measured one (eval findings 2/4/6/7); the born-attributed law now lives at the DB, so an
  unattributed transcript insert fails visibly instead of minting a row search can't reach.
- **Gate followed:** files → atlas-reviewer on the files (APPROVED) → COLLISIONS.md → founder
  told in-session → applied via MCP. Live-DB facts verified first (PG 17.6, 5/5 transcripts
  attributed); spec's `company_id bigint` corrected to uuid against the real `companies.id`.
- **Review finding → mechanism (ADR-0002):** the third occurrence of "gating changes every
  caller's error path" (finishLiveCall's stub upserts discarded `{ error }`) bought
  `src/lib/supabaseWriteDiscipline.test.ts` — any awaited supabase write whose result nothing
  reads now fails the battery, per-file ratchet with reasons. Two real defects fixed by the
  scan on the way: admin approve/reject answered `ok:true` on a refused status write;
  `/api/transcripts`' company-link update was unread.
- **Verified:** 706/706 · `tsc` clean · post-apply SQL probes: RLS enabled + single
  SELECT-to-authenticated policy on all three new tables (banned shape nowhere), constraint
  honestly NOT VALID, and an unattributed insert probe REFUSED (23514). Retired map archived
  verbatim to `docs/archive/scratch/2026-08-13-smart-layer/`.

## 2026-08-13 — The gate re-measures the Verified count (`feat/ship-gate-verified-counts`)

- **What:** `npm run ship:gate` now runs the battery itself whenever a branch's new
  PROGRESS entry claims a `Verified: N/N` count, and refuses the merge if the claim
  disagrees with what it just measured. Fails closed on an unparsable run; costs nothing
  when the entry points at the command instead of quoting a number.
- **Why:** founder decision 2026-08-13 (DECISIONS.md, "let's do what you suggested") after
  M1's count-carrying clause fired twice on the A1 branch — a stale "706/706" and a stale
  token figure, both true when written, both false at the tip. M1 is a meta-law the
  promotion ritual cannot see (deferred 2026-08-12), so this closes the recurring shape at
  the ritual-gate tier without touching the deferred machinery.
- **Shape:** pure functions in `scripts/lib/ship-gate.mjs` (`verifiedClaims`,
  `parseBatterySummary`, `verifiedCountProblems`), unit-tested through their failing cases
  in `shipGate.test.ts`; the collector only pays for a battery run when a claim exists.
  Claim grammar (stated limit): the first `N/M` pair directly after the word "Verified".
- **Verified:** 712/712 · tsc clean — and this very entry quotes that count on purpose, so
  the check's maiden merge is its own first live firing. (The count moved twice while the
  branch was open — a red intermediate commit, then a review-bought test — and the check
  caught the staleness both times before the ritual did.)

## 2026-08-13 - Slice A2: the company resolver (`feat/smart-layer-a2-company-resolver`)

- **What:** `resolveCompany()` (`src/lib/company/resolve.ts`) resolves user language -
  registered name, abbreviation, ticker, Latin form - to a `companies.id` over the
  `company_aliases` table A1 created; `buildAliasSeed()` (`src/lib/company/aliasSeed.ts`)
  derives the seed, and `scripts/seed-company-aliases.ts` wrote it: **246 rows over 234
  companies** in production, idempotent (second run inserted 0).
- **Why:** resolving the company FIRST and filtering retrieval by `company_id` was the
  single biggest measured retrieval multiplier (MRR 0.300 - 0.365, spec S2.5); this slice is
  how user language reaches that filter, and it unblocks A3 (ticket 03).
- **The MUST-PASS is green offline** (eval case 14): the seeded chain companies - seed -
  resolver lands `resolveCompany('בז"א')` on בית זיקוק אשדוד (issuer 1361) and keeps it
  distinct from בז"ן (issuer 259) in the same rows; unknowns and ambiguity return null
  honestly. Two-pass matching reuses `maya/issuers.ts`'s proven normalisation + coverage
  rules (its word helpers are now exported).
- **Collisions are decisions:** an alias two companies would share is dropped from BOTH and
  printed for the founder to rule on - the live run reported zero.
- **Review bought a mechanism:** the cold review's WARNING (a re-run whose derivation
  diverges from an already-seeded row was silently swallowed by UNIQUE(alias)) became
  `diffAliasSeedAgainstExisting()` - drift is judged on the normalized form, reported to
  the founder, and never inserted; verified against production (246 seeded, 0 drift).
- **Round-2 recurrence bought reach (ADR-0002):** the re-review caught ARCHITECTURE.md's
  test-count header hand-carried stale - M1's count clause, one branch after the Verified
  re-measure shipped. The gate now also re-measures the "**N tests across M files**"
  header (file count vs package.json for free, total vs the battery run), and its maiden
  firing caught both this header (732 vs 741) and this entry's own previous count (736).
- **Verified:** 741/741 - `tsc` clean - live-table probe (בז"א - 1361, בז"ן/ORL - 259,
  ticker 1105022 - תיגבור) - re-run idempotency probe (0 inserts, 246 total).

## 2026-08-13 - Slice A3: the ingestion birth sequence (`feat/smart-layer-a3-birth-sequence`)

- **What:** every corpus document now takes ONE road in. Transcripts: a single birth door
  (`src/lib/db/transcripts.ts`) where `company_id` + `source_key` are required arguments,
  completion persists REAL per-line timestamps (`corpus/align.ts` - the karaoke alignment,
  run once and stored), revision bumps on re-processing, and chunks rebuild atomically
  (`corpus/reindex.ts` + `atlas_replace_chunks`, migration 028). Filings: `ingestFiling()`
  now records `publication_date`, parses the ת930 XBRL into `filing_facts` (26 ifrs-full
  numerics + ifrs-il metadata) with a visible `facts_status`, and chunks+embeds at birth
  with a visible `index_status`. All MAYA API calls flow through one process-global
  limiter (10 req/2s - the key's whole budget) at the `client.ts` chokepoint.
- **Why:** the standard's laws each needed a MECHANISM (ADR-0002): seven unguarded insert
  paths, sibling `_r`/`_live` ids (the PyuMxe88e8g_live duplicate), hard-coded '00:00:00'
  line times, the dropped publicationDate, and per-call-site pacing were all still live
  defect classes. A4's backfill and every chat surface stand on this.
- **The one-chunker law is at the impossible tier:** the eval harness now imports the
  production chunker (`node --import tsx scripts/retrieval-eval/run.mjs`); the swap
  reproduced the 2026-08-12 lexical results exactly (3202 chunks, 113 windows, L row
  4/15 8/15 0.207, same misses) - the harness certifies the code that ships.
- **The door is battery-guarded:** `transcriptBirthDoor.test.ts` fails any
  `transcripts` insert/upsert - or `formatted_data`/`word_segments` update - outside the
  door module; its maiden run listed all 15 pre-existing violation sites, all migrated.
  Admin force re-transcribe now re-processes the SAME row; `retranscribe-call.ts` lost
  its `--id <new-row-id>` sibling-minting mode.
- **Deferred, said out loud:** the admin SURFACE for `index_status` lands with A5's admin
  view (the column + failure states exist and are tested); the live path still finishes
  into the demo-family row id, which reindex EXCLUDES from the corpus by law - real live
  calls join the corpus when scheduling-born ids land.
- **Review bought two mechanisms (four rounds, all findings closed):** the round-1 WARNING
  (a discarded read error inventing "cannot attribute") became `supabaseReadDiscipline.test.ts`
  and promoted the error-path law partial → mechanism; round 3 caught that promotion's own
  clause overclaiming, so both scans widened to `upload`/`rpc` and the clause shrank to the
  three scanned shapes - M1 in action, filed in the evidence record.
- **Verified:** 787/787 across 85 files - `tsc` clean - `next build` green - harness
  lexical re-run identical - migration 028 reviewed on file (4 rounds) before apply.

## 2026-08-14 - Slice A4: the corpus becomes searchable, and the gate earns its keep (`feat/smart-layer-a4-backfill`)

- **The backfill ran against production, clean.** The existing corpus is through the
  ingestion standard: **3,181 chunks, every one embedded**; 26 documents (not the 23
  estimated) each carrying a real `publication_date`; 1,398 `filing_facts` rows across
  19 filings, with the 7 presentations honestly `none`. The demo transcript and the
  `PyuMxe88e8g_live` duplicate are `excluded`, visibly. Zero failures, ~$0.35.
  `scripts/backfill-corpus.ts` is idempotent, resumable and `--dry-run`-able, and writes
  only through doors that already existed - it owns `source_key` and nothing else.
- **THE GATE DID NOT PASS, WHICH IS WHY IT EXISTS.** `run.mjs --real` scores the
  production module against pgvector + real Postgres. Dense reproduces the measured eval
  (MRR 0.254/0.268, identical hit-sets, בז"א MUST-PASS rank 1); the lexical channel
  collapses 0.207 → 0.075 and drags the CHOSEN hybrid to 0.141, below dense-only. Root
  cause, verified not theorised: Postgres has no IDF - `שנת` is in 96% of chunks and
  scores like `ההכנסות`, in 5% - and BM25-in-SQL reproduces the measured rank exactly.
  A df-threshold substitute was tested and rejected (it discards `תיגבור`).
  `docs/evidence/feat-smart-layer-a4-backfill/gate.md`.
- **Founder call, filed same day:** *"okay yes lets just go with the semantic search
  now"* - retrieval ships DENSE-ONLY, held by a battery test, with the lexical channel
  suspended rather than deleted so his revisit costs a flag. **B1 is unblocked.**
- **Three defects the backfill exposed, all fixed at the choke point:** MAYA's
  `publicationDate` carries no zone (every filing date was being stored 2-3 hours wrong);
  a ת930 instance repeats a concept per SIGNATORY, which cost 19 filings their entire
  fact set behind a visible `facts_status='failed'`; and a transcript with no `source_key`
  could still be chunked.
- **Review bought two mechanisms (three rounds):** the pgvector post-filter blocker
  promoted `Degradation must be VISIBLE` none → partially (`retrieveChunks` returns
  per-channel `{ran, saw, truncated}`; the test fails a truncated channel reported as
  complete), and the duplicated Israel offset probe collapsed THREE wall-clock
  implementations into one - `zonedWallClockToUtc` now lives in `lib/i18n/format.ts` and
  `schedule.ts` imports it - ratcheted by a test the reviewer proved goes red. Round 2
  also caught a diagnostic function I left anon-callable on production (EXECUTE defaults
  to PUBLIC; PostgREST exposes it) - revoked.
- **Owned, not argued:** migration 029 was rewritten after its round-1 verdict and applied
  before re-review - a second occurrence of `db.md`'s own case. Recorded in `COLLISIONS.md`
  and the review record. Also filed for the founder: `db.md` states no laws in marker form,
  so no database rule can ever be cited in a `RECURRENCE: yes`.
- **Verified:** 810/810 across 86 files - `tsc` clean - `env:health` 8,995/9,000 (the
  slice's law changes paid for themselves by evicting provenance to case-history) -
  migrations 029 and 030 applied, `transcripts_company_required` now VALIDATED.

## 2026-08-14 — Slice B1a: the smart layer gets its chat backend (`feat/a5-followup-embedding-gate`)

- **`/api/chat/v2` + `src/lib/chat2/` (8 modules) — ticket 06.** A Sonnet 5 tool loop over the
  corpus. The slice-1 blocker it kills: the old route re-emitted raw model text as the whole HTTP
  body, so an upstream failure could only speak by writing prose INTO that same channel —
  indistinguishable from a real answer once persisted. Here every event is TYPED; `error` and
  `incomplete` are their own kinds and no code path puts error text into a `delta`.
- **Citations are verified at write, at the one choke point.** Every quote in a final answer is
  checked against the pool of text this turn's tools actually returned — the real content, not a
  proxy for it (M3.2). A failed check buys ONE retry with the offending quotes named; a second
  failure degrades visibly instead of shipping an invented quote. Round-trip cap 4, and hitting it
  ends the turn as a visible degradation, never a silent cutoff.
- **The founder's word was checked, not trusted.** Ticket 06 recorded `ANTHROPIC_API_KEY` as set
  "on his word; nothing here has verified it, so a 401 from Anthropic is the thing to check first
  rather than the last." One real call: HTTP 200 from `claude-sonnet-5`. Note what that evidence
  actually measured (M1) — the LOCAL key, not the Railway one, which is a separate secret and is
  still unverified.
- **Riding the same branch: A5's four deferred review findings, all closed.** `ship-gate.mjs` now
  refuses a red battery instead of silently certifying it (the exact gap round 4 exposed);
  `documentCatalog.ts`'s comment no longer claims a 270 deck gets the bare year; the closed
  `events.ts` UTC leak left `open-findings.md`; and `syncFilings.ts`'s NO_PAGES re-ingest shares
  the same 23505 race recovery as the not-held path, via an extracted `resolveRaceOrFail`.
- **Nothing in the UI calls the new route yet** — that is ticket 07, and the split is deliberate.
  B1a's acceptance is route-level and does not depend on the corpus; B1 does not SHIP until A5's
  two open gates close (the corpus was 618 of 1,296 documents indexed at merge with the repair
  pass running at ~3 docs/min, and the retrieval gate has never been re-run at this size).
- **Cold review held this branch at round 1 with two BLOCKERs, and they were the ticket's own
  premise failing one level up.** `loop.ts` swore it "always ends in exactly one terminal event"
  and did not: a `max_tokens` truncation and the round-trip cap both ended in `done`, the same
  event a clean answer ends in — so `if (e.type === 'done') persist()` stored a severed answer as
  finished. Worse, `loop.test.ts` ASSERTED that shape, so the mechanism meant to catch the
  recurrence was aimed at the defect and approving it (M2). Fixed at the type, not with a guard:
  `done` and `incomplete` are now distinct terminal events, so "complete but truncated" cannot be
  expressed (M3.3). The compiler found every remaining site the moment the old event left the
  union, and both new stop-reason tests were proven RED against the old behaviour before being
  trusted.
- **`Degradation must be VISIBLE` was promoted, as ADR-0002 requires of a `RECURRENCE: yes`** —
  from `partially`/four-tests to **impossible** (for the chat stream) **+ test** (now six
  surfaces). Story filed to `case-history`, not the rule.
- **Six more findings closed, all of them a comment claiming more than the code did:** the quote
  extractor was blind to the Hebrew gershayim its own comment named; `tools.ts` swore no schema
  exposed a model-settable `companyId` while three did; `systemPrompt.ts` described a cache
  breakpoint that was never set — and could not be, at ~361 tokens against a 1,024-token minimum,
  so the honest fix was the comment rather than a mechanism that cannot engage. Also: a
  client-supplied `companyId` reached the SYSTEM prompt unvalidated in the one route whose ticket
  is injection discipline — now uuid-gated where scope is built, not at the interpolation.
- **`buildToolHandlers` had no test at all**; ticket 06's "injection fence" acceptance was proven
  only on `fence.ts` in isolation, never on the path corpus text actually takes. It now has a
  `ToolDeps` seam and 11 tests, including hostile fence-delimiters in both a chunk body and its
  label.
- **Founder call:** the always-on token budget goes 9,000 → 9,250. Every ADR-0002 promotion grows
  `app.md` by design, and 17 tokens of headroom made the correct behaviour fail the battery. The
  merge still paid what it could — this case's story to `case-history`, duplicated CRLF provenance
  evicted behind its anchor.
- **Round 2 rejected the FIX's own law claim, and that is the finding worth keeping.** Round 1's
  repair declared the degradation law `impossible` for this surface. Round 2 measured that the type
  split closes only CALLER-side conflation — *which* terminal event gets emitted was still inline
  guards, and incomplete guards were the whole of round 1. It then found three more holes in them:
  an empty clean answer ended in `done` (success with nothing); a turn whose every tool failed left
  the source pool empty, which silently switched citation verification OFF so an invented quote
  ended in `done`; and a failing dynamic import threw out of the generator, ending the stream with
  ZERO terminal events. **A law that looks more enforced than it is, is worse than one honestly
  marked partial** — so the decision moved into `chat2/terminal.ts`, a pure function of six facts
  swept exhaustively, and the law now declares the split it actually earns: `impossible` that one
  event means both, `test` that the right one is chosen.
- **Verified:** 935/935 tests across 95 files · `tsc` clean · `npm run build` green · one live
  Anthropic call HTTP 200 (the LOCAL key; Railway's is untouched) · new tests proven red against
  the defect before being trusted · `env:health` 9,227/9,250 · unenforced laws 14 on branch, 15 on
  main.

## 2026-08-14 — Ticket 05 closed: the corpus finishes, the gate re-runs, four findings cleared (`feat/a5-followup-embedding-gate`)

- **The embedding backfill finished.** 738 of 1,296 documents were unembedded at handoff; three
  idempotent passes (`backfill-maya-corpus.ts`, no re-download, no re-spend) plus a targeted repair
  for 8 documents that had fallen out of the "latest of each" selection window while still `failed`
  (`syncCompanyFilings` only revisits the currently-selected set, so a superseded-but-failed filing
  is invisible to every later pass — repaired directly through `reindexDocument`, the same
  production door) brought the corpus to 1,298 of 1,300 indexed. Two large annual reports (426 and
  537 pages) still fail on `atlas_replace_chunks`'s bulk insert — a real scale-tail, named in
  `gate.md`, not silently retried forever.
- **A genuine infra incident, not a code defect:** the Supabase project's compute saturated (CPU
  98%, disk IO 100%) under the backfill's write load partway through, cascading into
  `statement_timeout`/PostgREST schema-cache errors on unrelated reads for ~40 minutes. Diagnosed
  as infrastructure rather than a query bug before touching anything; the founder raised the
  compute tier and the remaining passes completed cleanly.
- **The retrieval gate re-ran and found a real regression.** `docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`:
  dense MRR roughly halved unscoped (0.254→0.131) and down ~27% scoped (0.268→0.195) against A4's
  baseline, because A4 never actually exercised the HNSW index — A5's 98K chunks are the first
  measurement where the ANN approximation is real. The MUST-PASS alias case now fails unscoped,
  holds only scoped. `run.mjs` gained `--dense-only` after the full 5-design `--real` run failed
  outright: the first design tried (`L-real`, unscoped lexical) sorted every GIN-matched row by an
  unindexed `ts_rank_cd` and blew PostgREST's 8s statement timeout — a channel production no longer
  ships, not a corpus-size defect. An index-tuning attempt (`m=32, ef_construction=128`) did not
  land cleanly; founder decision: defer to a dedicated parallel retrieval PRD/grill session rather
  than guess at a fix overnight, and move on to tickets 06/07 in the meantime.
- **The four review findings deferred from A5's merge are cleared:** `ship-gate.mjs` now refuses a
  red battery instead of silently certifying it; a stale `periodFor` comment fixed; a closed UTC
  leak removed from `open-findings.md`; and `syncFilings.ts`'s `NO_PAGES` re-ingest path now shares
  the same 23505 race recovery as the not-held path (previously it could report a raw duplicate-key
  message and re-download forever), with a new regression test.
- **Verified:** all four cleared findings' tests pass; `syncFilings.test.ts` 17/17 including the new
  race-recovery case; `tsc` clean on every file this branch touched.

## 2026-08-15 — Ticket 08b: Ask Atlas gets whole-call injection, and two surfaces move to v2 (`feat/smart-layer-b2b-ask-atlas-surfaces`)

- **The scope was renegotiated on day one, and that is the headline.** 08b was written as "retire
  the old `/api/chat`, both callers onto v2". The old route turned out to carry SIX groundings, not
  two — company, call, live captions, marked PDF pages, snipped images, project context — and v2
  had code for one. The law the `useV2` fork exists to keep is *a surface goes to v2 only when v2
  can honour every grounding that surface displays*, so taking the whole ticket meant porting three
  more groundings with the both-locales verification landing last: the exact failure the 08a/08b
  split was created to avoid. **Founder chose the honest slice.** The old route still serves project
  chats, live captions and multiview doc/snips, each named in the ticket as what 08c owes.
- **Spec §2.3's four grounding recipes are now ONE union** at the request gate, and it REFUSES
  rather than downgrades: a malformed `call` grounding is a 400, not a quiet fall back to
  market-wide search under a chip still naming the call. `transcriptId` is back on `ChatScope` for
  the first time since ticket 07's cold review took it off — together with the code that reads it,
  which is the only order in which accepting it is honest.
- **Whole-call injection.** The call goes into the first user message FENCED like every other
  untrusted source (it is a transcription of a public webcast — the one non-tool door into the
  prompt), line-id-anchored so the model can cite it, budgeted at 60,000 chars ≈ 15–17K tokens, and
  it reports whether it FIT. If the call cannot be loaded the turn ends in `error` before any model
  call — answering from the general corpus under a chip naming a call is the ticket-07 defect.
- **Citation chips are back** for call-grounded answers, carried on a new non-terminal `grounding`
  event alongside the whole/truncated state — the same fact the old route sent on `x-chat-source`,
  so migrating a surface no longer costs it the chip.
- **Two defects that only real data could find.** `transcripts.id` is `text`, not `uuid` — the gate
  as first written would have 400'd every "open in chat" from a call while the whole battery stayed
  green, because every test id was an invented uuid. It survived a full ticket only because the
  field was consumed by nothing: *a field no code reads is a field whose validator can be wrong
  forever.* And `import 'server-only'` made `callSource.ts` unloadable outside Next, which the cost
  harness found by failing on it.
- **Verified:** both surfaces driven by hand in EN and HE with real ids; the truncated state driven
  in both locales (no corpus call is long enough, so the budget was temporarily lowered and
  reverted) and confirmed to survive a reload; the old route's own panel re-driven for the shared
  error-rendering change. `npm test` 1027/1027, `tsc` clean, console and dev log clean. Cost:
  $0.0164 company-scoped, $0.0537 / $0.0805 stuffed against §5's $0.06 / $0.13.
  Evidence + four-round review record in `docs/evidence/feat-smart-layer-b2b-ask-atlas-surfaces/`.
- **Founder decision owed:** §5 says "stuffed FIRST turn", but the call is re-injected on every turn
  — a turn-2 question would otherwise be answered without the call its chip still names. Every
  measured turn is inside the stuffed budget; what is not true is the implied "first".
