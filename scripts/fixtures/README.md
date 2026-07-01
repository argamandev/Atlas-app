# Fixtures

The files kept here are **live dependencies** — either the gold-measurement set or data that
production code loads. Old model-comparison outputs were deleted 2026-07-02 (conclusions live in
`PROGRESS.md`; any file is recoverable from git history).

## Gold-measurement set (אמפא Q1 2026) — read by `scripts/run-experiment.ts`

| File | What it is | Source |
|---|---|---|
| `ampa-q1-2026.gold.txt` | Human-corrected "perfect" transcript — the **ruler** we score against | user |
| `ampa-q1-2026.ivrit-raw.json` | Full raw RunPod/IVRIT response: segments + `words[]{word,start,end,probability}` + `extra_data` | RunPod request log |
| `ampa-q1-2026.report.txt` | The company's quarterly report text (context experiments) | MAYA |

Scoring = diff a candidate against the gold → `errors fixed / introduced / remaining`
(`scripts/run-experiment.ts` + `scripts/lib/measure-core.ts`, unit-tested in `npm test`).

## Runtime fixture

| File | What it is | Loaded by |
|---|---|---|
| `recall-spike.transcript.json` | A real Recall transcript (participants + per-word timestamps) | `src/lib/live/loadCall.ts` (demo call) + `src/lib/live/syncEngine.test.ts` |
