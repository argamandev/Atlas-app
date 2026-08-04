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
