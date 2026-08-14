# Cold review — `feat/a5-followup-embedding-gate` (slice B1a, ticket 06 + A5 follow-up)

Round 1, 2026-08-14. `atlas-reviewer`, fresh context, on `git diff main...feat/a5-followup-embedding-gate`.

Author's battery at dispatch: 893/893 tests across 92 files · `tsc` clean · `npm run build` green ·
one live Anthropic call HTTP 200 from `claude-sonnet-5` (the LOCAL key; Railway's is untouched).

## Round 1 verdict — verbatim

```
VERDICT: CHANGES
FINDING · BLOCKER · src/lib/chat2/loop.ts:122 · `isFinalAnswer` treats every `stop_reason` other than `tool_use` as a clean finish, so an answer cut off at the 4,096-token `max_tokens` cap (or a `refusal`/`pause_turn`) is emitted as deltas followed by a bare `done`, with no `degraded` and no test covering it — a partial answer sold as complete, which is the exact defect ticket 06 exists to kill.
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · BLOCKER · src/lib/chat2/loop.ts:202 · The round-trip-cap path (and the failed-citation path at line 147) ends in `done`, the same terminal event a clean answer ends in, so the header's own instruction — "the caller decides persistence from THAT" — makes a truncated turn indistinguishable from a complete one unless the caller happens to also remember a non-terminal `degraded`; `loop.test.ts:210` pins this shape as correct rather than catching it.
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · WARNING · src/lib/chat2/loop.ts:33 · `QUOTE_RE` contains only `"`, `“` and `”` — not the Hebrew gershayim `״` its own comment two lines above claims it covers, and not any quote longer than 400 characters — so those quotes are never extracted, never verified, and pass as though they had been checked.
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · WARNING · src/lib/chat2/loop.ts:130 · A citation retry issued on the final round-trip falls out of the loop, discarding the answer text entirely and reporting the wrong cause — "reached the tool round-trip limit before finishing — try a narrower question" — for what was actually a citation failure.
RECURRENCE: no
FINDING · WARNING · src/lib/chat2/tools.ts:4 · The file's stated law 1, "no tool schema below ever exposes a userId/companyId parameter the model could set itself", is false: `search_corpus`, `lookup_facts` and `list_disclosures` all declare a model-settable `companyId` (toolDefs.ts:59, 73, 94) and all three read `input.companyId` ahead of the request-derived scope.
RECURRENCE: no
FINDING · WARNING · src/app/api/chat/v2/route.ts:86 · The client-supplied `body.companyId` is interpolated raw and unvalidated into `scopeSummary`, i.e. into the SYSTEM prompt, unfenced and undefanged, in the one route whose ticket is prompt-injection discipline.
RECURRENCE: no
FINDING · WARNING · src/lib/chat2/tools.ts:31 · `buildToolHandlers` has no test file at all — every real `fenceSources` call site, every supabase error branch and the whole `supabaseAdmin`-vs-`userDb` split are unexercised, and `loop.test.ts` injects fake handlers, so the ticket's "injection fence" acceptance is proven only on `fence.ts` in isolation and never on the path corpus text actually takes into the prompt.
RECURRENCE: no
FINDING · WARNING · src/lib/chat2/citations.ts:38 · The docstring says a quote is checked "against the source it claims", but `loop.ts:46` hands it the concatenation of every tool result this turn, so a quote correctly lifted from one company's filing verifies while the answer attributes it to another — the check is real, its stated scope is not.
RECURRENCE: no
FINDING · NIT · ARCHITECTURE.md:135 · The new `chat/v2/route.ts` row says "SSE"; the route serves NDJSON (`content-type: application/x-ndjson`, one JSON object per line, no `data:` framing), and this is the line ticket 07's author will build a client from.
RECURRENCE: no
FINDING · NIT · src/lib/chat2/systemPrompt.ts:1 · The "CACHE-FIRST" header describes a cache breakpoint the code never sets — `loop.ts` passes `system` as a plain string with no `cache_control`, so no prompt caching occurs and the §5 cost budget rests on a mechanism that does not exist.
RECURRENCE: no
FINDING · NIT · src/lib/chat2/tools.ts:55 · `retrieveChunks(supabaseAdmin as never, …)` casts away all type checking on that argument; the repo's established idiom for the same coercion is `as unknown as CorpusDb` (src/lib/db/transcripts.ts:35, src/app/api/transcripts/route.ts:83), which still checks the target shape.
RECURRENCE: no
FINDING · NIT · .scratch/smart-layer-build/issues/06-unified-chat-backend.md:3 · "MERGED … Nothing open" overstates: the ticket's cost acceptance (≤ $0.06/answer) was never measured and its "route tests" were substituted by unit plus structural tests — a defensible substitution, but one the ticket should name rather than close.
RECURRENCE: no
```

## What the reviewer checked and did NOT fault — recorded so absence is evidence, not assumption

- The A5-followup commit closes exactly the four deferred findings and nothing more.
  `resolveRaceOrFail` is a faithful extraction; the new regression test covers the `NO_PAGES`
  re-ingest race; `parsePeriod` does drop a publication-date label exactly as it dropped a bare
  year, so the corrected comment's conclusion holds.
- No UI, component, or migration files ride along. No secrets in the diff. No Wave-2 gateway imports.
- `apiAuthBoundary.test.ts` genuinely walks `src/app/api` recursively and does reach
  `chat/v2/route.ts`, which is not in the `PUBLIC` allowlist — re-measured, not assumed.
- `document_chunks` is fed only by `transcripts` and `company_documents`, both shared corpus, so
  `supabaseAdmin` in `tools.ts` is `db.md`'s legitimate category; `read_workspace` correctly routes
  through the RLS-bearing client.
- `893`/`92` and the `15` unenforced-law count are accurate on this branch.
- **There is no path by which error prose reaches a `delta`.** Both BLOCKERs are about a *partial*
  answer reading as complete — not about error text entering the answer channel. The half of ticket
  06's premise that concerns error framing holds; the half that concerns completeness does not.

## Round 2 verdict — verbatim (REVIEWED: e0761ee)

The reviewer ran the battery, `tsc`, `env:health` and `ship:gate`, and drove `runChatLoop` directly
with a probe carrying two CONTROL cases whose answers were already known from `loop.test.ts` — both
matched, proving the probe ran against this commit's signatures rather than a stale one.

```
REVIEWED: e0761ee
VERDICT: CHANGES
FINDING · BLOCKER · .claude/rules/app.md:183 · The `impossible` tier overclaims: the type split closes only CALLER-side conflation, while which terminal event gets emitted is still chosen by runtime guards (`CLEAN_STOPS.has`, `bad.length > 0`, `sourcePool ? …`) whose incompleteness was the whole of round 1's two blockers — the union alone would not have caught `max_tokens`, and the guards still have holes below.
RECURRENCE: no
FINDING · WARNING · src/lib/chat2/loop.ts:222 · A clean `end_turn` carrying no text yields exactly `[{"type":"done"}]` with zero deltas (measured), so an empty answer terminates as complete — the "success with nothing" state this file's own header at line 27 declares unrepresentable.
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · WARNING · src/lib/chat2/loop.ts:178 · When every tool of a turn errors, `sourcePool` stays empty because only non-error results are appended, so the `sourcePool ? unverifiedQuotes(...) : []` guard silently switches citation verification OFF and an invented quote in an answer built on zero surviving sources ends in `done` (measured) — and the comment justifying that branch names a different case, "no tool ever ran".
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · WARNING · src/lib/chat2/loop.ts:232 · `await ensureHandlers()` sits outside any try, so a failing dynamic import throws out of the generator and the stream ends with ZERO terminal events (measured: `supabaseUrl is required`, no events at all), against a docstring one line above that promises it never throws and always ends in exactly one.
RECURRENCE: no
FINDING · WARNING · ARCHITECTURE.md:304 · The `chat2/` row still lists `degraded` as a live event type and never mentions `incomplete`, contradicting both the `chat/v2` row corrected in this same ship and the union `44d50d0` actually shipped.
RECURRENCE: no
FINDING · WARNING · src/app/api/chat/v2/route.ts:78 · The uuid gate that closes round 1's prompt-injection finding has no test and is unexportable (`UUID_RE`/`asUuid` are inline), in the very commit whose `tools.test.ts` demonstrates the env stub that makes testing such a module possible.
RECURRENCE: no
FINDING · NIT · src/lib/chat2/systemPrompt.ts:15 · The ~361-token measurement counts only the system block, but a `cache_control` breakpoint there covers `TOOL_DEFS` too (2,095 serialized chars, ~520 tokens by the same ratio), so the real distance to the 1,024 minimum is ~150 tokens, not ~660 — the decision not to add a breakpoint is right, the margin recorded beside it is not.
RECURRENCE: no
FINDING · NIT · src/lib/chat2/loop.ts:198 · The citation-retry prompt interpolates the offending quote — text the model may have lifted from a hostile document — into a USER turn unfenced and undefanged, in the one subsystem whose §2.2 law fences every document-derived string before it re-enters the prompt.
RECURRENCE: no
FINDING · NIT · src/lib/chat2/tools.test.ts:32 · Two of the four `ToolDeps` (`listDisclosures`, `getWorkspaceFull`) are never injected by any test, so `list_disclosures` and `read_workspace`'s success path — two of the five real `asFenced` call sites — remain exactly as unexercised as round 1 found them.
RECURRENCE: no
FINDING · NIT · PROGRESS.md:1104 · The shipped-work entry, written after `degraded` was deleted from the union, still records it as one of the loop's event kinds.
RECURRENCE: no
```

**What round 2 checked and did NOT fault:** the blocker fix IS real for every path it was aimed at
— `max_tokens` (with and without tool_use blocks), `refusal`, `pause_turn`, unknown stop, `null`
stop, `tool_use` with zero tool blocks, the round-trip cap, a retry that then hits the cap, and a
citation failure on the last round-trip all end in exactly one `incomplete`, last. The uuid gate
closes the prompt path completely and `scopeSummary` is a non-issue (`resolve_company` writes a
column value, never model text). The `ToolDeps` seam does not change production behaviour. Counts
re-measured, not restated. No migrations, no UI, no Wave-2 imports, no secrets.

## Author's answers to round 2 — all ten accepted

**The BLOCKER is upheld and was the right call.** Declaring `impossible` for both halves was
overclaiming, and an over-declared law is worse than an honest `partially` — it is the precise
failure ADR-0002 exists to prevent, committed while paying an ADR-0002 debt.

The decision now lives in `src/lib/chat2/terminal.ts`: one pure function from six FACTS
(`stopReason`, `anyTextEmitted`, `unverifiedQuotes`, `anySourceSurvived`, `anyToolRan`,
`roundTripCapHit`) to the terminal event, ordered most-severe-first because several can be true at
once and the user must be told the worst true thing. `terminal.test.ts` sweeps every combination
and asserts `done` ⟺ genuinely-clean, plus guard-the-guard assertions so the sweep cannot pass
vacuously. Both `RECURRENCE: yes` findings name the same law and are paid by that one mechanism.
The law now reads: **impossible** that one terminal event means both · **test** that the right one
is chosen — which is the declaration the reviewer said it would approve.

| Round-2 finding | What was done |
| --- | --- |
| BLOCKER overclaimed `impossible` | Law re-declared as the honest two-part split; the choice moved out of inline guards into `terminal.ts`. |
| `loop.ts:222` empty answer → `done` | `anyTextEmitted` is now a tracked fact; a clean stop with no text is `incomplete` ("the model returned no answer text"). Pinned at both unit and loop level. |
| `loop.ts:178` all-tools-failed disables verification | `anyToolRan` and `anySourceSurvived` are separate facts, so "tools ran and all failed" no longer shares a branch with "no tool ever ran". The former is `incomplete`; the latter still completes. |
| `loop.ts:232` zero terminal events | `ensureHandlers()` is inside a try; a failing import ends in `error`. Test asserts the stream is non-empty AND has exactly one terminal. |
| `ARCHITECTURE.md:304` stale `degraded` | Row rewritten; also documents `terminal.ts`. |
| `route.ts:78` uuid gate untested | Extracted to `chat2/requestScope.ts` with 7 tests, including five real injection payloads, the anchor check, and a non-global-regex assertion. |
| `systemPrompt.ts:15` wrong margin | Corrected to ~150 tokens, counting `TOOL_DEFS` in the cacheable prefix. The decision not to add a breakpoint stands; only the margin was wrong, and it was wrong in the direction that matters. |
| `loop.ts:198` undefanged quote in retry | Now `defang(q)` — the retry was exempting itself from §2.2. |
| `tools.test.ts:32` two deps never injected | Four new tests covering `list_disclosures` (hostile MAYA title, and a MAYA failure ≠ empty list) and `read_workspace` (fencing, plus asserting the USER client is what reaches it). |
| `PROGRESS.md:1104` stale `degraded` | Fixed, and the module count corrected 6 → 8. |

## Author's answers to round 1 — all twelve accepted, none disputed

Every finding was re-verified against the code before being acted on. All twelve were real,
including two that were the author's own errors from earlier in this same ship (the "SSE" line and
the ticket's "Nothing open"). Fixed in `44d50d0` (code + law) and `2defc79` (docs).

**The two `RECURRENCE: yes` findings are paid for in `44d50d0`, the same commit as the fix**, as
ADR-0002 requires. `Degradation must be VISIBLE` moves from `ENFORCED partially` / four tests to
**two tiers**: `impossible` for the chat stream — `done` and `incomplete` are now distinct terminal
event types, so "complete but truncated" cannot be expressed rather than merely being checked for
— plus `test` over six surfaces (`retrieve`, `indexHealth`, `reindex`, `syncFilings`, `chat2/loop`,
`chat2/tools`). A new surface still gets `none`, stated. The case's story went to
`case-history/app.md#stubs-on-designed-slots`; the rule keeps only the law.

| Finding | What was done |
| --- | --- |
| BLOCKER `loop.ts:122` stop_reason | `CLEAN_STOPS` is now an explicit allowlist (`end_turn`, `stop_sequence`); `max_tokens`/`refusal`/`pause_turn`/unknown each end in `incomplete` with their own reason. Partial text is still delivered — hiding it would be its own invisible failure. |
| BLOCKER `loop.ts:202` terminal event | `degraded` is GONE from the union. Every early ending is `incomplete`; `done` is emitted only on a clean stop with no failed citation. `loop.test.ts` now pins exactly-one-terminal-event, last, across clean / max_tokens / round-trip-cap. |
| WARNING `loop.ts:33` QUOTE_RE | Gershayim `״` added to both delimiter classes; bound raised to a NAMED `MAX_QUOTE_CHARS = 2400` above the corpus's largest chunk, with the residual limit stated rather than implied. |
| WARNING `loop.ts:130` retry on last round-trip | Retry is now conditional on a round-trip remaining; without one the answer is emitted and terminated with the CITATION reason, not the cap's. |
| WARNING `tools.ts:4` false law 1 | Header rewritten to what is true: `userId`/`workspaceId` are closure-only, `companyId` IS model-settable on three tools, and that is safe **only** because they read the shared corpus — with the condition under which the argument evaporates spelled out. |
| WARNING `route.ts:86` raw companyId into the system prompt | All three client-supplied ids are uuid-gated **where scope is built**, not at the interpolation (M3.1) — so the prompt, the handlers and the queries are all covered by one guard. |
| WARNING `tools.ts:31` no tests | New `tools.test.ts`, 11 cases, via a `ToolDeps` seam. Drives hostile fence delimiters through a chunk BODY and a chunk LABEL, the supabase-error branch, absent-vs-zero, and both `read_workspace` refusals. `db/workspaces` became a lazy import because `server-only` made the registry unloadable from a test process. |
| WARNING `citations.ts:38` overstated scope | Docstring now states the actual property — "quoted from something shown this turn", not "from the document named beside it" — at both the function and its call site, and the real gap is filed in `docs/open-findings.md`. |
| NIT `ARCHITECTURE.md` SSE | Corrected to NDJSON with the content-type and framing spelled out, since ticket 07's client is built from that line. |
| NIT `systemPrompt.ts` phantom cache | **Deliberately not "fixed" by adding a breakpoint.** Measured: the static block is ~361 tokens against Sonnet's 1,024-token minimum, so `cache_control` there could not engage — enforcement in appearance only. The comment now says so and the cost budget is explicitly forbidden from leaning on it. Filed in `open-findings.md`. |
| NIT `tools.ts:55` `as never` | Now `as unknown as CorpusDb`, the repo's existing idiom, which still checks the target shape. |
| NIT ticket 06 "Nothing open" | Replaced with the two acceptance items that were substituted or unmeasured: cost was never priced, and route tests were substituted by unit + structural tests. |

---

## Round 3 · cold review (Atlas reviewer, fresh context)

VERDICT: CHANGES
REVIEWED: d6a86ffe88556b1c374a8cc60770eeabe763303a

Scope covered: everything after e0761ee (quote-verification-off commit, `--dense-only` flag,
ticket-05 close-out docs), the full A5-followup diff on its own merits (`syncFilings.ts`'s
`resolveRaceOrFail` extraction, `scripts/ship-gate.mjs`'s red-battery check, `documentCatalog.ts`
comment fix, `open-findings.md` edit), and STATUS/PROGRESS/DECISIONS/gate.md consistency. Spot-checked
`terminal.ts` and the round-2/round-3 accepted fixes against `loop.ts` — hold. `QUOTE_VERIFICATION_ENABLED
= false` verified genuinely inert (`extractQuotes` short-circuits to `[]`; both call sites downstream
of it, so `unverifiedQuotes` is always 0 and never invents a degradation). `npx tsc --noEmit` clean;
`npm test` green at 935/935; no secrets found in the new eval result files or diff.

FINDING · BLOCKER · the commit under review (`d6a86ff`) ships wrong counts in tracked docs:
  `ARCHITECTURE.md` claims "936 tests across 95 files" and `PROGRESS.md`'s latest entry claims
  "Verified: 932/932", while a real run of this exact tree is 935/935. `node scripts/ship-gate.mjs`
  confirms this itself and currently refuses the merge on exactly these two lines. The working tree
  has an UNCOMMITTED fix (`ARCHITECTURE.md`/`PROGRESS.md`, 936→935) sitting alongside HEAD — i.e. the
  correction exists but was never folded into a commit, so the branch as it stands does not merge and
  the count that would land if someone force-pushed past the gate is wrong. Commit the fix (re-derived
  from a fresh run, not hand-typed) before shipping.
RECURRENCE: yes → M1, "counts carry their command" / "a count restated from another document — wrong
  every time it was hand-carried" — this is the third+ recorded instance of exactly this class in
  `app.md`'s own history. The mechanism (`ship-gate.mjs`'s count check) IS catching it here and refusing
  to merge, which is the tier working as designed; the finding is that the commit still needed to be made
  wrong before the gate caught it, and the fix must not be left uncommitted at hand-off.

FINDING · NIT · `docs/evidence/feat-a5-followup-embedding-gate/review.md` (this file) is itself one of
  the files `ship-gate.mjs` lists as "changed after the reviewed commit" relative to round 2's
  `REVIEWED:` sha — expected, since this round supersedes it, but note for whoever runs `/ship` next
  that the gate will want this round's sha, not round 2's, and this file must be committed (not left
  as an uncommitted append) for the gate to see it.
RECURRENCE: no

Everything else checked came back clean: `src/app/api/chat/v2/route.ts` resolves a user before any
work (`getRequestUserId` + `unauthorized()`), sets `cache-control: no-store` on its streamed response,
and the stream's own `catch` still emits a terminal `error` frame rather than closing silently.
`terminal.ts`'s `decideTerminal` orders its checks most-severe-first as documented and the round-3
`emittedText` accumulation genuinely moves the fact to the emit point (verified against `loop.ts`'s
`for (const block of textBlocks) { emittedText += ...; yield ... }`). `syncFilings.ts`'s
`resolveRaceOrFail` extraction is a faithful dedup of the two call sites with no behavior change beyond
what round-4's deferred NIT asked for, and its new re-read still checks `error` before trusting `data`
(the M3.3 defect it exists to close). `scripts/ship-gate.mjs`'s red-battery check does what it claims —
confirmed live by running it. `docs/open-findings.md`'s edit correctly narrows the UTC-leaks entry to
one, matching `documentCatalog.ts`/`events.ts` reality. `DECISIONS.md`'s entries for this branch are
complete and undersell nothing — the retrieval regression, the shared-branch irregularity, and the
budget raise are all stated with numbers, not smoothed. `docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`
states the MRR regression plainly in its own verdict table and is referenced identically (same numbers)
from `STATUS.md` and `DECISIONS.md` — no softening found anywhere it is cited.

## Round 4 — confirmation review

Scope: fast, scoped confirmation of commit eb39c3d, the single commit landed since round 3's
blocker. Not a full re-review of chat2 subsystem (rounds 1-3's job).

Verified directly:
1. `npm test` measures 935 pass / 935 total across the run — matches the count now stated in docs.
2. `ARCHITECTURE.md:336` and `PROGRESS.md:1163` both state 935/935 across 95 files, matching each
   other and the measured battery.
3. `git diff d6a86ff..eb39c3d --stat` touches only `ARCHITECTURE.md` (1 line), `PROGRESS.md`
   (1 line), and the append to this review file — round 3's blocker was the only thing this
   commit changed; nothing else rode along.
4. `npx tsc --noEmit` — clean, no output.

REVIEWED: eb39c3dec20e392982ed07f7d4ca5ea565a46224

VERDICT: APPROVED
FINDINGS: none
