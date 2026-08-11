---
name: live-test
description: Set up and run a real live investor-call test end-to-end — restart the local engine clean, create the Recall bot for a Zoom call via a cloudflared tunnel, and monitor the pipeline (audio → captions → buffer → source-end → finish). Use when the founder wants to test the live transcript feature on a real Zoom call.
---

# Live Test — run a real Recall + Zoom live-call test

Runs the recurring live-test ritual end-to-end. **Claude is blocked from starting cloudflared tunnels** — the
founder runs the tunnel; Claude does everything else. Platform: Windows (Git Bash for `node`/`curl`, PowerShell
`taskkill` for killing processes).

## Engine variant: IVRIT pipeline (differences from the Recall flow below)

The steps below are written for the Recall engine. For the IVRIT engine (`scripts/live-ivrit-broadcast.ts`,
run via tsx — self-loads `.env.local` like the mjs engine), these swap in:
- **Bot creation** = `node scripts/start-ivrit-bot.mjs "<zoom-url>" "<tunnel-url>"` — an AUDIO-ONLY bot: no
  transcript provider, no `/recall` webhook. Same zombie rule: kill the `start-ivrit-bot` process after
  `✅` (the engine keeps :8788).
- **Caption timing**: first captions ~1 min after speech (chunker waits for a 20–45s silence-aligned chunk +
  RunPod round-trip). The 72–203s Recall accuracy-lag gotcha does NOT apply.
- `/state` carries `sessionId` (engine restart = new id; the viewer resets itself).
- **Finish flow**: identical — engine writes the shared `broadcast-*` capture files; same
  `POST /api/live/finish` → polish → finished-call page.
- Dev server/port: `npm run dev` (`:3000`), or another port if a second worktree owns it.

## Step 1 — Clean engine (fresh state every test)
The engine (`scripts/live-broadcast.mjs`) holds the call in module-level memory with NO reset, so a previous
call's state leaks. **Always restart it.**
- Kill the running engine: find the `node … live-broadcast.mjs` process whose command line does NOT contain
  `start`, and kill it (`taskkill /PID <id> /T /F`). Leave the dev server + any `…start…` process alone.
- Start a fresh engine in the background: `node scripts/live-broadcast.mjs` (self-loads `.env.local`).
- Verify clean: `curl -s http://localhost:8788/state` → expect `audioStartRel:null, liveEnded:false,
  endedAt:null, lines:[]`.

## Step 2 — Dev server
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/app/home` → 200. If not, start
  `npm run dev -- -p <port>` (background) and poll until 200. If it 500s with `MODULE_NOT_FOUND`
  the `.next` is stale → kill dev, `rm -rf .next`, restart.
- Buffer = `NEXT_PUBLIC_LIVE_BUFFER_SEC` in `.env.local`. Confirm it's the value the founder wants
  (3 min = 180, 4 min = 240). Changing it needs a dev-server restart (NEXT_PUBLIC is inlined at start).

## Step 3 — Ask the founder for the tunnel + Zoom link
Tell them to run, in their own terminal:
`cloudflared tunnel --url http://localhost:8788`
…and paste back the `https://….trycloudflare.com` URL **and the Zoom link**. (If they already pasted a
still-alive tunnel earlier, curl `<tunnel>/state` to confirm it reaches the engine — no need to re-run it.)

## Step 4 — Create the Recall bot
Once you have the tunnel URL + Zoom link:
- `node scripts/live-broadcast.mjs start "<zoom-url>" "<tunnel-url>"` (background). Read the output for
  `✅ Live bot created: <id>`.
- **Kill the zombie:** the `start` invocation never exits (module-level setInterval). Find the
  `node … live-broadcast.mjs start …` process and kill it. Confirm the engine (the no-`start` one) is still
  listening on :8788.
- Tell the founder: **admit "Timlul Live" from the Zoom waiting room**, and **hard-refresh** the live page
  (Ctrl+Shift+R — stale bundle is the #1 gotcha).

## Step 5 — Monitor the pipeline
Poll `http://localhost:8788/state` in the background (~5s) and report milestones:
- audio started (`audioStartRel` ≠ null) + the edge climbing,
- first captions (`lines` > 0) — Recall accuracy mode lags **72–203s**, so this is slow; that's NORMAL,
- buffer filled (edge ≥ buffer) → the live view is joinable,
- source ended (`liveEnded` true).
Then poll `http://localhost:<YOUR DEV PORT>/api/live/finish` until
`status: completed`, and sanity-check `/api/live/finished-call/<the id returned by the finish
flow>` is THIS call (company, ~duration, opening line) — never a hardcoded id from an old test.

> **⚠️ BOTH ENDPOINTS NAMED ABOVE NEED A SESSION** — `/api/live/finish` since 2026-08-03
> (`fix/api-security`, because it fires the paid finish pipeline and could no longer be
> anonymous) and `/api/live/finished-call/<id>` since 2026-08-01 (`fix/app-login-gate`).
> A bare `curl` or `fetch` from a terminal now gets **401**, and — this is the trap — a 401 body
> is not `status: completed`, so a poll loop written against the old recipe will simply spin
> until it times out and look like a pipeline that never finished. **Poll from the founder's
> signed-in browser** (Chrome MCP `javascript_tool` with `credentials:'include'`, which is how
> `/verify-app` already reaches gated routes), or pass
> `Authorization: Bearer <access_token>` — `getRequestUserId` accepts that path for exactly this
> kind of automation. `/api/live/state` and `/api/live/pcm` are unaffected and still open.

## Gotchas (do not re-learn)
- Claude can't start cloudflared — the founder must.
- The `start` process is a zombie — always kill it after the bot is created.
- The engine has no state reset — always restart it for a clean test.
- Stale browser bundle / stale `.next` — hard-refresh; `rm -rf .next` on a MODULE_NOT_FOUND 500.
- Recall accuracy-mode caption lag is 72–203s — the buffer absorbs it; don't mistake the lag for a bug.
