# fix/projects-honesty — the three gate fixes, and the error surfaces photographed

**Date:** 2026-08-03 · **Lane:** M (workspace-backend seat) · **Branch:** `fix/projects-honesty`
**Gate being answered:** the CHANGES verdict on `505aaaf` (board, Lane M,
`[supervisor note 2026-08-03]`). Three fixes, plus the evidence gap the verdict named:
*"three of the four defects live in error paths, and the evidence folder contains no picture
of a single error surface — they were all written blind."*

This file exists to close that sentence. Everything below was seen in a browser.

---

## 0. What the verdict said was wrong, and what changed

| # | Finding | File | Fix |
|---|---------|------|-----|
| 1 | `.catch(() => setItems([]))` renders "no chats yet" when `GET /api/conversations` 500s — the layer that ATE the error `conversationScope.ts` was narrowed to produce | `ChatHistory.tsx:41-44` | `listError` state; the failure is rendered, and the empty state is no longer shown for a failed load |
| 2 | Banner precedence: one error shown, so a create failure after a load failure is an invisible dead click | `ProjectsList.tsx:67-75` | both rendered, never one instead of the other — the same shape `ProjectView` already had |
| 3 | `flex flex-col gap-1` blockifies `ErrorLine`'s `<bdi>` into its own flex item, splitting every message across two rows | `ProjectView.tsx:226-231` | a block wrapper per `ErrorLine` — **inside `ErrorLine` itself**, see §3 |

New dictionary key both locales: `chat.historyFailed` (`en` "Could not load your chats — {error}"
/ `he` "לא ניתן לטעון את השיחות — {error}").

---

## 1. How the failures were forced — REAL server 500s, not a patched `window.fetch`

The previous round was flagged for exactly this: *"the `failed` status came from the real server
but its NOTICE was rendered by patching `window.fetch`."* So this round did not stage anything
client-side.

A temporary `if (process.env.ATLAS_FORCE_ERROR) throw new Error(...)` was placed inside the
existing `try` of three real handlers, and the dev server restarted with that variable set:

- `GET /api/projects` → `relation "public.projects" does not exist`
- `POST /api/projects` → `permission denied for table projects`
- `GET /api/conversations` → `relation "public.chat_conversations" does not exist`

The routes' own `catch` turned those into the 500s they already return, so the message travelled
the real response → the real client fetch wrapper → the real render path. Confirmed from the page
before capturing: `fetch('/api/projects')` → **status 500**, body
`{"error":"relation \"public.projects\" does not exist"}`.

**The three lines are REVERTED and are not on the branch.** `git checkout --` on both route
files, then `grep -rn "ATLAS_FORCE_ERROR" src/` → **no matches** (exit 1), and
`git diff --stat -- src/app/api/` → **empty**. The message strings were chosen to look like the
Postgres errors these paths really produce, because the point of the capture is the bidi
behaviour of a Latin run inside a Hebrew sentence.

**No database was touched to produce these.** Nothing was dropped, renamed, or migrated — the
throw is in application code, above the query.

---

## 2. The pictures

### `shots/error-state-en.jpg` — EN, `/app/chat/projects`, `dir=ltr`

Shows, simultaneously:
- **the projects banner carrying BOTH sentences** — "Could not load your projects — relation
  "public.projects" does not exist" AND "Not saved — permission denied for table projects".
  The second line is the fix-2 proof: it appeared only after clicking **New project** while the
  load error was already on screen. Before the fix that click was silent.
- **the sidebar under RECENT CHATS reading "Could not load your chats — relation
  "public.chat_conversations" does not exist"** where it previously said "nothing here yet".
  That is fix 1.

### `shots/error-state-he.jpg` — HE, same page, same two failures, `dir=rtl`

The same three messages in Hebrew, RTL. This is the capture the branch owed: every defect fixed
here is in an error path, and the bidi rule is only testable in this locale.

**What these two images do NOT show:** they are one page (`/app/chat/projects`). The
`ProjectView` banner (`ProjectView.tsx:226-231`) — the file the CSS finding was measured on — is
not in frame; its fix is proven by §3's measurement of the same component in the same kind of
flex container, plus the code change being in the shared component both screens use. They also
do not show the `openChatFailed` line, which needs a conversation whose open call fails.

---

## 3. The CSS fix, measured — because the finding was measured

The verdict measured the defect on the live page rather than arguing it: flex → `<bdi>` computed
`display: block`, template text at top 10 and the error at top 32, one message occupying a 60px
box; the non-flex sibling gave `inline` with both runs at top 86 in 37px.

**The fix is not a wrapper at the call site — it is a wrapper inside `ErrorLine`.** A call-site
wrapper fixes one banner and leaves the next author free to reopen the bidi rule at occurrence
six by choosing a layout. `ErrorLine` now renders `<span className="block">` around its content,
so the wrapper is the flex item and the `<bdi>` stays inline within it. `<span>` and not `<div>`
because `ProjectView.tsx:131` renders `ErrorLine` inside a `<p>`, where a `<div>` is invalid HTML
the parser would close the paragraph around.

Probe on the live page, HE (`<html dir="rtl">`), the projects banner with both errors:

```
container direction : rtl
banner height       : 60px          ← TWO messages (the defect was 60px for ONE)
> span children     : display block, tops 151 and 174   ← the flex items
bdi elements        : display inline, tops 152 and 175  ← same row as their own text
```

EN run of the same probe: children `block` at 151/174, bdis `inline` at 152/175, height 59.5px.

Each `<bdi>` now sits on the same row as the template text it belongs to (the 1px delta is the
inline baseline inside the line box, not a second row), and the two rows present are the two
*distinct* errors — which is the intended layout. This is the exact inverse of the measured
defect.

Sidebar probe, same page: wrapper `block`, bdi `inline`, height 54px for one message wrapping
naturally in a narrow column.

The `<bdi>` was **not** removed. Rendering in RTL reads
`לא ניתן לטעון את הפרויקטים — relation "public.projects" does not exist` with the Hebrew run
right-anchored, the Latin run keeping its own left-to-right order, and the quotes staying attached
to `public.projects` — which is the whole point of the isolation.

---

## 4. Battery

| Check | Result |
|---|---|
| `npm test` | **201/201 pass**, 0 fail (pasted from the run) |
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **green** — all routes compiled, Middleware 81.8 kB |
| Console, both locales | **zero errors**; only Next dev noise (React DevTools notice, Fast Refresh) |

The build was run with the dev server **stopped** and `.next` cleared, per rules/app.md.

No new tests: all three fixes are component render paths, and this repo's battery is pure-function
only (no React test setup). The browser pass above is the verification, which is why it was done
in both locales and measured rather than described.

---

## 5. Honest residue

- **A stale dev server was squatting :3003** from the previous chapter (PID 17208) and was killed
  before anything was verified. No capture in this file came from it.
- **`ChatHistory` flashes the empty state while the list is loading** — `items=[]` and
  `listError=null` on first paint, so "nothing here yet" appears for one frame before the fetch
  resolves. Visible in a mid-load screenshot taken during this pass. It is **pre-existing**, not
  introduced here, and is the same class as the defect just fixed (a confident empty state that
  is not yet true). Left alone deliberately — the gate scoped this round to three fixes — and
  filed here so it is not discovered as a surprise. A `loading` flag is the fix.
- **One click on "New project" was made against a failing POST.** It returned 500 and created
  nothing; the list still holds the same single "Untitled project" it held before the pass, which
  is visible by comparing the pre-failure and post-revert screenshots of the same account.
- The forced-error strings name tables (`public.projects`, `public.chat_conversations`) that DO
  exist. The message is fabricated for the capture; the table is real. Stated so nobody reads the
  screenshot as a genuine schema problem.
