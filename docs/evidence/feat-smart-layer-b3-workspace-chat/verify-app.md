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

**Yes, once — and it was RE-DRIVEN rather than re-ticked.** The table was first driven at `4b728b3`.
Cold review then found three more prompt boundaries, and fixing them (`ed225c3`) rewrote the marked-
passage block, the conversation region and the clip caption — all inside the code the drive covered.
A stale ✅ there would be worse than a ❌, so every row above was re-driven **against the tree at
`288435c`** — not re-ticked. Everything committed after that sha is docs, plus the round-2 fixes to
`selectSources.ts`, the harness and this scan; none of it touches the code these rows rendered
(`WorkspaceChat.tsx`, `planContext`, the caveat path), which is why the ticks below still stand:

| row | mark | why |
| --- | --- | --- |
| 2, 3 (`truncated`, both locales) | ✅ **re-driven** | Same question, same workspace, after the changes: same grounded answer, same citation (`ביאור 10, סעיף ג׳`), same caveat box, same three titles. No regression. |
| 8 (bidi) | ✅ re-driven | Unchanged in both locales. |
| 9 (console) | ✅ re-driven | Clean. |
| 4, 5 (`omitted`, `unreadable`) | ⚠ unchanged | Same render as rows 2/3, which were re-driven. |
| 1, 6, 7 | ❌ still not driven | Still untouched by the diff. |

The three new fixes changed what the MODEL is sent, not what the screen says — but that is a claim
about the code, and 8c exists because such claims are what rot. Hence the re-drive.

**Has it rotted again since?** Round 2 then found a sixth door and changed
`src/lib/workspace/intake/selectSources.ts` — the INTAKE prompt, which this drive never exercised
(the drive asked a question; it did not ask Atlas to fetch a file). No row above covers it, so no
row above is stale on its account, and intake gets its own row:

| row | mark | why |
| --- | --- | --- |
| 10 | ❌ **not driven** | Intake (`selectSources.ts`, `intake/route.ts`) — sanitising covered by the scan and `tsc`, not by a browser. Driving it means running the intake conversation to a file-fetch, a different surface from the honesty states this drive is about. |
| 11 | ❌ **not driven** | Compose with a clip (`compose/route.ts`'s caption). Round 3 changed how that caption is built; the change is enforced by the type checker (`captions: FenceSafe[]`, mutation-verified) and alters what the MODEL is sent, not what the screen says. |

**What rows 10 and 11 mean for a merge:** two surfaces of this feature have had prompt-construction
changed on this branch without a browser drive. Neither changes rendered text, and both are held by
`tsc` or the scan — but that is an argument, not a drive, and it is stated here rather than left as
a silent gap. A founder clicking through an intake conversation and a clip-to-compose once would
close both.

**Re-check before merge if any further commit touches `src/lib/workspace/`,
`src/lib/chat/attachments.ts` or `src/components/workspace/`.**

## Not evidence of

Cost (unchanged — the request shape is untouched) and answer quality. The gate measured retrieval;
this drive measured the screen.
