# /verify-app — ticket 08b (B2, Ask Atlas surfaces)

Branch: `feat/smart-layer-b2b-ask-atlas-surfaces` · 2026-08-15 · dev server on `:3000`,
restarted clean (a stale server from a previous session was killed first), signed in as the
founder through the real Chrome profile.

**What this measured, stated before the results (M1):** the two surfaces this slice moved onto
`/api/chat/v2`, driven by hand in BOTH locales, with a REAL transcript id and a REAL company id
taken from the live database rather than invented. It does NOT measure the surfaces this slice
deliberately left on the old route (project chats, live captions, multiview document/snip) —
those are unchanged and were not re-driven.

## The defect this pass caught before it shipped

**`transcripts.id` is `text`, not `uuid`.** Measured against the live DB:

| id | shape |
| --- | --- |
| `PyuMxe88e8g` | YouTube id |
| `PyuMxe88e8g_live` | YouTube id + suffix |
| `live-finish-demo-tamis-2026-06-14` | slug |

`requestScope.ts` carried the sentence *"All three ids name `uuid` columns"* since ticket 06, and
the first version of this branch uuid-gated `transcriptId` on the strength of it. That gate would
have returned **400 on every real call** — every "open in chat" from a call, dead — while the
whole battery stayed green, because every test id was a made-up uuid. It survived a full ticket
only because ticket 07 removed `transcriptId` for being consumed by nothing: *a field no code
reads is a field whose validator can be wrong forever.*

Fixed by `asTranscriptId` (a stated SHAPE gate, with its reasoning spelled out because "it is a
uuid" is no longer available as the argument), and pinned by a regression test that names the four
real id shapes literally.

## Surface 1 — `/app/chat?transcript=PyuMxe88e8g` (whole-call injection)

| Check | EN | HE | Note |
| --- | --- | --- | --- |
| Call chip renders | ✅ | ✅ | `קבוצת תיגבור · Q1 2026`, a `<bdi>` per run, `dir` on the container |
| No contradicting mode chip | ✅ | ✅ | `shownMode` is null for a call grounding — the fix below |
| Answer is grounded in THE CALL | ✅ | ✅ | named all three real speakers and quoted the opening verbatim |
| Citation chip under the answer | ✅ | ✅ | restored — carried by the new `grounding` event |
| RTL / mixed runs | — | ✅ | `Q&A-ה`, `Safe Harbor`, `300-ל-650` all read correctly |
| Console errors | none | none | |

**Grounding is proven, not assumed.** The answer named `יונתן רז`, `אורית בן שמעון`, `תומר כהן`
and quoted the call's opening sentence verbatim. None of that is reachable from corpus search —
it can only come from the injected call.

**A fix this pass found by looking.** A call grounding resolves no company, so the server honestly
reports `mode: search` — and the surface rendered "Search mode · pin a company" directly beside a
chip naming one specific call. Two controls contradicting each other, which is the same defect
ChatView already fixed once for the unpin button. A call-grounded chat now shows no mode chip at
all: the call chip already says what the answer is built on, and a second chip could only repeat
it or contradict it.

## Surface 2 — company page Ask Atlas (`/app/company/<id>`)

| Check | EN | HE | Note |
| --- | --- | --- | --- |
| Panel opens, company-scoped caption | ✅ | ✅ | "Atlas is connected to this company's context" |
| Answer arrives, company-scoped | ✅ | ✅ | |
| Console errors | none | none | |

**On v2, provably.** The Hebrew turn answered from `lookup_facts` — XBRL revenue for
`2026-01-01..2026-03-31` with the concept name and both quarters compared. `lookup_facts` is a v2
tool; the old Gemini route has no such thing, so the answer could not have come from it.

## The `truncated` grounding state — driven, in both locales

No call in the corpus is long enough to truncate at the 60,000-char budget (the largest is 66K
chars of JSON, most of which is timestamps and ids, not line text). So the state was driven by
temporarily setting `CALL_BUDGET_CHARS = 1_500`, exercising both locales, and reverting — the
budget is a parameter for exactly this reason. Reverted and re-verified at 60,000 before commit.

| Check | EN | HE |
| --- | --- | --- |
| Notice renders beside the answer | ✅ "This call was too long to read in full — the answer is based on the first part of it." | ✅ "השיחה ארוכה מכדי להיקרא במלואה — התשובה מבוססת על תחילתה בלבד." |
| The MODEL also discloses it | ✅ "only the first 3 of 40 rows are shown (L0001–L0003)" | ✅ same, in Hebrew |
| Survives a reload | ✅ reopened from the sidebar after a full page load — notice still there | ✅ |

That last row is the cold review's BLOCKER fixed and then checked: `callTruncated` was
session-only in the first draft, so one refresh turned a partly-grounded answer into one that
looked whole. It is now persisted in the `messages` jsonb beside `truncated` and
`projectContext` (no migration), sanitised on read, and the reload above is the proof.

**Known, pre-existing:** the citation chip does NOT survive a reload — `source` has never been
persisted, on either route. Not introduced here (v2 previously had no chip at all), and out of
this slice's scope.

## The old route's own surfaces, re-driven

The error-rendering rewrite in `TranscriptChatPanel` (a failure now renders BESIDE the answer
instead of overwriting `content` with a raw server string) lands on the OLD branch too — the live
and transcript hosts that this slice deliberately did not migrate. Cold review flagged that as
changed-but-unverified, correctly. Re-driven: `/app/live/PyuMxe88e8g`, Ask Atlas panel, Hebrew —
answer, table and citation chip all render as before. No regression.

## Cost — the ticket's two acceptance lines

Measured with `scripts/measure-chat-answer.mjs`, which now takes `--call` (it could not price a
stuffed turn before) and judges a stuffed turn against §5's $0.13 rather than the $0.06 answer
budget — reporting "WITHIN $0.06" beside a stuffed turn would have been a green signal for the
wrong question.

| Turn | Input tok | Output tok | Cost | Budget |
| --- | --- | --- | --- | --- |
| Company-scoped ("revenues last quarter") | 3,949 | 303 | **$0.0164** | $0.06 ✅ |
| Stuffed call ("summarise in three points") | 12,558 | 1,068 | **$0.0537** | $0.13 ✅ |
| Stuffed call ("what did the CEO say about the tenders") | 12,561 | 2,854 | **$0.0805** | $0.13 ✅ |

The ~12.5K input tokens are the injected call, inside spec §2.3's 6–18K range.

**⚠ FOUNDER DECISION OWED — the spec says "stuffed FIRST turn", the code stuffs EVERY turn.**
The call is re-injected on each turn, because history is replayed as plain text and a turn-2
question would otherwise be answered without the call the chip still names — silently ungrounded,
which the honesty law forbids. So the true shape is ~$0.05–0.08 per turn for a call chat, not
$0.13 once and $0.06 thereafter. Every measured turn is inside the stuffed budget, so nothing
exceeds a number the spec states; what is not true is the implied "first". Raised rather than
quietly resolved, since the alternative trades cost for grounding.

## A second defect this pass caught

`callSource.ts` opened with `import 'server-only'`, which resolves ONLY inside Next's build — so
the module was unloadable from any plain node process, including the measurement harness. The
first stuffed-turn run failed on it. Two things worth recording: the loop turned it into a visible
`error` event rather than an ungrounded answer (the honesty machinery working on a failure nobody
designed for), and `tools.ts` documents this exact trap one directory over. Removed; what keeps
the module server-side is that only the loop imports it, and only lazily.

## What was NOT rendered, said plainly

**The `error` terminal for an unloadable call.** `/app/chat?transcript=NoSuchCall123` never reaches
it — the page resolves the transcript server-side, finds nothing, and renders blank Chat with **no
chip**, which is itself honest (no chip = no promise). The loop's error path is therefore only
reachable when a call is deleted between page load and send. It is covered at the unit
(`loop.test.ts`: a missing call and a throwing loader both end in `error`, and the missing-call case
asserts the model was never called at all), and the surface rendering it lands in is the
already-shipped `answerFailed` line from ticket 07. Stated rather than claimed as driven.

**Language mismatch, pre-existing.** An English question on the company page was answered in
Hebrew, because the sources are Hebrew. That is `systemPrompt.ts`'s LANGUAGE instruction meeting
Hebrew source material — present before this branch, not introduced by it, and not in this slice's
scope to change.

## Battery

`npm test` 1023/1023 · `npx tsc --noEmit` clean · dev-server log free of errors, 400s and 503s.
(The first pass of this file said 1020 — the count before the review round's three new tests. A
count hand-carried between documents has been wrong every time in this repo; this one is re-read
from the run above, not remembered.)
