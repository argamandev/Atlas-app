# Retrieval eval harness

The standing retrieval quality gate (smart-layer ticket 07). Scores candidate retrieval
designs against the founder-approved eval set (`docs/eval/retrieval-eval-set.md`, mirrored
with resolved anchor ids in `cases.json`) on the **real corpus**, live from Supabase.

```
node scripts/retrieval-eval/run.mjs            # full run — needs GEMINI_API_KEY + OPENAI_API_KEY in .env.local
node scripts/retrieval-eval/run.mjs --lexical  # BM25 only, no embedding APIs, free
```

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
