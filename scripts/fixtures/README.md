# Transcript-quality fixtures (אמפא Q1 2026)

These three files are the **ground-truth measurement set** for the transcript-quality work. The
correction layer is scored by diffing its output against the gold; the raw IVRIT JSON lets us correlate
errors with per-word confidence and pull word timestamps.

| File | What it is | Source |
|---|---|---|
| `ampa-q1-2026.gold.txt` | Human-corrected "perfect" transcript — the **ruler** we score against | user |
| `ampa-q1-2026.current.txt` | Current product output (IVRIT → GPT naming, no corrections) | product |
| `ampa-q1-2026.ivrit-raw.json` | Full raw RunPod/IVRIT response: segments + `words[]{word,start,end,probability}` + `extra_data` | RunPod request log |

## Notes
- The same audio, three views. `current.txt` ≈ what the pipeline produces today (~28 errors vs gold).
- `ivrit-raw.json` is large (~1 MB, full 21-min call) — paste the **entire** RunPod response, not a slice.
- Used by the (upcoming) gold-diff measurement harness to report `errors fixed / introduced` per attempt.
