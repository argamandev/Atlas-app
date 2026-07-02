# Perfect Transcripts — V1: Post-IVRIT Correction Layer (words + numbers)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

**Date:** 2026-06-08
**Status:** Design approved in brainstorm; pending spec review → implementation plan
**Scope of V1:** Implement *only* the post-IVRIT correction **logic** (words + numbers), wired
into the live pipeline and measured against the gold, so we can observe the real effect on the
product. Automatic per-company data gathering is explicitly deferred to V2.

---

## 1. Problem

IVRIT (the RunPod acoustic model) has **no domain or company context** — it emits the most
acoustically-plausible Hebrew tokens. On the reference call (אמפא Q1 2026) that's ~28 errors vs the
human gold. The current pipeline's only post-step (GPT) labels speakers and is *forbidden from
changing words*, so nothing ever fixes IVRIT's word errors.

**Source-side guidance is definitively closed.** A controlled, same-audio A/B (clean vs
`initial_prompt`+`hotwords`) produced **byte-identical** output — the hosted `ivrit-ai` wrapper
swallows those args before they reach the decoder. Proven, not assumed (`scripts/probe-bias.mjs`).
Therefore the fix **must** be post-IVRIT.

The errors fall into three classes, each with a distinct fix:

| Class | Share | Example | Why it happens | Fix |
|---|---|---|---|---|
| **Proper nouns** | ~60% | `אמפתי`→אמפא TLV (conf 0.884) | name not in model vocab; *confidently* wrong | **entity list** (model can't infer it) |
| **Domain homophones** | ~30% | `אישר`→קשרי, `קישור`→שיעור | real word, wrong in context | **sense** (context disambiguates) |
| **Numbers** | ~10% | `180%`→מעל 80% | word merged into a digit | **flag, never auto-change** |

Confidence is **not** a usable filter: the worst errors (proper nouns) are *high*-confidence, so
"correct only low-confidence words" would skip the biggest bucket.

---

## 2. Goal & non-goals

**V1 delivers:**
- A correction step (Step 0) that runs on IVRIT's raw text before formatting.
- **Words:** homophones and *inferrable* names fixed by sense (e.g. the company name, which appears
  correctly elsewhere in the text). Niche proper nouns the model can't infer (ToHa, בית אמצור) are
  **not** fixed in V1 — they wait for V2's entity list.
- **Numbers + uncertain words:** flagged (never changed), surfaced in the UI with a yellow verify badge.
- A **measurement harness** that scores any output against the gold (`fixed` / `introduced` / `remaining`).
- A **dev-facing correction log** (admin diagnostics — *not* user-visible): every applied correction
  *and* every flag is recorded per transcript as `{ original, corrected, kind, certainty, reason }`,
  so you can audit accuracy and spot **recurring** corrections — the raw material for V2's entity
  list / `KNOWN_CORRECTIONS`.
- Wired into the pipeline and testable via the existing **תמלל מחדש** A/B button.

**Explicitly NOT in V1 (later):**
- **Wiring any entity list into the shipped product** — even a hand-built one. V1 ships the
  **correction logic only**. The hand-built אמפא list exists **solely as an offline measuring stick**
  (Run B, §5) to quantify what a list *would* add — it informs V2 and is never wired into the pipeline.
- Auto-generating the entity list (GPT-knowledge / report fetch / web search / video description).
- Cross-checking numbers against the company report.
- Per-company cache / cross-call learning loop.
- Audio re-listen pass / actually *correcting* numbers.
- Confidence-based attention steering.

---

## 3. Architecture

```
runPipeline:
  IVRIT transcribe  →  raw text
        │
        ▼
  ┌─────────────────────  STEP 0 — CORRECTION (new)  ─────────────────────┐
  │  A. Build company PROFILE  (one GPT call; extends existing extractMeta) │
  │       { company, business, speakers[], topic } + entity list (hand-built)│
  │                                                                          │
  │  B. CHUNKED correction  (walk text in chunks; size tuned via the harness)│
  │       each chunk prompt = PROFILE + entity list + chunk + strict rules   │
  │       (profile built ONCE and injected — no per-chunk re-analysis)       │
  │       GPT returns a DIFF: [{ original, corrected, reason, kind, certainty }]│
  │         kind ∈ name | homophone | number ; certainty ∈ confident|uncertain│
  │       • confident name/homophone → APPLIED (exact string replace +       │
  │                                     isSafeCorrection guards)             │
  │       • uncertain (any kind) AND every number → NOT applied; emit a      │
  │                                     verify FLAG (yellow badge)           │
  └──────────────────────────────────────────────────────────────────────┘
        │ corrected text  +  number flags
        ▼
  existing formatWithGPT4o  (metadata + speakers + sections — now on clean text)
        │  (number flags attached to the lines that contain them)
        ▼
  store formatted_data  →  UI renders flagged numbers with a verify badge
```

### 3.1 Step A — Company profile (computed once)
A **new, early** GPT call (it may reuse `extractMeta`'s prompt, but runs *before* correction — note
`extractMeta` itself still runs later inside `formatWithGPT4o`, now on clean text) produces a small
structured **profile** injected into every chunk:
- `company`, `business` (plain Hebrew, e.g. `נדל"ן מניב`), `speakers[]` (name + role),
  `topic` (e.g. `סקירת תוצאות רבעון`).
- The `company` is known *before* correction (the title gives it via `getVideoInfo`), so we can look
  up the hand-built entity list for that company.
- **Entity list:** the **shipped V1 pipeline runs sense-only — no list.** A hand-built אמפא constant
  (every name read off the gold: אמפא TLV, אמפא קפיטל, אמפא ישראל, אמפא יובלים, ToHa, מיטאון,
  עזריאלי טאון, בית אמצור, סרוגו, דוראל אורבן, …) exists **only** for the offline Run B measurement
  (§5) and is **not** wired into the pipeline. Auto-generating a list is V2.

### 3.2 Step B — Chunked correction (the core)
- Split raw text into medium chunks (~300–500 words) on paragraph/sentence boundaries; small
  overlap so a span is never cut from its disambiguating context.
- The **profile is built once and injected** into every chunk prompt — GPT does *not* re-derive
  global context per chunk (no double work); the local sentences it reads to correct the chunk
  supply the local context for free.
- Each chunk → GPT with the profile + entity list + the strict rules (§3.3).
- GPT returns a **diff only** — a list of `{ original, corrected, reason, kind, certainty }`. Never
  the rewritten text. Each item is routed three ways:
  - **`confident` name/homophone → applied** by **exact string replacement** (reuse
    `applyCorrections`; gate each with `isSafeCorrection` to block risky multi-word swaps).
  - **`uncertain` (any kind) → NOT applied → emit a verify flag** (§3.4). GPT suspects an error but
    isn't sure of the fix, so we surface it rather than guess.
  - everything not in the diff stays **byte-for-byte unchanged**.
- **Chunk size is a tuned parameter**, not a fixed guess: the harness lets us measure
  `fixed`/`introduced` at 400 vs larger windows vs a single whole-transcript call and pick the best.
- The **full diff is persisted as admin diagnostics** on the transcript (both applied corrections
  and flags). The user reads a clean transcript; the dev sees every change for auditing + V2 mining.

### 3.3 The rules given to GPT (guardrails)
1. **Diff only.** Output a list of specific changes; never rewrite, rephrase, or re-punctuate.
2. **Fix only clear ASR errors** — nonsense words, domain-impossible words, and names matching the
   provided list. **Never touch style or word choice that is merely "smoother".** (This is the exact
   over-reach to avoid: changing `האחרונה`→`הנוכחית` is editing, not correcting.)
3. **Mark `certainty` on every item.** Confident of the right word → `confident` (it gets applied).
   Clearly wrong but unsure what it should be → `uncertain` (it gets *flagged*, not changed). If
   nothing is wrong, leave it out entirely.
4. **Never change a digit.** A number can be `uncertain` at most → emit a flag (e.g. for a
   logically-impossible value like >100% of revenue from a subset), never a change.
5. **Preserve everything else** byte-for-byte.
6. Use the **entity list** for names; use **sense** for homophones.

### 3.4 Verify flags — uncertain words AND numbers (flag, never guess)
- A **flag** = `{ text, reason }`, attached to the line that contains the span. Produced for:
  - any correction GPT marks **`uncertain`** (suspects an error, unsure of the fix), and
  - **every** number it judges wrong/suspect (numbers are never auto-changed).
- **UI:** the span is highlighted **yellow**; on hover it shows
  **"מומלץ לשמוע את ההקלטה כדי לוודא את התמלול."**
- V1 detection = **sense / logical-impossibility only** (report cross-check is deferred).
- Forward-compatible with Feature 3: clicking the badge will later seek the audio player to the
  span's timestamp (word timestamps already exist in IVRIT's raw output).

---

## 4. Measurement harness (built FIRST — the ruler)

`node scripts/measure.mjs <candidate.txt>`:
1. **Normalize** both candidate and gold — strip speaker headers, `[timestamps]`, punctuation,
   ניקוד; collapse whitespace; normalize Hebrew final letters.
2. **Align** candidate ↔ gold at token level (edit-distance / LCS) so a shifted paragraph doesn't
   blow up the diff.
3. **Report:** `fixed` (baseline errors now correct), `introduced` (was correct, now wrong),
   `remaining`, plus a headline **WER** vs gold.
- **Gate:** hard **`introduced == 0`**. (The gold is now self-consistent after the היוון fix, so no
  ambiguous-allowlist is needed.)
- Gold = `scripts/fixtures/ampa-q1-2026.gold.txt`; baseline = `…current.txt`.

---

## 5. Build sequence (the experiment that proves it)

1. **Measurement harness** — nothing else is trustworthy without the ruler.
2. **Correction logic, Run A — NO entity list** (pure sense). **This is the shipped V1 product
   behavior.** Run on raw IVRIT text → measure. Expect: homophones fixed, niche proper nouns still
   wrong. **= the floor for *any* company, zero data.**
3. **Run B — + the hand-built אמפא list (offline measurement only, NOT shipped).** Re-measure.
   Expect: proper nouns now fixed too. **The A→B delta = the measured value of an entity list** —
   the single number that tells us whether V2's auto-generation is worth building. Throwaway.
4. **Iterate** the chunk prompt until `fixed` climbs and `introduced == 0`.
5. **Number flagging + UI badge.**
6. **Wire into pipeline** as Step 0; verify end-to-end via **תמלל מחדש** on אמפא.

---

## 6. Files touched

| File | Change |
|---|---|
| `scripts/measure.mjs` | **new** — gold-diff harness |
| `src/lib/transcription.ts` | Step 0 correction; extend `extractMeta` → profile; reuse `applyCorrections` + `isSafeCorrection`; replace the dormant `buildCorrectionMap` body with the chunked-diff corrector. The corrector takes an **optional** `entities` arg — **empty in the shipped pipeline (Run A)** |
| `scripts/` (measurement) | the throwaway `AMPA_ENTITIES` constant lives here and is passed to the corrector **only** for the offline Run B measurement — never imported by the pipeline |
| `src/lib/types.ts` | add line-level `flags?: { text: string; reason: string }[]` (verify flags — uncertain words *and* numbers); add `corrections?: { original, corrected, kind, certainty, reason }[]` to the admin-diagnostics block on `Transcript` (next to `engine`/`model`/`processingSecs`) |
| `src/components/transcript/TranscriptEditor.tsx` | render the yellow verify badge beside flagged spans; **(admin-only)** a small diagnostics panel listing the applied corrections + flags |

---

## 7. Verification

- Re-transcribe אמפא via **תמלל מחדש**; run `measure.mjs` on the result.
- **Target:** ~28 → low single digits remaining, **0 introduced**.
- `npx tsc --noEmit` clean.
- Broader gate (later, multiple companies): a clean `/transcript-review` run. V1 success = **אמפא
  near-perfect with 0 introduced errors**, plus the Run A floor recorded for any-company expectations.

---

## 8. Risks & mitigations

- **Overfitting to one gold (אמפא).** → Keep the prompt **domain-agnostic** (the *profile* carries
  company specifics, not the prompt). Grow the gold set to 3–5 companies in a later version before
  trusting "any company".
- **GPT introducing errors** (the prior failure). → diff-only output + `isSafeCorrection` + the hard
  `0-introduced` gate. A pass that breaks anything is rejected.
- **Chunk boundaries cutting context.** → split on paragraph boundaries with slight overlap.
- **Latency / cost** of chunked calls. → only ~10–15 chunks per call; acceptable, parallelizable.
- **Numbers.** → never auto-changed in V1; only flagged. No risk of corrupting a correct figure.
