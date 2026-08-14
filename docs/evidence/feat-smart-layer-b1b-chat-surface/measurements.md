# Ticket 07 (B1b) — the three measurements, filed

**Measured 2026-08-14** on branch `feat/smart-layer-b1b-chat-surface`, against the REAL corpus
(`document_chunks` count = **98,042**) and the REAL Anthropic key.

Ticket 07 names these as its OUTPUT, not as a side effect: "does the tool loop behave against the
real 98K-chunk corpus, what does an answer actually cost against the $0.06 budget, and does
Railway's `ANTHROPIC_API_KEY` work. Measure all three and file the numbers."

Harness: `scripts/measure-chat-answer.mjs` — drives `runChatLoop` exactly as `/api/chat/v2` drives
it, with the real handlers over the real Supabase corpus, and taps `messages.create` on the way past
to record each response's `usage`. No production code path is altered to measure it.
Reproducer for §1: `scripts/probe-unscoped-retrieval.mjs`.

**Scope of this evidence (M1).** These prove the LOCAL environment: the local `ANTHROPIC_API_KEY`,
the live Supabase corpus, Sonnet 5 at list price. They say nothing about Railway — see §3.

---

## 1 · The tool loop against the real corpus — SCOPED WORKS, UNSCOPED FAILS HARD

### Scoped (pinpoint) — green, end to end

`בז"א` (`ca3b1344…`), *"מה אמרה ההנהלה על המרווח בשיחת המשקיעים האחרונה?"*

```
{"type":"mode","mode":"pinpoint","companyId":"ca3b1344-12a7-4c7c-9a48-6998319fad7c"}
{"type":"tool","name":"search_corpus","status":"start"}
{"type":"tool","name":"search_corpus","status":"end"}
{"type":"done"}
```

The answer came back in Hebrew, grounded, with verbatim block quotes from the Q1-2026 board report
(מרווח הזיקוק המתואם 14.3 vs 9.1 דולר לחבית) — and closed with an unprompted honesty note that what
it found were **board reports, not a conference-call transcript**, offering to search again. That is
the behaviour §2.3's honesty machinery is supposed to produce, observed rather than assumed.

**This is the channel both MUST-PASS cases close through** (resolve_company → scoped search), and it
works.

### Unscoped (search mode) — RED, and it is a hard failure, not a quality regression

*"אילו חברות דיברו על עליית הריבית בשיחות המשקיעים?"*

```
{"type":"tool","name":"search_corpus","status":"end","isError":true}   ×3
{"type":"incomplete","code":"all_sources_failed", …}
```

Isolated at the retrieval layer:

```
$ node --import tsx scripts/probe-unscoped-retrieval.mjs "עליית הריבית"
FAILED after 8.6s
error: retrieveChunks: canceling statement due to statement timeout
```

**An unscoped dense scan over 98,042 chunks does not complete inside Postgres's statement timeout.**

Filed, NOT fixed, and not re-scored (app.md M2, and the ticket's own instruction: *"either the index
gets fixed first, or the red is filed with the number beside it"*). Two reasons this is the right
call and not an evasion:

- Ticket 07 anticipated exactly this: *"class-G discovery sits on the unscoped channel that
  regressed… File the red with its number — do not re-score the gate to make it green."*
- `STATUS.md` assigns the real retrieval fix to a **dedicated parallel session** (grill + PRD).
  Retuning top-k or candidate depth here to make one number go green is a retrieval change that
  re-runs the whole eval gate, taken by the session that does not own it.

**What the founder should know in plain language:** asking Atlas about ONE company works well.
Asking a market-wide question ("which companies said X") currently fails — and it fails *honestly*:
the user sees "every source lookup failed", in Hebrew, not a confident invented answer. The
per-company diversification this ticket built for that channel is written, unit-tested, and cannot
be exercised end-to-end until the index is fixed. It is not dead code; it is code waiting on a door
that is currently shut.

### What the honesty machinery proved by failing

The unscoped failure is the first time B1a's degradation design ran against a real, unplanned
fault. It behaved: three visible `isError` tool events, a terminal `incomplete{all_sources_failed}`,
and the model told the user in Hebrew that the search failed and offered a narrower route. No
`done`, no fabricated answer, no silence.

---

## 2 · Cost per answer — OVER the $0.06 budget on 2 of 3 real answers

Sonnet 5 list price ($3/Mtok in, $15/Mtok out).

| # | Question | Round-trips | In | Out | Cost | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | בז"א — מרווח, שיחת משקיעים | 2 | 21,949 | 1,355 | **$0.0862** | ✗ OVER |
| 2 | בזק — הכנסות ברבעון האחרון | 3 | 5,874 | 497 | $0.0251 | ✓ within |
| 3 | בזק — סכם את הדוח הכספי בשלוש נקודות | 2 | 26,354 | 1,162 | **$0.0965** | ✗ OVER |

**The driver is INPUT tokens, and specifically how much fenced corpus text `search_corpus` returns.**
Output is small and stable (497–1,355). Input swings 4.5× (5,874 → 26,354) and tracks directly with
whether the search filled its top-k. Sample 2 is cheap because its search returned little — it is
the cheap case, not the typical one.

**Honest read: the $0.06 budget does not hold today for a well-grounded answer.** A grounded answer
is precisely the expensive one, so the two over-budget samples are the *product working*, not
degenerate cases. Median of three: **$0.086, ~44% over.**

**Prompt caching is confirmed OFF, by measurement.** `cache_read_input_tokens = 0` and
`cache_creation_input_tokens = 0` on every one of the three. This independently confirms
`docs/open-findings.md` and `systemPrompt.ts`'s header — the cacheable prefix is short of Sonnet's
1,024-token minimum, so **the §5 cost budget must not be justified by caching**, and nothing here
does.

Not fixed here, for the same reason as §1: the levers are top-k, candidate depth and chunk size —
all retrieval parameters, all gated by the eval harness, all owned by the retrieval session. Filed
for that session and for Phase D (ticket 14, cost accounting), which now has a real number to build
against instead of an estimate.

---

## 3 · Railway's `ANTHROPIC_API_KEY` — NOT PROVEN, and it needs a founder step

**Unmeasured. Stated rather than quietly closed.**

Ticket 06 recorded the key as set on Railway *on the founder's word*, and proved only the LOCAL key
by a real call. This ticket's measurements above are also local. Railway's value is a separate
secret nothing in this branch has touched.

**A 401 from Anthropic is the first thing to check on the first deploy of this route**, not the
last. It is cheap to distinguish: `/api/chat/v2` returns **503** with `chat is not configured` when
the variable is absent entirely, and the client renders that distinctly from a model failure
(`streamChatV2` throws an `ApiError` carrying the status). A **401** means the variable is present
but wrong.

This cannot be closed from a development machine — it requires a deploy of this branch to Railway,
which is a founder decision because `main` is live at `www.timlul-ai.com`.

---

## What this ticket therefore delivers, honestly

- **Green:** the chat surface on `/api/chat/v2`; pinpoint mode end-to-end against the real corpus;
  visible search mode with a one-tap switch; nine degradation states in both locales; alias-aware
  `@mention`; the persistence door that keeps a partial answer from storing as a whole one.
- **Red, filed with numbers:** market-wide search times out at 98K chunks (§1); the $0.06 budget is
  exceeded on grounded answers (§2).
- **Unmeasured, named:** Railway's key (§3).

Neither red is re-scored, and neither is fixed by a change this session does not own.
