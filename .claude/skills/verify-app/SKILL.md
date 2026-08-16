---
name: verify-app
description: Self-verification with your own eyes before claiming ANY work is done — boot the right dev server, drive Chrome via MCP, screenshot, inspect, read console errors, iterate. Use before reporting a feature works, before /ship, and whenever UI changed. Includes per-surface recipes (frontend import, ivrit pipeline, multiview PDF).
---

# Verify App — see it before you say it

Claiming "done" without looking is forbidden. Evidence = screenshots you actually inspected +
console clean + tests green.

## Core loop

1. Your dev server: `npm run dev` (`:3000`), or `npm run dev -- -p 3001` if a second worktree
   already owns 3000. KILL any dev server left from a previous session first — a stale server
   serves the OLD build and your verification lies to you (this cost a whole session on 07-23).
2. Load Chrome MCP tools (ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,
   mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,
   mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__read_console_messages" in ONE call).
3. Navigate to the changed surface. HARD-REFRESH first (stale bundle = #1 false negative).
   **SIGN IN FIRST if the surface is under `/app/*` or `/print/*` — those are gated
   (`src/lib/auth/gate.ts` `GATED_PREFIXES` + the `src/middleware.ts` matcher), so middleware
   redirects an anonymous visitor BEFORE the page renders.** A 307 to `/login` is a FAILED
   check, never a pass, and a screenshot of the login page is a real screenshot of a real page
   that sails through review. This has produced TWO false passes since the gate shipped
   2026-08-01: an anonymous screenshot that was silently the login page, and a Server-Component
   crash that 500'd EVERY project page while 191 tests, tsc and the build stayed green — found
   by the founder clicking, not by any gate (see the 2026-08-02 ALERT in
   `docs/archive/cross-cutting-2026-07-03--2026-08-10.md`).
   **HOW YOU GET THE SESSION — you already have it, so never report "cannot verify, gated".**
   The Chrome MCP drives the founder's REAL Chrome, which is signed in. Just navigate: the
   cookies are his. No password, no magic link, no credential in the transcript — this is the
   sanctioned path and it satisfies the standing rule that no assistant session may be handed a
   password. Corrected 2026-08-02, the same day the paragraph above was written claiming the
   opposite: an earlier session filed "no assistant session can sign in", then verified a gated
   `/app/chat` change in Hebrew twenty minutes later by doing exactly this. If Chrome MCP is
   unavailable in your harness, THEN say you cannot verify — not before trying it.
4. Screenshot → LOOK at it: layout, RTL/bidi, fonts, spacing, empty states.
5. Read console messages — zero uncaught errors allowed.
6. Interact (click/scroll/type) through the feature's main path.
7. Broken → fix → repeat. Only a clean pass counts as verified.
8. `npm test` + `npx tsc --noEmit` green.
8b. **ENUMERATE THE STATES FIRST, THEN MARK EACH DRIVEN OR NOT-DRIVEN.** Before writing the
   evidence, list every state the changed surface can reach — loading, empty, error, degraded,
   truncated, each fallback path — and put that list IN the evidence file with a verdict per
   row. Not a paragraph: a list, where "not driven" is a legal answer and silence is not.
   **This IS the mechanism `app.md`'s "every state driven in a browser" law now declares** —
   added 2026-08-15 (ticket 08c-2), which promoted that law from `ENFORCED none` to this ritual
   gate. No battery can see whether a human looked, so weakening this step silently un-enforces
   a law that names it. It was bought the way it always is: three new states
   existed, two were driven, and the evidence file's own "not verified" list silently omitted
   the third, so the gap read as coverage. Enumerating BEFORE driving is what makes an omission
   visible, because a row with no verdict is obvious and a missing paragraph is not.
   **A STATE A BROWSER CANNOT REACH GETS A ROW TOO** (09b): a vendor being down, a model timing
   out, a database row nobody has. Enumerating only the drivable ones is how a matrix reads as
   covered while its untestable half was never even listed. Mark it not-driven, say WHY it cannot
   be forced, and name the test that holds it instead — and if nothing holds it, that is the
   finding. 09b's five intake caveats are the worked example: two drivable and driven, three not,
   each pointing at `intake/notice.test.ts`.
8c. **A DRIVE EXPIRES WHEN THE CODE UNDER IT CHANGES — RE-CHECK THE TABLE AT MERGE, NOT AT THE
   DRIVE.** Added 2026-08-15 (ticket 08c-3), which failed this twice on ONE branch: five review
   rounds edited the surface after the table was written, and the table went on claiming ticks it
   had earned against code that no longer existed — including a row asserting a drive of copy a
   later round had rewritten. **Before merging, diff the branch since each row was driven and give
   every touched row one of three marks: re-driven ✅, or ⚠ with what changed and why re-driving is
   or is not owed, or ❌.** A stale ✅ is worse than a ❌: the ❌ is a gap anyone can see, and the
   stale ✅ is a claim nobody will re-check. This is the same "a gap reads as coverage" failure that
   bought 8b, one time-axis over — 8b makes the omission visible when the table is WRITTEN, and this
   makes it visible when the table has ROTTED.
9. Record what you verified, and record it DURABLY: screenshots can't be saved by every
   harness, so write the walkthrough/finding sheet you built into `docs/evidence/<branch>/`.
   A claude.ai artifact URL or a session screenshot alone is evidence that expires.

## Surface recipes

**Frontend import:** screenshot each imported page vs its reference in design-import/ —
side-by-side compare (structure, spacing, typography, colors). Check both EN and HE (RTL flip).
**⚠ UPDATED 2026-08-08 — this line used to say "Workspace/Agents pages must render fully from
stub data (no backend calls)", and for Workspace that recipe now passes on the wrong thing.**
`/app/agents` is still stub-fed, so it still holds there. **Workspace has a real backend**: it
persists, it calls its own routes, and it is behind the login gate — so verifying it means
signing in and checking a row SURVIVES A RELOAD, not that a page renders. A workspace that
renders beautifully from a failed fetch is the failure mode, not the pass.
Parity laws (graduated from the 7-round 2026-07 grind): (1) verify against the RENDERED
design only — serve it locally, probe computed styles / canvas measureText; bundle CSS and
template text LIE (rules/app.md has the two-font-stack story). (2) Measure the FRAME first
(rail width, page paddings, max-widths) — components can match while proportions are off.
(3) A/B EVERY page including stubs that "look done" — never invent anatomy the design
doesn't have. (4) A founder-reported visual diff gets MEASURED before any code changes
(screenshot row-profile / pixel compare) — one "loose spacing" report measured identical to
the mockup; chasing it would have broken real parity. (5) Missing data ⇒ typed stub modules
at the design's demo density — never render a sparser page. (6) The founder gate is a
side-by-side comparison walkthrough, not a claim.

**Ivrit pipeline:** replay the archived session (scripts/out/sessions/2026-07-01-tamis-live/)
through YOUR pipeline; assert programmatically: word timestamps strictly non-decreasing,
word coverage vs audio duration ≥ expected, caption-vs-audio drift within buffer budget
(unit-test these like liveTiming.test.ts). Compare transcript quality vs the Recall-path
output on the same audio (scripts/run-experiment.ts pattern). Then WATCH it: open the live
page mid-replay, screenshot karaoke, confirm highlighted word matches the audio position.

**Multiview:** the report pane must be the one the USER IS LOOKING AT, not merely mounted — in
MULTI view its column is narrow and pdf.js may not have painted a text layer at all, so a
selection-driven check finds no spans and reads as "broken" when nothing is. SINGLE view with the
Report facet renders it at once (08c-3: an evidence gap was filed as un-drivable on this alone,
then driven in both locales once the pane was foregrounded properly).
Ingest local-assets/demo-report.pdf → assert extracted per-page text contains
known Hebrew strings in CORRECT order (RTL extraction is the known risk) → render in pdf.js →
via Chrome MCP select text inside the PDF → trigger Ask Atlas → the answer must reference the
marked passage → screenshot the multi-panel layout.

## Gotchas (do not re-learn)

- **Never count test failures with `grep -c "^✖"`.** node:test prints each failure TWICE — inline
  and again under `failing tests:` — plus a `✖ failing tests:` header, so that command reports
  roughly 2n+1 and is not counting tests at all. Three wrong mutation counts reached a review
  record on one branch (08c-3) before anyone measured. Use `| grep "^ℹ fail"`, or better, state the
  PROPERTY ("the guard goes red") and the command beside it rather than a bare number — app.md's
  "counts carry their command" applies to evidence and review records too, not only to prose.
- Hard-refresh after every dev restart; `rm -rf .next` on MODULE_NOT_FOUND 500.
- Screenshot BEFORE and AFTER fixes — the before/after pair is your review evidence.
- If Chrome MCP is unresponsive 2-3 tries → tell the founder, don't loop.
- **Leave no test tabs behind**: end every verify session by closing your MCP tabs (or
  navigating them to about:blank). A leftover live-view tab from a verify pass became the
  founder's broken viewer the next day (he reused the open tab — stale React state + stale
  `?delay=` query, 2026-07-04).
- **Hidden/never-visible windows lie** (2026-07-16/17): Chrome freezes rAF + CSS transitions
  in hidden tabs (pdf.js text layers stall until foregrounded — a "missing text layer" there
  is tab visibility, not a bug) and DEFERS media loading in never-visible automation windows
  (readyState stays 0, no error). So: verify collapse/expand by CLASS not pixels, karaoke by
  DATA not motion, foreground the tab for PDF checks, and hand audible playback to the founder.
- **If audio stalls at readyState 0 browser-wide**, diagnose with a blob-URL wav — if even
  THAT won't load metadata, Chrome's media service is hung (renderers freeze on any media
  IPC): stop verifying, say so; only a full browser restart clears it. Not app code.
- **Verify interactive features via a REAL input path** (or its hit-test equivalent:
  `elementFromPoint` mid-state), never only programmatic Range/state checks — a programmatic-
  selection verify passed while actual drag-marking was 100% broken (z-index regression,
  2026-07-17). CDP synthetic drags can't create native selections; that residue goes to a
  founder hand-check.
- **Unit tests + reviews cannot see live-schema/browser/runtime-contract bugs** — the first
  real-data run of Multiview M1 found three (nonexistent column, bundler-mangled dep, buffer-
  transfer detachment). Every plan gets a real-data verification task; it is not optional.
