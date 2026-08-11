---
name: transcript-review
description: Quality gate for Hebrew investor-call transcripts. Runs a batch of YouTube/Vimeo links through the live local product, audits every transcript line for Hebrew typos, proper-noun errors, speaker mislabeling and bidi issues, and reports proposed KNOWN_CORRECTIONS fixes back to the main agent. Use when validating transcription quality or before declaring Feature 1 done.
---

# Transcript Review — the quality gate

You are auditing the **real output** of Atlas's transcription pipeline to drive it toward perfect
Hebrew transcripts. This is the standing quality gate for finished transcripts (it will anchor the
future "higher-quality transcripts" mission). You **report**; you do not silently change product
code. The dispatching session vets and applies fixes.

## Step 1 — Run the batch

1. Confirm URLs exist: `scripts/review-urls.txt` (one YouTube/Vimeo URL per line). If empty, ask the
   user for links and stop.
2. Ensure the dev server is up on your dev port (`npm run dev`, `:3000` by default;
   `npm run dev -- -p <port>` in your worktree). If it is not reachable, start it (or tell the
   founder) and stop.
3. Confirm `.env.local` has `REVIEWER_EMAIL` / `REVIEWER_PASSWORD` (a real low-priv account) plus the
   Supabase vars. If missing, tell the user and stop.
4. Run: `node scripts/transcribe-batch.mjs`
   - It submits each URL via `POST /api/transcripts` (Bearer auth), polls to completion, and writes
     `scripts/out/<id>.json` per transcript + `scripts/out/_run.json` (run summary).
   - Each transcript can take a few minutes (IVRIT on RunPod). Let it finish.

## Step 2 — Audit each transcript

Read every `scripts/out/<id>.json` (each is a `Transcript`: see `src/lib/types.ts`). Walk
`sections[].lines[].text` and `speakers[]`. Hunt specifically for:

- **Hebrew spelling / homophone typos** — e.g. מנכ"ל→מרכז, צמיחה→צמחיה, ריבון→רבעון, תוצאות↔הוצאות.
- **Proper-noun / company errors** — e.g. פרודלים→פרודלין. Cross-check against the video title and
  the company field; flag names that look phonetically mangled.
- **English-term mangling** — מגה-וואט, EBITDA/DCF/IPO and similar acronyms spelled phonetically.
- **Number / units garbling** — wrong digits, percentages, currency, quarters (Q1/Q2…), dates.
- **Speaker mislabeling** — wrong speaker attributed to a line; CEO/CFO/analyst mixed up; an
  unidentified speaker that the context clearly names.
- **Bidi / RTL breakage** — Hebrew next to numbers/Latin rendering out of order; misplaced punctuation.
- **Structure** — sections that are mis-split, empty, or out of order.

Compare against `KNOWN_CORRECTIONS` in `src/lib/correction.ts` — don't re-propose
entries that already exist.

## Step 3 — Report back to the main agent

Produce a concise report, grouped per transcript, then a consolidated fix list:

1. **Per transcript** (`<id>` · company · quarter · engine · model · processingSecs): a bullet list of
   issues, each as `wrong → correct` with a short line excerpt for context and the speaker/section.
2. **Proposed `KNOWN_CORRECTIONS` additions** — a deduped list of exact-phrase `'wrong': 'correct'`
   pairs. Only include **high-precision, safe** fixes that satisfy `isSafeCorrection` (in
   `src/lib/correction.ts`): `wrong` ≤ 35 chars; a 1-word→2-word split is allowed; never multi-word
   additions; never a meaning change. Put anything ambiguous in a separate "needs human judgment"
   list instead — do **not** smuggle risky changes into the corrections map.
3. **Non-dictionary issues** — speaker/structure/bidi problems that corrections can't fix, with a
   suggested code or prompt change (e.g. a tweak to the speaker-tagging or formatting prompt).

Do **not** edit `correction.ts` yourself. Hand the report to the dispatching session, which applies
vetted entries, re-runs this skill, and confirms the issue is gone. Loop until the report is clean —
a clean report is the definition of "transcript quality gate passed".
