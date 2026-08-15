# `/verify-app` — ticket 08c-3, report grounding + snips on `/api/chat/v2`

Branch `feat/smart-layer-b2c-doc-grounding`. Driven 2026-08-15 against `npm run dev` on `:3000`,
the founder's signed-in Chrome, **real data**: transcript `PyuMxe88e8g` (קבוצת תיגבור, Q1 2026)
with document `36fde52d-81d0-4567-83c6-f302c13044f0` (דוח תקופתי ושנתי לשנת 2025, 175 pages,
173 with extracted text).

Surface: `TranscriptChatPanel` inside `LiveTranscriptView` multiview (Transcript + Slides +
Report), which is the LAST caller of the old `/api/chat` and the reason it was still alive.

## Every state this surface can reach

Enumerated BEFORE driving, per `/verify-app` step 8b. A row with no verdict is the thing this
list exists to make visible.

| # | State | EN | HE | How |
| --- | --- | --- | --- | --- |
| 1 | Marked passage, pages read WHOLE (`documentContext: ok`) — no notice | ✅ driven | ✅ driven | Real selection in the report's text layer → real `mouseup` → real composer → Enter |
| 2 | Marked passage CUT (`truncated`) — Hebrew/English notice | ✅ driven | ✅ driven | Same real path, `DOCUMENT_BUDGET_CHARS` temporarily 200 (restored; see below) |
| 3 | Report text UNREADABLE (`failed`) — notice | ✅ driven | ✅ driven | Same real path, loader temporarily returning `{meta:null,pages:[]}` (restored) |
| 4 | Snipped IMAGE reaches the model as an image block | ✅ driven (API) | — | Real PNG through `/api/chat/v2` from the signed-in page; the answer cited **page 40**, the SNIPPED page, whose text the gate had merged into the marked list |
| 5 | Snip + marked page COMPOSED with a call grounding | ✅ driven (API) | — | `grounding:whole` + `documentContext:ok` on one turn, both honoured |
| 6 | Malformed snip → 400, never a quietly shorter image list | ✅ driven (API) | — | jpeg data-url, 5 snips (cap 4), 9 marked pages (ceiling 8), bad `documentId`, two documents on one turn — all `400` |
| 7 | Plain turn, nothing attached → NO `documentContext` frame | ✅ driven (API) | — | No frame emitted; user content stays a plain string |
| 8 | Citation chip on a call-grounded answer | ✅ driven | ✅ driven | `קבוצת תיגבור · Q1 2026` under both answers |
| 9 | **Drag-marking and scissors-drag as native gestures** | ❌ NOT driven | ❌ NOT driven | CDP synthetic drags cannot create native selections (a standing `/verify-app` gotcha). The selection was made as a real `Range` on the real text layer and delivered through the component's own `onMouseUp`. **The gesture is unchanged by this ticket; the chat path it feeds is what changed.** Founder hand-check if wanted. |
| 10 | Live panel's own states (`liveTruncated`, no-captions-yet, snip on a live turn) | ❌ NOT re-driven | ❌ NOT re-driven | 08c-2's evidence covers them. What changed here is that a live turn carrying a snip no longer falls back to a second route — it stays on v2. Not re-verified in the browser. |
| 11 | Demo call (`call.id === 'demo'`) → grounds on the COMPANY, not a call id with no row | ❌ NOT driven | ❌ NOT driven | No demo call was reachable in this checkout. Reasoned and unit-typed only. |

Rows 9–11 are the honest gaps. 9 is a pre-existing harness limit on a gesture this ticket did not
touch; 10 and 11 are real not-driven states.

## What the API path proved, with numbers

One real turn — call grounding + `documentRef{pages:[12,13]}` + one PNG snip on page 40:

```
grounding      state=whole   source={קבוצת תיגבור, Q1 2026, PyuMxe88e8g}
documentContext state=ok
mode           search
done
```

The answer opened `בעמוד 40 של הדוח התקופתי והשנתי לשנת 2025…` and quoted that page verbatim.
Page 40 was never marked — it arrived because the gate merges a SNIPPED page into the marked list
so the image's own page keeps its prose. That merge is load-bearing and this is its proof.

## A defect this run found, that the battery could not

`documentContext` reported **`ok`** for a document whose pages hold no extracted text — a scanned
PDF, or a `documentId` naming no row. The read had SUCCEEDED, so the flattering branch was taken:
the model was correctly handed `NO_PAGE_TEXT` and the SCREEN said nothing at all. Success UI over
content the server never had.

Fixed at the choke point — the state is now decided on whether any page text reached the model,
not on whether the read threw (M3.2) — and pinned by
`loop.test.ts › REGRESSION: a report with NO extracted text reports failed, not ok`. Confirmed
live afterwards: a well-formed uuid naming no document now returns `documentContext: failed`.

A second, smaller one: the 400 for a malformed attachment said *"this grounding cannot be
honoured"*. Attachments are not a grounding — that is the whole point of their being a field
beside the union — so the route now names which gate refused.

## The temporary changes, and that they are gone

Rows 2 and 3 cannot be reached with real data through a real gesture: the largest real page in
this 175-page report is 3,120 chars, and 8 marked pages × 3,120 < the 25,000 budget. (It IS
reachable via the merged 12-page case, confirmed at the API level: `documentContext: truncated`.)
To render the NOTICES through the real component, two constants were temporarily changed:

- `DOCUMENT_BUDGET_CHARS` 25,000 → 200
- `loadDocumentForInjection` short-circuited to `{meta:null, pages:[]}`

Both restored. Verified by absence, not by memory: `grep -c TEMP-VERIFY` returns 0 in both files,
both files dropped out of `git diff` entirely, and the `ok` path was re-driven after the restore
(`grounding:whole, documentContext:ok, done`).

## Console

`read_console_messages(onlyErrors)` — no errors or exceptions on the surface throughout.

## Battery

`npm test` 1125 → 1126 green (the regression case above), `npx tsc --noEmit` clean,
`npm run build` clean.

## Observation, not a finding

When the report text is unreadable, the model sometimes QUOTES the English `NO_PAGE_TEXT`
instruction into an otherwise-Hebrew answer, and that mixed run renders with its quote mark and
full stop on the wrong side. The sentence is an English prompt constant exactly like every other
one in this stack (`NO_CAPTIONS_YET`, shipped at 08c-2, has the identical shape), and the
rendering is `Markdown` inside `dir="auto"` — pre-existing for any answer mixing scripts. Recorded
here rather than fixed, because narrowing it is a change to the prompt contract and belongs with
the structural-citations ticket, not this one.
