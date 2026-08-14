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

## Author's answers — all twelve accepted, none disputed

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
