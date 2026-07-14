---
name: verify-app
description: Self-verification with your own eyes before claiming ANY work is done — boot the right dev server, drive Chrome via MCP, screenshot, inspect, read console errors, iterate. Use before reporting a feature works, before /ship, and whenever UI changed. Includes per-lane recipes (frontend import, ivrit pipeline, multiview PDF).
---

# Verify App — see it before you say it

Claiming "done" without looking is forbidden. Evidence = screenshots you actually inspected +
console clean + tests green.

## Core loop (every lane)

1. Your dev server, YOUR port (rules/parallel-work.md): frontend 3001 · ivrit 3002 ·
   multiview 3003 · supervisor 3000. `npm run dev -- -p <port>` in your worktree.
2. Load Chrome MCP tools (ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,
   mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,
   mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__read_console_messages" in ONE call).
3. Navigate to the changed surface. HARD-REFRESH first (stale bundle = #1 false negative).
4. Screenshot → LOOK at it: layout, RTL/bidi, fonts, spacing, empty states.
5. Read console messages — zero uncaught errors allowed.
6. Interact (click/scroll/type) through the feature's main path.
7. Broken → fix → repeat. Only a clean pass counts as verified.
8. `npm test` + `npx tsc --noEmit` green.
9. Record what you verified (one line + evidence refs) in your board section — and evidence
   must be DURABLE (/ship lane step 6): screenshots can't be saved by every harness, so write
   the walkthrough/finding sheet you built into `docs/evidence/<branch>/` in the main checkout.
   A claude.ai artifact URL or a session screenshot alone is evidence that expires.

## Lane recipes

**Frontend import:** screenshot each imported page vs its reference in design-import/ —
side-by-side compare (structure, spacing, typography, colors). Check both EN and HE (RTL flip).
Workspace/Agents pages must render fully from stub data (no backend calls).

**Ivrit pipeline:** replay the archived session (scripts/out/sessions/2026-07-01-tamis-live/)
through YOUR pipeline; assert programmatically: word timestamps strictly non-decreasing,
word coverage vs audio duration ≥ expected, caption-vs-audio drift within buffer budget
(unit-test these like liveTiming.test.ts). Compare transcript quality vs the Recall-path
output on the same audio (scripts/run-experiment.ts pattern). Then WATCH it: open the live
page mid-replay, screenshot karaoke, confirm highlighted word matches the audio position.

**Multiview:** ingest local-assets/demo-report.pdf → assert extracted per-page text contains
known Hebrew strings in CORRECT order (RTL extraction is the known risk) → render in pdf.js →
via Chrome MCP select text inside the PDF → trigger Ask Atlas → the answer must reference the
marked passage → screenshot the multi-panel layout.

## Gotchas (do not re-learn)

- Hard-refresh after every dev restart; `rm -rf .next` on MODULE_NOT_FOUND 500.
- Screenshot BEFORE and AFTER fixes — the before/after pair is your review evidence.
- If Chrome MCP is unresponsive 2-3 tries → tell the founder, don't loop.
- **Leave no test tabs behind**: end every verify session by closing your MCP tabs (or
  navigating them to about:blank). A leftover live-view tab from a verify pass became the
  founder's broken viewer the next day (he reused the open tab — stale React state + stale
  `?delay=` query, 2026-07-04).
