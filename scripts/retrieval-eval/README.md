# Retrieval eval harness

The standing retrieval quality gate (smart-layer ticket 07). Scores candidate retrieval
designs against the founder-approved eval set (`docs/eval/retrieval-eval-set.md`, mirrored
with resolved anchor ids in `cases.json`) on the **real corpus**, live from Supabase.

```
node --import tsx scripts/retrieval-eval/run.mjs            # full run — needs GEMINI_API_KEY + OPENAI_API_KEY in .env.local
node --import tsx scripts/retrieval-eval/run.mjs --lexical  # BM25 only, no embedding APIs, free
```

- `--import tsx` is mandatory: the chunker is the PRODUCTION module
  (`src/lib/corpus/chunker.ts`) — one chunker, by law (ingestion standard §5). Verified at
  the swap (2026-08-13, slice A3): identical corpus (3202 chunks, 113 windows) and an
  identical lexical row to the 2026-08-12 run.

- Runs entirely in process (brute-force cosine + in-memory BM25) — **no pgvector, no
  migration**. Installing the extension is a conclusion this harness informs, never its
  prerequisite.
- Embeddings cache to `cache/` (git-ignored, ~50MB); a rerun only pays for text that
  changed. Deleting the cache re-embeds everything (~$1).
- Each run writes `results/run-<stamp>.md` (the scored report) and
  `results/debug-<stamp>.json` (top-20 chunks per case per design, for eyeballing misses).
- **Every future retrieval change is judged by this gate** (eval-set law). Add new cases in
  `docs/eval/retrieval-eval-set.md` first (anchor verified against the live DB), then mirror
  them in `cases.json`.
