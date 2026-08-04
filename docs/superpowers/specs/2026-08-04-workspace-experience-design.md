# Spec — The Workspace experience (2026-08-04)

> STATUS: APPROVED by the founder, section by section, in the 2026-08-04 brainstorm.
> Lane M (multiview) · port 3003 · branch `feat/workspace-tables` (continues; the tables and
> shelf on it are sound and unmerged, so the chapter keeps one history).
>
> Supersedes the workspace half of `2026-08-03-workspace-backend-design.md`, which built the
> right database under the wrong experience.
>
> Visual source of truth: the imported design (`WorkspaceIntake.tsx`, `WorkspaceShell.tsx`,
> `WorkspaceDocs.tsx` are faithful imports of it). **This spec changes no visual design.**
> Founder, 2026-08-04: *"the desired front end for the workspace is already built in cloud
> design, and we imported it. So this is the desired front end."*

---

## 1. Why this chapter exists — the first attempt failed at the front door

The founder's verdict, 2026-08-04: *"what you created up until now wasn't good enough … currently,
when we press on new workspace, you can just search documents. That's not the user experience.
That's not what I intended."*

The defect is one decision, and it is written in the code at `WorkspaceRoute.tsx:106-114`. The
designed intake panel was removed from the route and replaced with a corpus search-and-tick
picker, justified in a comment:

> *"It used to show WorkspaceIntake — the designed 'describe it and an agent gathers the files'
> flow, which carries its own demo marker because nothing gathers anything. That flow needs agent
> execution, which needs the deploy, which comes after this chapter. Until then the honest empty
> state is the one that actually works: pick from the corpus that exists."*

`WorkspaceIntake.tsx` has been sitting in the repo since, built and unrouted.

**The lesson, stated so it is not repeated:** the honesty rule (`.claude/rules/app.md` — never
render success UI for something no backend produced) is a rule about *not lying*, not a licence to
*delete the product*. The correct response to "the panel promises files we cannot deliver" was to
make the panel deliver what we do have and state plainly what we do not. Removing the designed
experience to satisfy a rule about honesty traded the feature for the rule. **A lane may not
resolve that tension alone; it goes to the founder.**

---

## 2. What a Workspace is (the founder's words, 2026-08-04)

> new workspace → one open panel where you write what you want in it → the files are presented in
> front of you → you multi-view them, single-view them, read and work on them → you write your own
> big document on them → you export that document → you open new workspaces → and each workspace,
> when you leave it, stays exactly as it was.

Four things, and nothing else: **a name · a shelf of files · chats about them · a document you
write, whose paragraphs point back at the files.**

---

## 3. Founder decisions (2026-08-04 — file each to `agent-memory/cross-cutting.md`)

| # | Decision |
|---|---|
| D1 | The imported design IS the desired front end. Nothing is redesigned this chapter. **One acknowledged addition** — see §6, slice 1: D5's confirm-list is not in the imported design, and is built inside the clarify conversation using its existing visual language rather than as a new screen. |
| D2 | Files may come from Atlas's own archive **and** from Maya/TASE. The user just describes what they want; Atlas uses whatever sources it has. |
| D3 | Inside a workspace, Atlas answers questions grounded in **that workspace's files only**, and its answers can be written **into the working document** as cited blocks. |
| D4 | Export is a **Word `.docx`**. PDF waits for a real server-side renderer. |
| D5 | Intake is **clarify, then confirm**: Atlas asks about what it found, then shows the list it intends to add, and the user trims it before the shelf fills. |
| D6 | Build order is **the order the user experiences it**, one visible slice at a time, so a misread costs a day and not a week. |
| D7 | Maya API purchased 2026-08-04 (awaiting vendor approval). It enters as a **separate, non-blocking piece**; no workspace slice waits on it. |
| D8 | Vector retrieval is **the next chapter, not this one** — this one ships the seam it will drop into. |
| D9 | Legal Due-Diligence: **the panel stays visible** as a placeholder for the Agents chapter; **the fake run and the fabricated findings go.** |

---

## 4. Facts verified by query, not memory (2026-08-04)

**The archive is nearly empty.** `companies` = 4; `transcripts` = 60 but across only **2**
companies; `company_documents` = **2**, for one company.

| Company | `tase_security_id` | Calls | Docs |
|---|---|---|---|
| קבוצת תיגבור בע"מ | 1105022 | 4 | 2 |
| תמיס בע"מ | 1097229 | 1 | 0 |
| קווליטאו בע"מ | 1083955 | 0 | 0 |
| ר.ג.א שרותים ונקיון | null | 0 | 0 |

*(The 60-transcript count includes rows not attached to a company.)*

**This is why Maya matters to the experience and not only to the roadmap.** An intake searching
only this archive will, for almost any request, correctly answer "I have nothing for that
company." The mechanics would be real and the product would be hollow.

**`companies.tase_issuer_id` already exists and is `null` in every row.** The Maya mapping the
founder asked about needs no migration — only filling. `companies` also already has `sector`,
`description` and `website`, which are exactly Maya's `פרטי חברות` fields (`sector`, `about`,
`website`).

**The existing chat truncates at 40,000 characters** (`src/lib/chat/context.ts:14`,
`MAX_CONTEXT_CHARS`), silently. That is roughly one call transcript — so "read the whole shelf"
breaks on the second large file, and breaks by dropping the end without saying so.

### 4.1 The four workspace tables (migrations 016 + 017, applied, RLS proven with two real users)

| Table | Holds | Used before this chapter? |
|---|---|---|
| `workspaces` | id, user_id, name, doc_title | yes |
| `workspace_items` | the shelf — exactly one of `transcript_id` / `document_id` / `storage_path`; `kind`, `name`, `is_open`, `position` | yes |
| `workspace_threads` | workspace chats — `title`, `messages jsonb` | **never** |
| `workspace_doc_blocks` | the document — `kind ∈ (heading, text, quote)`, `body`, `position`, `source_item_id`, `source_label`, `source_page`, `source_line_id`, `source_quote` | **never** |

Integrity already enforced by the database (017): a `quote` must carry `source_quote`; a block may
not claim both a page and a transcript line; a block may not cite an item on another workspace's
shelf; composite `(id, user_id)` foreign keys make a cross-owner attach impossible even with RLS
bypassed; `source_item_id` is `on delete set null`, so **removing a file never deletes the user's
writing.**

### 4.2 What the Maya bundle actually offers (read from the founder's screenshots of TASE store product `6005041`, 14 interfaces)

Document-bearing interfaces, all sharing one shape — `publicationDate`, `issuer`/`issuerId`,
`events`/`eventId`, `mayaReportID`, `title`, `url`, `isPriorityReport`, `isCorrection`,
**`attachedFiles`**:

- `דיווחי חברות לתאריך` — company filings **for a date**
- `גילויי חברות עדכניים` · `גילויי החברות בעדיפות גבוהה`
- `הודעות בורסה לתאריך` · `הודעות בורסה עדכניות`

Reference: `פרטי חברות` (issuerId, issuerName, sector, about, incorporation, address, website,
email, phone, securityIncludedIndices) · `מזהי אירועי דוחות כספיים` · `מזהי אירועי בורסה` ·
`מזהי אירועי חברות` · `מזהי תקופות דיווח`. Calendars: `לוח זמני דוחות כספיים` (by publication
date / by report year) · `אסיפות כלליות`. History from **2008-01-01**.

**The load-bearing finding: the filing feeds are indexed by DATE, not by company.** Nothing in the
bundle answers "give me this issuer's last two years." Every row carries `issuerId`, so the filter
exists — but only after the rows are in hand.

**⇒ The workspace must never call Maya live.** A sync walks the date feeds into an Atlas-owned
catalog; the workspace searches the catalog. This is what lets every workspace slice ship before
the key arrives and gain Maya's depth afterwards without one screen changing.

**Also to be resolved when the key lands:** Maya keys companies by `issuerId`; Atlas's rows carry
`tase_security_id`. Different numbers — one company may have several securities. `פרטי חברות`
fills `companies.tase_issuer_id` and closes the gap.

---

## 5. Architecture — two seams, and nothing else new

Both seams exist so that a large future piece can land without touching the workspace.

### 5.1 The source seam — `findSources(request)`

The intake never queries a table directly. It calls one function that asks every source Atlas has
and returns candidates in one shape: *what it is · which company · when · which source it came
from · how to open it.*

- **Today:** `transcripts` + `company_documents`.
- **When the key lands:** a `maya_filings` catalog, filled by a sync over the date feeds.
- The workspace cannot tell the difference, and neither can its code.

### 5.2 The context seam — `contextForQuestion(workspaceId, question)`

The workspace chat never gathers files itself. It calls one function that returns the context for
a question **plus the list of what it read**.

- **This chapter — targeted selection**, in two concrete steps, so "selection" is not left to
  interpretation:
  1. **Which files** — the model is shown the shelf's *labels only* (name, company, type, date,
     size) and names the items worth reading for this question. Cheap: labels, not contents.
  2. **Which parts** — within those items, sections are taken around keyword and section-heading
     matches, each carrying its page number or line id, filled to a character budget in relevance
     order. Whole file if it fits.

  This is strictly better than today's behaviour, which concatenates and cuts at 40k characters
  without telling anyone.
- **Next chapter — vector search.** `pgvector`, embeddings per chunk, each chunk carrying its page
  or line id. Same function, same chat, same citations.
- **Retrieval makes citations better, not harder** — a retrieved chunk already knows its exact
  anchor.
- **The risk to measure before trusting it is Hebrew embedding quality**, on our own transcripts:
  ten questions with known answers, retrieval vs. whole-file, compared. Measured, not assumed.

**Invariant, both eras:** every answer states which files it read.

---

## 6. The five slices

Built in the order the user meets them (D6). Each ends with the founder able to open the app and
judge it.

### Slice 1 — The intake panel becomes real

`WorkspaceIntake.tsx` is routed back at `WorkspaceRoute.tsx` in place of the source picker, and
its three designed stages are wired:

1. **Describe** — the centred composer. Free text, Hebrew or English.
2. **Clarify** — `gemini-3.5-flash` (the repo's chat model, `src/app/api/chat/route.ts:23`, with
   the existing `gpt-4.1` fallback) turns the sentence into a structured search — company, period,
   material types — `findSources` runs it, and the panel asks questions **generated from what was
   found**, replacing today's hardcoded `2022–2025 / Last 2 years / Just latest` chips. Resolved a
   company but found nothing for the period asked? It says exactly that and offers what does exist.
3. **Confirm** — the files it intends to add, named and dated and tickable. The user trims. Then
   the shelf fills. **Nothing lands that the user did not see.**

   **This stage is an addition to the imported design, and is the one place this chapter adds UI.**
   The design goes intro → clarify → building. The confirm-list is the founder's D5 and is built
   **inside the clarify conversation**, in its existing chip-and-list language — not as a new
   screen and not as a redesign of the panel. If it cannot be made to feel native there, it goes
   back to the founder rather than being invented.

The source picker survives as the "add more sources" path inside a populated workspace — it is a
good secondary affordance, just not the front door.

**Failure behaviour (the rule this chapter exists to encode):** when the search finds nothing or
fails, the panel says so in that sentence and the workspace still opens with whatever was found.
It never substitutes adjacent material, and never renders a confident result over a failed search.

**Done when:** describing a workspace in Hebrew produces real rows on a real shelf, a request with
no matches produces a clear statement rather than an empty or a fabricated result, and both read
correctly in Hebrew and English.

### Slice 2 — Files open for real

`WorkspaceDocs.tsx:204`'s `FilePreview` — a hardcoded invented Hebrew annual report about a real
listed company, rendered for **every** file regardless of which was clicked — is deleted. Panes
render by `kind`:

- `transcript` → the real transcript: real speakers, real lines
- `document` → `PdfViewer` (`src/components/live/PdfViewer.tsx`), already hardened by the
  multiview work — page zoom, selection, the pdf.js cluster
- `file` (`storage_path`) → after the first two

The tab bar, split view, side-by-side panes and the drag gutter **already work** and are unchanged
— they simply stop rendering fake paper.

**The selection affordance is what makes this more than a viewer.** `PdfViewer` already emits
`onAskSelection`. In a workspace, selecting a passage in a report or a line in a call offers **ask
Atlas** and **cite into my document** — and it is that selection which carries `source_page` or
`source_line_id` into `workspace_doc_blocks`.

**Flagged, not silently dropped:** playing the call audio while reading its transcript. Atlas's
player is global, so this may be nearly free. If it turns out to drag the live-playback stack into
the workspace, it is left out **and said out loud**, not half-built.

**Also in this slice — "stays exactly as you left it" (one additive migration).** `is_open`
remembers *which* files are open; the active tab, split mode, which panes are in the split, and
the dragged divider positions are session-only and die on reload. One additive column closes it:

```
alter table public.workspaces
  add column if not exists layout jsonb not null default '{}'::jsonb;
-- { activeTab: string, split: boolean, multi: string[], widths: { [itemId]: number } }
```

Additive-only per `.claude/rules/db.md`; append to `cross-cutting.md` **before** applying. Values
are ids the user's own rows already contain, so no new ownership surface: the column rides
`workspaces`' existing RLS policy. A `layout` naming an item that no longer exists is ignored on
read rather than repaired on write — the shelf is the truth, the layout is a hint.

**Done when:** a real call and a real report open side by side, a selection in each produces a
correct anchor, and a reload restores the exact layout.

### Slice 3 — The document saves

The current `WorkingDocument.tsx` opens pre-filled with fabricated Hebrew text: invented revenue
figures for a real listed company and a quote attributed to a **named executive** under a
filing-shaped source line. It is demo-marked *on screen*, but the marker does not travel with
copied text. **It is deleted.** The document opens empty, with its title.

It becomes `workspace_doc_blocks`: **heading · paragraph · quote**, each with a position, saved as
the user types. Block-based rather than one `contentEditable` blob, because the table is already
blocks and because a citation must survive editing — serialising a blob back into blocks cannot
keep an anchor attached to the words it belongs to.

**A quote block carries the words and their origin** — which shelf item, which page or which
transcript line. Three ways one is created: select in a pane and cite · take something Atlas said
in chat · write it and attach the source.

**A citation cannot quietly become a lie.** Remove the file from the shelf and the writing survives
(`on delete set null`) while the citation renders **visibly missing** — never a link that still
looks live. (Founder decision, 2026-08-01, already on the books.)

**Done when:** a document written across two sessions is identical on return, a cited quote shows
its real page/line, and removing its source makes the citation visibly absent.

### Slice 4 — The workspace chat, and writing into the document

`workspace_threads` becomes real. The left panel's "new workspace chat" button and its `__chat`
tab already exist and already open — onto demo threads. They get an engine.

Scoped to this workspace's shelf and nothing else, through `contextForQuestion` (§5.2). **Every
answer states which files it read** — never answering from three of five files while the user
believes it saw all of them (`.claude/rules/app.md`'s filed silent-degradation class, which would
bite hardest exactly here).

An answer, or a quote inside one, can be dropped into the document as a block **carrying its
citation** (D3).

**Done when:** a question about a real call is answered from that call, the answer names its
sources, and one lands in the document as a checkable quote.

### Slice 5 — Word export

Generated **server-side from the blocks, never from the screen.** The screen-printing approach is
what produced the previous export defect: one clipped page that dropped the demo warning at the top
of the pane and kept the fabricated quote at the bottom, exporting invented words attributed to a
real named executive with no marker at all.

- Headings as headings, paragraphs as paragraphs, quotes indented with a **source line** beneath —
  file, date, page or speaker line.
- Hebrew/RTL set per paragraph. This is the reason `.docx` beats PDF here
  (`.claude/rules/app.md`: Hebrew PDF needs a real browser engine).
- A quote whose source was removed exports as **"source removed"** — not dropped, never a
  reference to something absent.
- The PDF menu item stays visibly unavailable **with its reason**, until a server-side renderer
  exists.

**Done when:** a document containing Hebrew, English, headings and two cited quotes opens in Word
with correct direction and checkable sources.

---

## 7. Removed or held back

| Thing | Disposition |
|---|---|
| `FilePreview`'s invented Tigbur report | **deleted** (slice 2) |
| `WorkingDocument`'s fabricated seed + fake CEO quote | **deleted** (slice 3) |
| Legal Due-Diligence **panel row** | **kept visible** — placeholder for the Agents chapter (D9) |
| Legal Due-Diligence **fake run + invented findings** | **deleted.** "Not working yet" and "shows fabricated legal conclusions about a real listed company" cannot both be true |
| "Agents" / "Actions taken" counters | demo-fed; held back with the same reasoning as the legal findings |
| Vector retrieval | next chapter (D8); the seam ships here |
| Maya sync + catalog | separate non-blocking piece (D7); begins when the key arrives |
| Maya PDF rendering | **explicitly after** metadata sync — unknown Hebrew PDFs are exactly the class that eats a week; kept out of the critical path |

---

## 8. Verification bar

- **Both locales, eyes-on, every slice.** This repo has four filed bidi defects that passed
  typecheck, tests and an EN-only screenshot pass (`.claude/rules/app.md`). Mixed Hebrew/Latin runs
  get `<bdi>` per run, direction on the container.
- **Two users, always.** Created as A · survives reload · invisible to B · proven against the anon
  key, not only through the app. (The 016/017 evidence is the pattern to repeat.)
- `npm test` · `npx tsc --noEmit` · `npm run build` — the build **never** while a dev server is up
  in this checkout.
- A green typecheck is not evidence a page renders. Every slice is loaded in a browser.

**The chapter's acceptance run, done in front of the founder:** describe a workspace in Hebrew →
real files arrive → open two side by side → cite a passage → ask the chat → drop its answer into
the document → reload and find everything exactly as left → export the `.docx` and open it in Word.

---

## 9. Open items

1. **Maya key** — purchased 2026-08-04, awaiting vendor approval. On arrival: `maya_filings`
   catalog + date-feed sync + `פרטי חברות` pull to fill `companies.tase_issuer_id`. Metadata
   first; file rendering is its own step.
2. **Audio in the workspace** (slice 2) — free or dropped, decided by what the global player
   actually costs here. Reported either way.
3. **Hebrew embedding quality** — measured before the next chapter trusts retrieval.
