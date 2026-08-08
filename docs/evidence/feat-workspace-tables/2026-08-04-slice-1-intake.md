# Evidence — Workspace slice 1: the intake panel becomes real (2026-08-04)

Branch `feat/workspace-tables` · lane multiview · dev server :3003, started fresh for this pass
(a stale server from 2026-08-03 21:46 was squatting the port and was killed first — verifying
against it would have served yesterday's bundle).

Spec: `docs/superpowers/specs/2026-08-04-workspace-experience-design.md` §6 slice 1.
Plan: `docs/superpowers/plans/2026-08-04-workspace-slice-1-intake.md`.

Screenshots: `2026-08-04-slice1-intake-intro-en.jpg` · `2026-08-04-slice1-confirm-list-en.jpg` ·
`2026-08-04-slice1-confirm-list-he-rtl.jpg`.

---

## What was verified, and how

### 1. The front door renders the designed panel again

`/app/workspace/<id>` on an empty workspace shows **"What are we working on today?"** with the
centred composer — not the source picker. No demo banner: nothing on this screen is fabricated
any more.

### 2. The happy path, typed in Hebrew, on real rows

Typed `אני רוצה את הדוחות והשיחות של תיגבור`.

Result: **"Found 6. Untick anything you don't want."** and six rows, **every one of them
`קבוצת תיגבור בע"מ`**, with real titles and real dates. No "keyword matches" notice, i.e. the
model interpretation succeeded and the panel said so by staying silent.

- Unticking a row moved the button from `Add 6 and open the workspace` to `Add 5` (probed in-page).
- Clicking build produced **six `201`s** on `POST /api/workspaces/[id]/items` in the server log, and
  six real rows in `workspace_items` with correct `name` and correct `kind` (document vs transcript).
- The workspace then opened populated: *"New workspace · קבוצת תיגבור בע"מ · 6 sources"*,
  `Workspace files 6`.

### 3. Both honest-failure paths, in the UI

| Typed | Rendered |
|---|---|
| `אלביט` (a company Atlas does not have) | *"I could not find anything matching that in Atlas yet."* + the rephrase hint. **No list, no fabricated result.** |
| `תיגבור 2019` | *"…קבוצת תיגבור בע"מ from that period. Here is what I do have:"* + the 6 rows that DO exist, **`anyPreTicked: false`**, button reads `Add 0` and is disabled. |

The second one is the case the slice was designed around: the company resolves, the period does
not, and the panel says both things rather than rendering an empty list.

### 4. Both locales, bidi looked at

Hebrew locale (`document.documentElement.dir === 'rtl'`, `lang === 'he'`) renders
`נמצאו 6. הסירו סימון ממה שלא תרצו.` with the layout mirrored, checkboxes on the right, and —
the part iron rule 5 is about — **`2026-07-16` stays LTR inside the Hebrew line**, `Q1 2026`
inside `דוח דירקטוריון Q1 2026` does not flip, and the numeral in
`…הכנסת 15.6.26 (צילום: ערוץ הכנסת)` sits where it belongs. Each run is its own `<bdi>`.

The founder's locale cookie was restored to `en` at the end of the pass.

### 5. Ownership, on the new route specifically

Same request, three callers:

| Caller | Result |
|---|---|
| owner (`sagi.arg@gmail.com`) | `200` |
| a workspace owned by the OTHER account | `404 {"error":"workspace not found"}` |
| anonymous (`credentials: 'omit'`) | `401 {"error":"unauthorized"}` |

RLS makes another account's workspace *not there* rather than forbidden, which is why 404 is the
correct and complete answer to both "never existed" and "not yours".

`src/lib/apiAuthBoundary.test.ts` was confirmed to actually cover the new route rather than pass
vacuously: its walk finds **36** `route.ts` files and `workspaces/[id]/intake` is among them.

### 6. Gates

`npm test` **283/283** · `npx tsc --noEmit` clean · `npm run build` green (dev server stopped
first — they share `.next`). Console: no errors or exceptions.

---

## Three defects this pass found that the tests did not

All three were invisible to a green battery, and all three are why the browser step is not optional.

### A. The model's answer was truncated, so EVERY request silently degraded

The panel showed *"I could not read that as a search, so these are keyword matches"* on every
request. The key was present and the model was answering correctly — but the answer came back
**cut off at 29 characters**: `{"company":"תיגבור","fromYear`, which `JSON.parse` rejects.

Cause: **thinking tokens are drawn from `maxOutputTokens`**, which was set to 300. Fixed with
`thinkingConfig: { thinkingBudget: 0 }` plus `responseMimeType: 'application/json'`. This is the
same root cause `.claude/rules/live.md` already files for live captions — the rule generalises
beyond captions and now has a second occurrence.

Found by adding a temporary `__debug` field to the route response, because `console.warn` from the
route never reached the captured dev-server log. **The debug field was removed and the revert
proved**: `grep -rn "__debug" src/` → 0.

### B. A Hebrew function word matched inside an unrelated word — another issuer's call, pre-ticked

`של` ("of", 2 letters) is a substring of `שלישי` ("third"), so
`דוראל - שיחת משקיעים - רבעון שלישי לשנת 2025` — **a different company's call** — matched
`…והשיחות של תיגבור` and arrived in the confirm list **already ticked**. A user pressing build
would have put another issuer's material in their workspace.

Fixed in `findSources`: minimum word length raised to 3 (Hebrew's function words are two letters),
and matching moved from substring-anywhere to **token-level** (`token === word || token.startsWith(word)`).

That fix immediately exposed a second Hebrew subtlety: **final letter forms**. `רבעון` ends in
final nun (ן) while `רבעוני` uses the regular form (נ), so a prefix test said the second does not
begin with the first — searching for a quarter would have missed every quarterly report. Both are
covered by tests.

### C. The shelf had no order at all, and a comment claimed it did

`addItem` never set `position`, so all six rows took the column default of **0** and the tab order
came from whatever the read happened to return. Meanwhile `WorkspaceIntake` carried a comment
asserting that sequential inserts preserved the user's approved order — a guarantee `addItem` never
made. **Same class as the `validate.ts` lesson already filed on this branch: a comment claiming
guarantees you do not own is the sentence that rots.**

Fixed by appending (`max(position) + 1`); the comment now describes what the code does. Re-verified
end to end on a fresh workspace: approved order and shelf order match, positions `0,1,2,3`.

Found by **querying the rows after a real build**, not by reading the code.

---

## Known, not fixed, and not mine to fix here

- **A corpus row is mis-tagged.** `דיון במכירת צים לידיים זרות - ועדת הכלכלה של הכנסת` (a Knesset
  committee video) carries `company_id` = Tigbur in `transcripts`, so it correctly appears in
  Tigbur results. That is a data problem in the corpus, not a search bug — flagged for the founder.
- **Two duplicate `דוח דירקטוריון Q1 2026` documents** exist in `company_documents`. Also corpus
  data, also surfaced honestly rather than de-duplicated behind the user's back.
- **`workspaces/836eafb3-…` ("RLS probe — owned by user B")** was created for the ownership test and
  left in place: it belongs to the other account, so this session cannot delete it through the app,
  and `delete` SQL is hook-blocked. Invisible to the founder under RLS.
- Everything slices 2–5 will fix is still visible in the populated workspace and is expected:
  the fabricated file preview, the session-only document, the demo counters, the legal panel.

---

# Addendum — the founder's two findings, same day

> *"1. in the workspace first chat, when i am writing in hebrew the text needs to appear right to
> left. 2. the responds of atlas to the files i am asking should be an llm response… i asked him to
> bring me the two quarterly reports of 2026 (the first and the second) + to bring the last
> transcribed investor call. he showed me 6 files -> that doesnt even make sense."*

## 1. RTL while typing — fixed, one attribute

The intro composer was **the only composer in the app without `dir="auto"`**. `ChatComposer` and
`PillComposer` both have it, which is why the defect only bit on a workspace's FIRST message —
the clarify-stage composer is a `PillComposer` and was already correct.

Verified by computed style rather than by eye: `dir` attribute `auto` · empty box `ltr` · typing
Hebrew → **`rtl`** · typing English → **`ltr`**.

## 2. "Six files doesn't make sense" — the design was wrong, not the code

The intake turned a sentence into a **filter** (company / year range / kinds). A filter cannot
express *"the first and second quarter"*, *"the last one"*, or *"two of these and one of those"* —
so it resolved Tigbur correctly and then returned everything it had. Behaving as specified, and
still not listening.

Replaced with a **selection** step (`lib/workspace/intake/selectSources.ts`): the model is handed
the actual candidate files and picks, then answers in its own words.

**The honesty invariant is unchanged and is enforced in code, not in the prompt** — `parseSelection`
drops any id that was not in the list it was given, so no sentence the model writes can put a file
on a shelf that does not exist. Tested, including the hallucinated-id case.

Same request, Hebrew, real corpus (58 candidates), verified in the browser:

> אני מוסיף את שני דוחות הדירקטוריון הרבעוניים של 2026 ואת שיחת המשקיעים האחרונה של קבוצת
> תיגבור. אם דרוש דוח רבעון שני, הוא לא קיים במערכת – יש רק דוחות רבעון ראשון.

**Three files ticked, not six**, and it volunteered that the Q2 report does not exist — which is
true: both documents are Q1 2026. Everything else is listed under "Also in Atlas", unticked.

## What this pass also found

- **The corpus is 58 rows, not the dozen assumed.** `loadCorpus` returns every transcript that has
  been processed, most without a company. Under the 80-row selection cap, so no narrowing runs
  today — but the narrowing stage exists for when Maya changes that.
- **Gemini returned a bare `503` "experiencing high demand"** and the whole request dropped to a
  keyword search. Correct degradation, wrong trade for an interactive path. Now: up to 3 attempts
  on 429/5xx with short backoff, then the **GPT-4.1 fallback the chat route already uses** — the
  key is already paid for and the workspace should not degrade while a working model sits idle.
  Non-transient statuses are not retried.
- The temporary debug scaffolding was removed and the revert proved:
  `grep -c "__debug\|__intakeDebug\|__geminiDebug"` → **0**.

Battery **294/294** · tsc clean.

---

# Addendum 2 — the intake is a CONVERSATION, not a form

> Founder, 2026-08-04: *"when a user sends a message about what he wants, Atlas is just turning into
> a weird loading screen. This is not the user experience we're aiming for… he needs to keep the
> same chat interface, but only ask him back, okay, so just to clarify, you want this, this and
> this. without the checkmarking, without the boxes. Just like him replying in words and texts…
> and once the user says, yeah, pull those files, then only then Atlas goes, okay, I'm pulling
> them."*

What shipped was a **form wearing a chat's clothes**: send → full-screen spinner → a grid of
tickboxes → a build button. Rebuilt as a real dialogue.

**The thread never leaves the screen.** Thinking is an inline `• • • Thinking…` line under the
user's message; pulling is an inline `Pulling the files in…`. No stage replaces the conversation,
and the composer stays available throughout.

**Atlas answers in prose and confirms before acting.** `status: 'clarifying' | 'ready'`, and
`parseSelection` treats **anything that is not exactly `ready` as still talking** — a missing,
misspelled or unexpected status can never trigger a pull the user did not ask for. Tested against
five malformed shapes.

Verified end to end in the browser, Hebrew, real corpus:

| Turn | What happened |
|---|---|
| *"תביא לי את הדוח של תיגבור ואת השיחה האחרונה"* | *"רק מוודא – אתה מתכוון לדוח הדירקטוריון… ולשיחת המשקיעים האחרונה…? זה מה שאתה רוצה שאמשוך?"* — **nothing pulled** |
| *"כן, אבל תוסיף גם את השיחה של רבעון רביעי 2025"* | re-confirmed all **three** files in one sentence — **nothing pulled** |
| *"כן"* | pulled, and the workspace opened with **exactly 3 sources** |

Shelf rows afterwards, in the agreed order: `0` דוח דירקטוריון Q1 2026 (document) · `1` שיחת
משקיעים רבעון ראשון 2026 (transcript) · `2` שיחת משקיעים רבעון רביעי 2025 (transcript).

## Two defects found while verifying this

### The model printed raw ids at the user

Observed on screen: *"…של תיגבור (e231c676-23d6-4a86-8d02-…) ולשיחת המשקיעים (PyuMxe88e8g_live)?"*
A uuid in the middle of a Hebrew sentence is exactly the machine-feel this step exists to remove.
Fixed in the prompt **and** backed by a deterministic scrub (`stripIds`) that removes known corpus
ids and the brackets left holding nothing — an instruction alone is not a guarantee. Tested.

### A 60-second spinner, from a retry policy written for a background job

Gemini was timing out at **20s × 3 attempts** before the fallback model got its turn, so the
founder sat on `Thinking…` for a full minute (three consecutive `[intake] Gemini call failed: The
operation was aborted due to timeout` in the dev log, one request at **27,756ms**). The policy had
been copied from the finish pipeline, which can afford it. Now **7s, two attempts, then GPT-4.1**.

### And one the prompt had to fix

With the first prompt, *"כן, תמשוך אותם"* ("yes, pull them") produced **another confirmation
question** — a loop, and the precise thing the founder objected to. The prompt now carries an
explicit anti-loop rule: if the previous message already named the files and the reply agrees, even
a bare "כן", that IS agreement and the status must be `ready`. Verified: a bare `כן` pulls.

Battery **300/300** · tsc clean.

---

## Addendum 3 — four founder reports after using it (2026-08-04, commit `4a910d9`)

> *"1. it responds very slow… 2. i asked him to pull certain documents. he said just to be clear i
> need to pull this and this. and then i sayd yes. and then he kept on asking twice just to be
> clear… + he only pulled 1 file while i asked for two files and we agreed on them. + there isnt
> any multi view function at the pulled files and on the top right there is a screen icon — what
> does he represents?"*

Reports 2 and 3 turned out to be the same bug. Report 4 was two bugs plus a mislabelled control.

### 1 — latency, measured from the dev log

| Turn | Before | After |
|---|---|---|
| opening request | 12 516 ms · 14 738 ms · 27 756 ms · 68 807 ms | **4 639 ms** |
| the "כן" that pulls | 15 572 ms | **535 ms** |

Cause was not the model but the ORDER: `askOpenAi` only ran after Gemini exhausted two 7 s
timeouts plus a backoff, and Gemini was returning `503 "This model is currently experiencing high
demand"` all afternoon. Now hedged — OpenAI starts 1.2 s in and the first usable answer wins
(`firstUsable`, deliberately not `Promise.race`, which would let the fast failure win). Gemini's
retry was deleted: a second provider is a better second attempt than the one that just shed load.

### 2 + 3 — the agreed set was never held anywhere

Every turn re-ran the model over the whole thread and asked it to re-derive the selection from its
own Hebrew prose. So it could re-ask a settled question, and it could emit one id where it had
named two — and no code could tell either from a legitimate answer. Fixed structurally:

- `IntakeTurn.proposed` carries the ids an assistant turn named; re-validated against the corpus
  server-side (untrusted input, and it cannot widen reach — a stranger's id is not in the corpus).
- `isBareAgreement()` — a **closed vocabulary**. A message that is nothing but agreement pulls the
  standing proposal with **no model call at all**, so the loop and the dropped file are impossible
  rather than discouraged. `"כן, אבל תוסיף גם את השיחה של רבעון רביעי 2025"` is NOT a bare yes and
  takes the ordinary path — 15 tests, including every negative case.
- `reconcileSelection()` — **omission is not removal**. At `ready` the proposal is restored under
  whatever the model re-typed; only an explicit `removed` drops a file.

The previous attempt at this was a prompt paragraph telling the model not to do it. It did it
anyway. Filed as the recurring lesson: **the rule that matters is the one in the code.**

### 3b — and what "only pulled 1 file" probably looked like

`workspace_items.is_open` defaults to `false`, so three agreed files produced three rows and **one
tab** — `WorkspaceShell` found nothing open and fell back to `files[0]`. Two rows written, one ever
presented; from the outside those are indistinguishable. `addItem` now sets `is_open: true` (in the
insert, not as a column default — that is a statement about *attaching*), and a workspace with
nothing recorded as open shows the whole shelf rather than picking one file out of it, which also
repairs every workspace built before this commit.

### 4 — multi-view was unreachable and mislabelled

The control was the split toggle drawn as `SlidesIcon` — a projector screen on a stand. Clicking it
set `split` while `multi` was still `[]`, so `docsShown` resolved to nothing and the workspace said
"Nothing open". **The screen must never blank as a result of a view control.**

- `toggleSplit` seeds `multi` with every open tab — founder decision, asked directly: one click
  shows all open files side by side, close what you don't want.
- Glyph shows the state it takes you to (`ColumnsIcon` ⇄ `SinglePaneIcon`), `aria-pressed`, and the
  tooltip names both states.
- Special tabs are panes like any other — founder called reading a source while writing about it
  "the main point". One pane renderer for every tab kind; the old separate full-width branch for
  specials is why the document could never sit beside a file.
- `doc_title` defaults to `''`, so the document had no name — a blank line in the panel and, once it
  could be a tab, a chip containing only a close button. Falls back to a localised "Untitled
  document".

### Verified in the browser, both locales

3-file Hebrew request → Atlas confirms **in words**, pulls nothing → bare `כן` → **3 tabs open**,
multi-view → **3 panes**, working document opens as a **4th pane**. Single view returns without
blanking. Zero console errors. RTL screenshots:
`2026-08-04-multiview-3-panes-he-rtl.jpg`, `2026-08-04-multiview-single-view-he.jpg`.

Battery **320/320** · `tsc` clean · `next build` green (dev stopped first — and the stale Next
process survived `TaskStop` and kept the port, so the build did hit a live `.next`; recovered by
the documented route: kill, delete `.next`, restart).
