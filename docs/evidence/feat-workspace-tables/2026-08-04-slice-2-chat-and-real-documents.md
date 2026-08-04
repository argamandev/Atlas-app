# Workspace — the second founder round, 2026-08-04

Branch `feat/workspace-tables`, commits `ecc5e63` + `7026fed`.
346/346 tests · `tsc --noEmit` clean · zero console errors · verified on :3003 in Chrome.

The founder's list, verbatim, and what each one turned out to be.

---

## 1. "it still opened only 1 docuemnet even tho we agreed on 3"

**Reported twice. The first fix was aimed one step too late.**

That fix made the agreed set *durable* — it rode with the assistant turn as
`proposed[]`, and a bare "yes" short-circuited to it without a model call. All of
that worked. What it never checked was whether the set was ever *produced*.

The selection prompt said:

> ONLY when their LATEST message agrees … set status = "ready", **put the final
> ids in "selected"**

which reads as an instruction *not* to fill `selected` before agreement. So the
sequence was:

1. Atlas names three files in perfect Hebrew prose, returns `selected: []`
2. the client stores `proposed: []`
3. the bare-yes shortcut sees an empty proposal and does not fire
4. the model is asked to re-derive the set from its own prose — and drops files

Every guard downstream was operating on an empty list. **The prompt contradicted
itself, and the code had no opinion.**

### Fixed in two places, only one of which depends on a model

- the prompt now demands `selected` at **both** statuses, in its own paragraph
- `resolveSelection()` (`lib/workspace/intake/agreement.ts`) is the part that
  does not: a clarifying turn that names files while returning none cannot be a
  deliberate emptying — nobody re-shapes a set to nothing while still discussing
  it — so the standing proposal survives. A *non-empty* clarifying selection is
  taken as given, because mid-conversation re-shaping ("actually, just the Q1
  one") is exactly what the conversation is for.

### Measured against the live corpus

| step | result |
|---|---|
| asked for 3 files (Tigbur Q1, Tamis Q2, Afcon Q1) | 3 in `selected` at the clarifying turn, 6 672ms |
| replied `כן` | `status: ready`, **3 files**, **438ms** |
| rows written | 3, all `is_open: true`, positions 0/1/2 |
| on screen | **3 tabs** |

---

## 2. "more human … 'great, im pulling them it can take a second…'"

This **reverses a decision made the day before**, and the founder is right.

`reply: null` with `ready` had been treated as a deliberate silence: the user had
said yes, so the server spent no model call composing a sentence and the pulling
dots were left to be the whole reply. The reasoning was wrong in a specific way —
**a progress indicator is the machine acknowledging; what is being built here is
a colleague answering.**

The sentence is written client-side, so the bare-yes turn still costs no model
call and still lands in 438ms.

### "the text animation should appear like chat gpt's does. fast and word by word"

`components/ds/Typewriter.tsx`, ~26ms per word.

**Word by word, not character by character, and the difference is not cosmetic:**
a character reveal in Hebrew tears words apart as they form, and with mixed
Hebrew/Latin it re-runs the bidi algorithm on a half-written word — the line
visibly jumps as each letter lands. Revealing whole words means every frame is a
prefix that was already going to be laid out that way.

It respects `prefers-reduced-motion` (whole sentence at once), and only the
newest turn animates — otherwise the whole thread replays on every render.

---

## 3. "the header is just stuck i can[t] change it"

The `<h1>` was a prop. It was the one piece of the page that is entirely the
user's work and the only text on it they could not touch.

Now an `<input>` — one line, cannot accept pasted markup, will not fight React
over the caret when the pane re-renders (the body below has to seed through a ref
for exactly that reason), and it gets a real placeholder.

`present.ts` stopped substituting `'Untitled document'` for an empty
`doc_title`: **an editor has to bind to what is actually stored**, or typing one
character after the placeholder would make the placeholder the user's real title.
The label lives in `documentTitle()` instead, unit-tested, used at all three
display sites.

Debounced 600ms, and — unlike the workspace rename — **kept, not reverted, on
failure.** Yanking a title out from under a caret mid-word would destroy work in
order to report a problem. The error banner carries the bad news instead.

Verified: typed `תיגבור — מה אנחנו יודעים`, `doc_title` in the database matched,
and the tab chip and panel row both followed.

---

## 4. "make the documents we agreed on to be actually pulled and presented"

They *were* being pulled. What the pane rendered was `FilePreview` — a hardcoded
Hebrew "דוח שנתי" about Tigbur with invented revenue and margin, **rendered
identically for every file**, including three real investor calls.

It carried a DEMO chip, so it was not dishonest by this repo's rules. It just
answered a question nobody asked.

`components/workspace/SourceDocument.tsx` reads the row: transcripts through
`formatted_data` with the `speaker_names` rename overlay applied (so a quote
copied here matches one copied from the transcript page), documents through
`document_pages`. Every query goes through the **user's** client, so RLS on
`workspace_items` is what answers "is this yours".

**A row with no words says which of three reasons** — `processing`, `no-text`,
`source-gone` — and never falls back to something that looks like content. That
fallback is precisely how invented figures reach a page the user believes is a
filing.

> ⚠️ Verified for **transcripts** only. The founder's corpus is currently all
> transcripts, so the `document` branch has been typechecked and unit-tested but
> not seen rendering a real filing. It renders extracted page text, not the PDF;
> `components/live/PdfViewer.tsx` already exists and is the obvious upgrade.

---

## 5. "add source should change into add a document … you again describe in words"

**"again" is the requirement.** Adding a fourth file should behave exactly like
asking for the first three did, and the surest way to guarantee that is for it to
*be* the same component rather than a second one that drifts.

`WorkspaceIntake` gained `variant="panel"`. `WorkspaceSourcePicker` — the
browse-and-tick grid — was **deleted** rather than left orphaned behind a comment
claiming it was still reachable.

---

## 6. "the new workspace chat should just be workspace chat"

Renamed, and the `+` removed: there is one conversation about a workspace, so a
"+" was promising something that does not exist.

**Grounded**, which is the whole point. The shelf's own text goes into the prompt
and the model is told to answer from that and nothing else. The alternative — a
chat answering about Tigbur from whatever it remembers about Tigbur — is the same
failure class as the fabricated report just deleted, only harder to spot because
it is fluent.

| asked | answered |
|---|---|
| "מה אמרו על ההכנסות?" | **₪359M for Q1 2026**, attributed to the right call, 5 662ms |
| "מה היה שיעור הרווח הגולמי של אינטל?" | *"לא מצאתי… אין כאן קובץ או תמלול של אינטל"* — refused, did not answer from memory |
| "תביא לי גם את השיחה של קוואליטאו" | `wantsDocuments` set, handed to the intake flow |

### It cannot attach a file

When the analyst asks it to *bring* one it returns `wantsDocuments` and the UI
opens the add-a-document conversation with the request already sent. **Exactly
one code path ever picks a file** — the one that names them and waits for a yes.
Two models choosing files would mean two answers to "which file did you mean" and
only one of them tested.

### The budget is the honest part

`buildContext` shares the character budget **evenly** rather than
first-come-first-served — one long transcript would otherwise consume the whole
allowance and leave every other file invisible, so "compare the two calls" would
be answered from one of them with no sign of it. Whatever it had to cut is
**named**, and the UI states it under the answer.

This is the seam the founder chose on 2026-08-04 (*"seam now, vectors next"*).
Retrieval replaces "the first N characters" with "the N most relevant passages";
nothing either side of that function changes.

---

## 7. "we need to enable ask atlas feature!"

Mark any passage in a source pane → a floating **✦ Ask Atlas** → the chat opens
carrying it, shown above the composer with its own remove button so Atlas never
holds a paragraph the user cannot see it holding.

### The correction: it opens in a SIDE PANEL, not a tab

I built it as a tab first. **A tab replaced the document — you asked about a
paragraph and the paragraph disappeared.** The founder had already said *"let it
open from the side pannel"*, and the design had already fixed the tab bar's
height so its seam lines up with a side-chat header. Both were saying the same
thing and I read past both.

Implementation notes worth keeping:

- the selection is read on **pointer-up**, not `selectionchange` — the latter
  fires continuously during a drag, so the button would jump with the cursor
- the button fires on **mousedown**, not click: a click collapses the selection
  first, and the passage would be gone by the time the handler ran
- positioned from the selection's own rect and clamped inside the pane, so it
  lands on the passage in **both** directions — a fixed corner sits on the wrong
  side of an RTL column
- only selections **inside this pane** count; with several panes open, marking in
  one must not offer to quote another

Verified in Hebrew: marked a paragraph, asked *"מה המשמעות של זה למשקיע?"*, got
an answer about that passage while the document stayed on screen beside it.

---

## Still open, and stated so it is not mistaken for done

- **The working document's body is still the fabricated demo seed** (invented
  figures, DEMO-marked). That is slice 3 — `workspace_doc_blocks` — and was not
  on this list. It is the last fabricated content left on a real workspace page.
- **Chat threads are not persisted.** `workspace_threads` exists and is unused;
  reloading loses the conversation.
- **Layout is not persisted** beyond `is_open` — active tab, split and pane
  widths reset on reload (`workspaces.layout jsonb`, still owed).
- **Export** (`.docx`) still says unavailable rather than pretending.
- **Documents render extracted text, not the PDF.**
- **Corpus data, not code:** two identical `דוח דירקטוריון Q1 2026` rows, and a
  Knesset committee video tagged to Tigbur. Both visibly confuse Atlas's
  confirmations and belong to the archive, not this branch.
