# Live-engine law & gotchas (read before touching live code)

- Engine `scripts/live-broadcast.mjs` (:8788) holds call state in module memory, NO reset —
  restart it for every clean test. It truncates `scripts/out/broadcast-*` per run (archive
  captures you care about to `scripts/out/sessions/`).
- STALE BROWSER BUNDLE is the #1 gotcha: hard-refresh (Ctrl+Shift+R) after every dev restart.
  MODULE_NOT_FOUND 500 = stale `.next` → kill dev, `rm -rf .next`, restart.
- Recall accuracy-mode captions lag 72–203s — the buffer absorbs it; it is NOT a bug.
- Buffer = `NEXT_PUBLIC_LIVE_BUFFER_SEC` (inlined at dev-server start; restart to change).
- Gemini live correction: `thinkingBudget: 0` is mandatory (thinking leaks into captions);
  paid tier mandatory (free tier 429s under live load).
- The model: a call is LIVE (incl. buffer drain at 1×) or FINISHED — no "processing" surface.
- Cloudflared tunnels are founder-run only and expire — never reuse an old tunnel URL.
