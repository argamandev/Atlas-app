# /verify-app — workspace chat honesty states (ticket 09)

Branch: `feat/smart-layer-b3-workspace-chat` · Driven 2026-08-15 · dev server `:3000`, founder's
signed-in Chrome, workspace `1fa49e9a…` (בית זיקוק אשדוד, 3 files, one of them a 214-page filing)

**What this drive is for.** Ticket 09's acceptance names "workspace honesty states verified in
browser". The gate's verdict is *change nothing*, so this is a REGRESSION drive: the fence-line
defang rewrote the strings that go to the model from `plan.ts`, `prompt.ts` and `compose.ts`, and
the question it has to answer is whether grounding and the honesty line still work end to end.

**Question asked:** `מה היה הרווח הנקי ב-2025?` — answered from the filing, with a citation
(`ביאור 10, סעיף ג׳`), and the caveat box rendered under it.

## Every state this surface can reach

| # | State | Driven? | What was seen |
| --- | --- | --- | --- |
| 1 | **Answer with no caveat** | ❌ not driven | Needs a shelf small enough to fit the budget whole; this workspace's 214-page filing cannot. Untouched by this diff. |
| 2 | **`truncated` — files read only in part**, HE | ✅ | Amber box, `הצלחתי לקרוא רק חלק מאלה, אז ייתכן שהתשובה חלקית:` + all three titles. RTL correct. |
| 3 | **`truncated`**, EN | ✅ | `I could only read part of these, so this answer may be incomplete:` + the same three Hebrew titles, each rendering RTL inside the LTR box. |
| 4 | **`omitted` — a file not read at all** | ⚠ same render, not separately driven | `WorkspaceChat.tsx:286` concatenates `partial` (= `truncated` ∪ `omitted`) and `unreadable` into ONE `caveat` list, so the three cases are the same rendering path with different members. Row 2/3 drove that path; which list a title arrived on is not observable on screen. |
| 5 | **`unreadable` — an item whose text will not load** | ❌ not driven | Needs a deliberately broken item on a real shelf, and this is Atlas production data. Same render as row 4. |
| 6 | **`chatNoAnswer` — the model returned nothing parseable** | ❌ not driven | Not reachable from the UI without forcing a malformed model reply. Untouched by this diff. |
| 7 | **Request error (500 / network)** | ❌ not driven | Untouched by this diff. |
| 8 | **Bidi: Hebrew titles in a mixed line** | ✅ both locales | `read_page` on the box: container carries the `dir`, and each title is its own `<bdi>` (ref_114/116/118) — the shape `rules/app.md` requires, confirmed visually in BOTH directions (row 3 is the harder one: Hebrew runs inside an LTR container). |
| 9 | **Console** | ✅ | Clean. Re-checked across a FULL reload with tracking already active, because tracking that starts after load proves nothing (M1). |

**Rows 1, 5, 6 and 7 are not driven, and none of them is touched by this branch's diff.** The diff
changes what the MODEL is sent (fence-line sanitising) and adds an unused-by-default scorer
argument; it changes no string this surface renders and no branch that decides which state it is
in. Rows 2/3/8 are the ones that could have regressed, and they did not.

## 8c — has the table rotted?

Written and driven at `4b728b3`. Nothing has been committed to `src/` since. **Re-check this table
before merge if any further commit touches `src/lib/workspace/` or `src/components/workspace/`.**

## Not evidence of

Cost (unchanged — the request shape is untouched) and answer quality. The gate measured retrieval;
this drive measured the screen.
