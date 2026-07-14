# Task 8 report — quality comparison vs Recall captions + whole-file IVRIT reference

## Status: DONE

## What was built

- `scripts/compare-live-quality.ts` — written per the brief's Step 1 code, extended per Step 2/3
  with a third reference: when `scripts/out/ivrit-wholefile.txt` exists (env `WHOLEFILE` to
  override), it also tokenizes that file and prints agreement + 10 divergence windows against it,
  using the same `tokenize`/`lcsGoldMatched` code from `scripts/lib/measure-core.ts`. Falls back to
  a one-line note if the wholefile reference doesn't exist yet.
- `scripts/make-wholefile-reference.ts` — written verbatim per the brief's Step 2 code. Loads
  `.env.local` into `process.env` before the dynamic `import('../src/lib/transcription')` (the
  Supabase client reads env at import time), wraps the archived PCM as a WAV via `pcmToWav`, and
  submits ONE whole-file job through the existing proven `transcribeAudio` path.

## Whole-file reference run (RunPod, run once)

```
node --import tsx scripts/make-wholefile-reference.ts
```

Job `9186c0cf-2423-4358-84df-b31b1924198c-e1` on `ivrit-ai/whisper-large-v3-ct2` (diarize: true),
polled ~5 status checks to `COMPLETED`:

```
reference saved (ivrit/ivrit-ai/whisper-large-v3-ct2, 613 chars) -> scripts/out/ivrit-wholefile.txt
```

`engine=ivrit` as expected. 613 chars is well under the brief's "a few thousand chars" ballpark —
consistent with Task 7's finding that this archived source clip is speech-sparse (long
silence/filler stretches), not a dense real call; the whole-file run saw the same sparse content
the chunked run did, just re-transcribed without chunk boundaries.

## Comparator run — full output

```
node --import tsx scripts/compare-live-quality.ts
```

```
IVRIT tokens: 146 | Recall tokens: 106 | LCS overlap: 60
agreement vs Recall: 56.6% | vs ours: 41.1%
  recall-only @2: …בואו נתחיל לזכיר את המשקיעים שלנו…
  recall-only @28: …דברים די מגניבים פרונטנט מאוד מאוד מגניב…
  recall-only @29: …די מגניבים פרונטנט מאוד מאוד מגניב מה…
  recall-only @30: …מגניבים פרונטנט מאוד מאוד מגניב מה יש…
  recall-only @32: …מאוד מאוד מגניב מה יש דברים מתחילים…
  recall-only @45: …מאוד טוב בואו שנייה נראה איך הדברים…
  recall-only @48: …שנייה נראה איך הדברים נהיים וואו וואו…
  recall-only @53: …וואו וואו וואו וואו А на на…
  recall-only @54: …וואו וואו וואו А на на Та…
  recall-only @55: …וואו וואו А на на Та на…

Wholefile tokens: 112 | LCS overlap (ours vs wholefile): 68
agreement vs wholefile: 60.7% | vs ours: 46.6%
  wholefile-only @3: …בואו נתחיל את סרט המשיחים שלנו בואו…
  wholefile-only @4: …נתחיל את סרט המשיחים שלנו בואו נתחיל…
  wholefile-only @28: …דברים די מגניבים פונטנט מאוד מאוד מגניב…
  wholefile-only @29: …די מגניבים פונטנט מאוד מאוד מגניב דברים…
  wholefile-only @30: …מגניבים פונטנט מאוד מאוד מגניב דברים מתחילים…
  wholefile-only @43: …מאוד טוב בואו שנייה נראה איך הדברים…
  wholefile-only @46: …שנייה נראה איך הדברים נראים וואו וואו…
  wholefile-only @47: …נראה איך הדברים נראים וואו וואו וואו…
  wholefile-only @51: …וואו וואו וואו וואו וואו וואו וואו…
  wholefile-only @52: …וואו וואו וואו וואו וואו וואו וואו…
```

## Interpretation

Token counts are the same order of magnitude (146 ours / 106 Recall / 112 whole-file) — consistent
with Task 7's finding that the source clip is speech-sparse (387s of mostly silence/filler,
146 words total). Per the brief's framing:

- **ours-vs-wholefile (chunking cost isolated, same model)**: 60.7% agreement (46.6% of our
  tokens land in the whole-file reference). The 10 divergence windows are almost entirely two
  things: (1) loanword phonetic-spelling variants of "frontend" — פרונטנד / פרונטנט / פונטנט,
  three different renderings of the same English loanword across the three transcripts, and
  (2) differing repeat-counts on the "וואו" (wow) filler loop — this source audio contains long
  runs of repeated "wow" / "thank you, Mr. chairman" that read as smoke-test/loopback content
  rather than real call speech, and Whisper-family models are known to hallucinate variable
  repeat-counts on that kind of repetitive/silent audio depending on chunk boundaries. This reads
  as a **chunk-boundary artifact on repetitive filler, not a systematic loss of real content**.
- **ours-vs-Recall (competitive delta)**: 56.6% agreement (41.1% of ours). Same two divergence
  patterns (loanword spelling, wow-loop repeat-counts) plus one clear Recall-side defect: windows
  @53-55 show Recall's captions degrading into Cyrillic garbage ("А на на Та на") on a difficult
  stretch — an artifact IVRIT did not produce anywhere in its output. Recall's raw captions have
  their own mistakes, as the brief anticipated.

Numbers are noisy by design (only 146 words on a 387s clip, ~35 tokens per 10-window sample) — not
tuned or re-run to chase better percentages, per instructions. No sign that chunking drops real
content on this source; the visible divergence is dominated by loanword-spelling variance and
repeat-count hallucination on a repetitive/filler-heavy smoke-test clip, which is exactly the kind
of audio Task 7 flagged as unrepresentative of a dense real call.

## Board

Updated only the `last verified:` line of the Lane I section in
`C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md` (timestamped `[2026-07-03]`) with the numbers
above and this subjective read. No other section of that file was touched.

## Commit

```
git add scripts/compare-live-quality.ts scripts/make-wholefile-reference.ts
git commit -m "feat(ivrit-live): quality comparator vs recall captions + wholefile ivrit reference"
```

`scripts/out/ivrit-wholefile.txt`, `scripts/out/wholefile-ref.log`, and
`scripts/out/compare-output.log` are under the gitignored `scripts/out/` — not committed, matching
prior tasks' handling of generated run artifacts.

## Concerns

None blocking. Worth flagging for whoever reads this next: this source clip's dominant content
(repeated "wow" and "thank you, chairman" loops, plus lines like "let's check that our product
works") is smoke-test/loopback audio, not a real investor call — so this comparison validates the
*pipeline mechanics* (chunking vs whole-file, ours vs Recall) but says little about transcription
quality on real Hebrew investor-call speech. That's Task 9 / `/transcript-review`'s job on a real
call, as the brief anticipated.
