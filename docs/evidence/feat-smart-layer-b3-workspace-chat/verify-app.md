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
| 10 | ✅ **DRIVEN 2026-08-15** (was ❌) | Intake (`selectSources.ts`, `intake/route.ts`) — closed by 09b's drive below, which runs the intake conversation all the way to a file-fetch in both locales. |
| 11 | ❌ **not driven** | Compose with a clip (`compose/route.ts`'s caption). Round 3 changed how that caption is built; the change is enforced by the type checker (`captions: FenceSafe[]`, mutation-verified) and alters what the MODEL is sent, not what the screen says. |

**What rows 10 and 11 mean for a merge:** two surfaces of this feature have had prompt-construction
changed on this branch without a browser drive. Neither changes rendered text, and both are held by
`tsc` or the scan — but that is an argument, not a drive, and it is stated here rather than left as
a silent gap. A founder clicking through an intake conversation and a clip-to-compose once would
close both. **Row 10 is now closed by the 09b drive; row 11 still stands.**

---

## 09b — the `@` company mention in the intake (2026-08-15)

Ticket `.scratch/smart-layer-build/issues/09b-intake-company-mention.md`. Driven on `localhost:3000`
against live MAYA and the live company directory. **This is also the drive row 10 was asking for**,
since it runs the intake conversation to an actual file-fetch.

**The founder's own failing case, end to end.** `בז"א` resolves to NOTHING by name (measured — see
the ticket), so the old surface answered "I don't have their documents" about a company holding 12
filings. Typing `@בז` now lists both refineries with logos; picking בית זיקוק אשדוד and asking for
the latest reports returned MAYA's real Q1-2026 report and May-2026 deck, and `כן` pulled both onto
the shelf (the 38-page PDF rendered).

| # | state | locale | mark |
| --- | --- | --- | --- |
| 1 | `@` BUTTON on the tall intro composer opens the picker | EN | ✅ driven |
| 2 | picker filtered by a typed fragment (`בז` → בזק · בית זיקוק אשדוד · בתי זיקוק) | EN | ✅ driven |
| 3 | picked → chip `@בית זיקוק אשדוד` + "Remove the company", `@` LEFT of the Hebrew run (zoomed) | EN | ✅ driven |
| 4 | sent WITH a pin → MAYA's real filings offered, `כן` → both attached and rendered | EN | ✅ driven |
| 5 | typed `@` (no button) opens the picker on the PILL composer, in the panel variant | HE | ✅ driven |
| 6 | picker MIRRORS in RTL (logos right, header right) | HE | ✅ driven |
| 7 | **Enter picks and does NOT send** | HE | ✅ driven — **failed first, see below** |
| 8 | Enter with NO matching rows (`@zzzqq`) still SENDS — no dead key | HE | ✅ driven |
| 9 | pin outranks the sentence: a turn reading `@בית זיקוק אשדוד @zzzqq` still answered about בז"א | HE | ✅ driven |
| 10 | unpin → chip gone | HE | ✅ driven |
| 11 | no pin at all → typed `תביא לי את הדוחות של תיגבור` behaves exactly as before | HE | ✅ driven |
| 12 | console | both | ✅ clean |
| 13 | a pinned company with NO `tase_issuer_id` | — | ❌ **not driven** — 233 of 234 companies have one, and the odd row is not identified; covered by `companyPin.test.ts` only. |

### Re-driven after the round-5 review (same day, same session)

The review returned CHANGES on this commit. Its fixes changed behaviour in three of the states
above, so those were driven again rather than argued about:

| # | state | locale | mark |
| --- | --- | --- | --- |
| 14 | **the send ARROW with the picker open** — was a dead button (guard sat on every send path); now sends | HE | ✅ driven |
| 15 | unknown-company notice, with its NEW wording pointing at `@` | HE | ✅ driven — *"לא זיהיתי חברה בשם הזה. אפשר לבחור אותה מהרשימה עם @"* |
| 16 | rows 7 and 8 (Enter picks / Enter sends when empty) after the guard moved behind `fromKey` | HE | ✅ re-driven, unchanged |
| 17 | the same unknown-company notice, EN wording | EN | ✅ driven — *"I couldn't identify a company by that name. You can pick it from the list with @…"* |

**Observed while driving row 17, and NOT fixed:** `notice` is held in state as a resolved STRING, so
switching locale mid-conversation leaves the previous turn's caveat in the old language until the
next turn replaces it. Pre-existing shape, not introduced here, and now cheap to close because
`chooseIntakeNotice` returns a KEY — storing the key and resolving the copy at render would do it.
Filed in the 09b ticket rather than fixed, because it is outside the founder's stated scope.

**The notice matrix itself is now held by a TEST, not by this table.** The review's third finding was
right that the state this commit actually changed server-side — which of the five caveats the panel
shows — was not enumerated here at all. Rather than enumerate five browser states, two of which
(`maya_unreachable`, and a filter-model timeout) cannot be forced from a browser without breaking the
environment, the decision moved OUT of the component into `lib/workspace/intake/notice.ts` and is
swept exhaustively by `notice.test.ts`. What remains ritual is only that the WORDING renders, which
rows 15 and the earlier rows cover.

| notice | how it is held |
| --- | --- |
| `unknown_company` | ✅ driven (row 15) + test |
| `request_partly_understood` (new) | ❌ not driven — needs the filter model to time out mid-turn, which cannot be forced from a browser. Held by `notice.test.ts`, which pins that it is never silent and never the same line as `request_not_understood`. |
| `maya_unreachable` | ❌ not driven — needs MAYA down. Pre-existing, untouched by this commit, held by the test. |
| `request_not_understood` | ❌ not driven — same reason as the pinned variant. Pre-existing. |
| `unresolved` | ❌ not driven — pre-existing, untouched. |

**Row 7 is why this drive existed.** The first implementation guarded Enter with
`onKeyDownCapture` + `stopPropagation` on the composer, reasoned from how `ChatComposer` is wired.
In the browser one Enter BOTH picked בית זיקוק אשדוד and sent `@בז` as a question: a React capture
handler cannot stop a bubble handler on the SAME element. `tsc` and 1160 green tests said nothing —
M1, exactly. The guard now sits in `send()`, the one function every composer, key and button passes
through, and asks whether the picker is SHOWING ROWS rather than whether an `@` is being typed
(M3.2 — row 8 is the case that proxy would have broken).

**Re-check before merge if any further commit touches `src/lib/workspace/`,
`src/lib/chat/attachments.ts` or `src/components/workspace/`.**

## Not evidence of

Cost (unchanged — the request shape is untouched) and answer quality. The gate measured retrieval;
this drive measured the screen.
