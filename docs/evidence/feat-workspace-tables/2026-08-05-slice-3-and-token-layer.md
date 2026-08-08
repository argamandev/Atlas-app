# Evidence — the document persists, and a question reads what it needs (2026-08-05)

Commit `da01ae3` on `feat/workspace-tables`. Founder: *"build phase 3 + smart token efficient
layer + check the api key."*

---

## 1. Slice 3 — the working document is rows

`workspace_doc_blocks` had existed since migration 016 (2026-08-03), with RLS, integrity
constraints and a full API over it, and **nothing had ever called it**. The document lived in
`docHtml[workspaceId]` — a React store — so everything the analyst wrote, and every passage Atlas
wrote for them, lasted exactly as long as the browser tab.

**The shape.** The shell owns the rows; the pane owns the caret. That split is forced by the
founder's earlier instruction that composing must work with the document pane closed — the
authoritative copy cannot live in a contentEditable that may not be mounted.

- `lib/workspace/blocks.ts` (new, 24 tests) is the pure core: read the DOM as blocks, diff against
  the rows, place a passage after a named heading's *section*, decide a citation's state, render
  back.
- Every top-level child of the editor is a block carrying `data-block-id`. That is not the "blob"
  the spec warned against: the browser preserves element identity while you type inside a
  paragraph, so a block's id — and therefore its citation — stays attached to its words through
  editing and reordering.
- `runExclusive` is a promise-chain mutex. Every writer goes through it: the debounced keystroke
  save, a quoted passage, a clipping, a composed paragraph.

**Verified by execution, in the founder's browser, against the live database:**

```
typed  → GET /api/workspaces/<id> → blocks: [{kind:"text", body:"THIS PARAGRAPH MUST SURVIVE A RELOAD", pos:0}]
reload → the document pane renders <p data-block-id="c65f818c-…">THIS PARAGRAPH MUST SURVIVE A RELOAD</p>
```

The document survives a reload. That is slice 3's whole claim.

### The bug that made the first attempt save nothing at all

The first characters typed into an empty `contentEditable` are a **bare text node** — Chrome only
starts producing `<p>` elements once Enter is pressed. `domToBlocks` walks `children`, which is
elements only, so an analyst's opening sentence read as **zero blocks** and the entire document
saved as nothing.

It failed in the quietest possible way: the words were on screen, no error appeared anywhere, and
the rows simply never existed. **It was found by querying the API after typing, not by looking at
the page** — the screen looked perfect. `wrapLooseContent` now wraps loose top-level runs into a
paragraph before every save, preserving the caret by re-selecting the same text node after it
moves.

### Two more defects, both found the same way

- **The citation was dropped between the card and the row.** `putInDocument` set `kind: 'quote'`
  on the draft and left the citation behind, so the create call carried no `source_quote` — and
  the database refuses exactly that (`kind <> 'quote' or source_quote is not null`). `DraftBlock`
  now carries an optional citation and `diffBlocks` forwards it to the create op (2 tests).
- **A save that was refused reported success.** The first design dropped a save that arrived while
  another was running, setting a flag so the EDITOR would re-read the DOM afterwards. That is
  right for a keystroke and silently wrong for everything else: a programmatic write is not in the
  DOM, and with the pane closed there is no editor to re-read — so the write vanished and the pill
  said "Added to your document". Replaced by the mutex, and `saveDocument` now answers `null` on
  failure so the pill can say "failed" instead.

### Citations

"Quote it" sits beside the write button on the connect card and does a **different thing**: it puts
the analyst's own selected words in the document verbatim, with the file, the label and the anchor
— `source_line_id` for a transcript, `source_page` for a document — and **no model call**, because
quoting a source is not a task that needs a language model and making it one invites a paraphrase
where a quotation was asked for.

`source_item_id` is `on delete set null`, so removing a file leaves the sentence in place with the
citation struck through and marked `source removed from this workspace`, never as a live link.

**What is proven and what is not.** The write path is proven end to end by execution: a POST with
`kind:'quote'`, a real shelf item, a line id and the quoted text returns **201** and the row reads
back with its anchor intact; the same call with a foreign item id is refused by the composite
foreign key. The card renders with "Quote it" (screenshot). **The final click of that button was
not landed by synthetic input** — five attempts, the card would not reliably open from a CDP drag,
and `.claude/rules/parallel-work.md`'s five-strike rule says stop rather than grind. The chain
between the button and the proven write is covered by unit tests (`citation` through `diffBlocks`).
**⇒ a founder hand-check is owed on this one gesture**, and it is the only part of slice 3 in that
position.

## 2. The token-efficient layer

`lib/workspace/chat/plan.ts` (new, 17 tests) replaces "send the first N characters of every file on
every turn, evenly divided". Two things were wrong with that, and the second is worse:

- every question paid for the whole shelf, on every turn;
- a question about minute 40 of a two-hour call was answered from that call's first eight thousand
  characters. The model was not short of tokens; it was reading the wrong ones, confidently.

Now: cut each source into windows along **its own structure** (a transcript's sections, a
document's pages), score them against the question by Hebrew-aware term overlap, and spend the
budget on the best ones — one window per file before a second for any, so a question naming two
companies is not answered entirely out of whichever one uses more of its words.

- **Every file is listed in the outline whether or not its text is read**, so the model can say
  "there is a Q3 call here I did not open" rather than answering as though it were absent.
- A window too big to fit is **trimmed and labelled "first part only"**, not dropped — dropping it
  was a real defect the tests caught: one long section can be the only place a question is
  answered, and refusing it left the file reported unread with the budget unspent.
- **One ceiling for the whole prompt.** History and sources used to be capped independently — 24
  turns of up to 4,000 characters, plus a 40,000-character context — so both could be inside their
  own limit while the prompt was twice the account's per-minute allowance.
- Token estimates use the **measured** rate for this corpus: Hebrew ≈ 2.1 characters per token,
  about half what English gets. A budget set from an English rule of thumb is twice too big here,
  which is how a prompt once came back `429 — Limit 30000, Requested 61267`.

Nothing here calls a model: a selection step that itself cost a completion would hand back most of
what it saves. **This is the seam vector retrieval drops into** — only the scoring changes.

## 3. Maya — re-checked, and the answer is now sharper

Founder: *"the api key was approved so check it!"* Re-probed all five endpoints of the purchased
product, both plausible hosts, with the `apikey` header. Result unchanged: `openapigw.tase.co.il`
returns an **Imperva/Incapsula 503** every time, while `datahubapi.tase.co.il` answers with real
JSON (a 404 for those paths — it is the portal, not the gateway).

**The hypothesis this repo carried is now refuted.** `docs/MAYA-API.md` said the WAF "refuses
non-browser clients from here". Navigating the founder's own Chrome to the endpoint returns the
**same** 503, and a same-origin `fetch()` from that page returns `{status: 503, waf: true}`. A real
browser is refused exactly like a script, so the client was never the variable. What is left is
either a wrong base URL or a network/region block — neither settleable from this machine.

**Blocked on the founder, two minutes:** the portal session has expired (`/my-apps` redirects to
SSO, and signing in is not something an assistant session may do). Sign in, open the Atlas app, and
report whether the product still says PENDING and what host "Try it out" actually calls.

**Still true: nothing about the key has been tested.** Not one request has reached the API, so
"approved" and "working" remain different claims.

## 4. The cold review of this commit, and the five row-deleting paths it found

A fourth `atlas-reviewer` was run on `da01ae3` alone. Verdict **FIX FIRST**, five confirmed
blockers — all of them in the editor, all invisible to a green battery, and two of them proven by
running the module's own functions.

| What was broken | Why it deleted rows | Fixed by |
|---|---|---|
| **The round trip did not round-trip.** `fragmentToDrafts` stored the OUTER element as the body while `blocksToHtml` supplied its own wrapper — `blocksToHtml(fragmentToDrafts('<p>one</p>'))` produced `<p data-block-id="x"><p>one</p></p>`, printed here from the real functions. | The HTML parser CLOSES an open `<p>` at the next block tag, so the seed became an empty block with the id plus an orphan without one. Every composed paragraph and every clipping was therefore deleted and re-created on the next keystroke — and a clip lost its `<figure class="atlas-clip">` wrapper permanently. | body is now the block's CONTENTS, matching what `domToBlocks` reads; a body that is itself block-level (a list, a table, a figure) gets a neutral `<div>` wrapper instead of a `<p>`. A **round-trip test** now asserts rows → html → rows is identity for every kind, and that the diff has nothing to do. |
| **An orphaned citation read back as a paragraph.** A quote whose source was removed has no `data-source-item` (that is what `on delete set null` means), so `domToBlocks` called it `text`. | A kind change is a delete plus a create, and the new row carried no `source_label` and no `source_quote` — so **the first autosave after removing a file destroyed the very evidence `on delete set null` exists to preserve**, and the citation then rendered unmarked, looking live. | `data-citation="missing"` is now read as "still a quote". Tested both ways round. |
| **"Quote it" saved no citation at all when the document pane was OPEN.** `quoteBlockHtml` returned bare text, so the insert path handed back a TEXT node and the code that marks the new block with its source compares against ELEMENTS — nothing matched. | A plain paragraph was saved with every citation column null, under a pill reading "Added to your document". The same button worked correctly with the pane closed: **the bug depended on which tab you were looking at.** | `quoteBlockHtml` returns a real `<blockquote>`. |
| **Two quick writes raced.** `putInDocument` built its draft list from `docBlocksRef.current` OUTSIDE the mutex. | The second write's diff deleted the row the first had just created, and both said "added". Serialising the WRITES while racing the READS fixes nothing. | `saveDocument` now accepts a producer function and evaluates it inside the lock. |
| **A half-failed round wedged the document.** Deletes and updates go out before creates, and the created list was discarded on any create failure. | Our row list then claimed rows the database did not have: every later save re-issued a delete that 404s (failing that round too) and re-created paragraphs that already existed. Permanent save failure, growing duplicates. | On failure the shell re-reads the workspace and resets its list to what the server actually holds. |

Also fixed from the same review: the unmount flush read `bodyRef` **after React had nulled it**, so
"leaving the pane saves it" saved nothing; the mounted-pane branch claimed "added" at QUEUE time,
before anything was applied or written (the pane now reports the outcome of its own save); the id
write-back could land a new row's id on the wrong paragraph if the DOM moved in flight (it now
checks the element still matches the draft it came from); a file whose single section had to be
trimmed reported "1 of 1 read" and stayed out of `truncated`, so the prompt admitted the gap and
the analyst was not told; `estimateTokens` measured the Hebrew share over ALL characters including
spaces, pricing real Hebrew prose at ~2.7 chars/token against the 2.1 this module measured — an
18,000-token budget was really nearer 23,000, eating the margin it was chosen to leave; and
`fitHistory`'s `dropped` count was computed and thrown away, so turns vanished with neither the
model nor the analyst told (the model is now given a note in its own voice).

**Removed rather than kept:** a `citationState()` helper covering live/missing/drifted/none, written
the same day, tested, and called by nothing. `missing` is genuinely implemented through the round
trip; `drifted` is not, because it needs the anchor resolved against the source as it reads today.
A tested function no surface uses reads as a feature that exists. The header of `blocks.ts` now
says which of the two is real, and `present.ts` already holds the older vocabulary to extend when
drift is built.

## Gates

`npm test` → **451 pass / 0 fail** (410 before this round; +41: 24 in `blocks.test.ts`, 17 in
`plan.test.ts`). `npx tsc --noEmit` clean. Console clean. Browser: real typing, real reload, live database
reads. `npm run build` NOT run — a dev server owns `.next` here.

## Owed / not done

- **The workspace chat still does not persist.** `workspace_threads` exists and is still uncalled;
  it needs its own route, and it is slice 4 rather than slice 3. Said plainly rather than left to
  be discovered.
- **The fourth anchor hole in migration 016** (a `source_page` on a block citing a transcript) is
  still open. It now matters, because blocks are written. It needs DDL against the shared
  production database, which by `.claude/rules/db.md` is reviewed BEFORE it is applied — so it is
  the next thing, not a thing smuggled into this commit.
- `storage_path` still has no length bound and no FK.
