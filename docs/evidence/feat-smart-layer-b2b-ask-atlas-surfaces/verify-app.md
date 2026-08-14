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

`npm test` 1020/1020 · `npx tsc --noEmit` clean · dev-server log free of errors, 400s and 503s.
