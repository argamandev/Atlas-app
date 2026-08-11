# State — frontend
<!-- Private working memory. Owner-only writes. Write before walking away; read at start. -->
<!-- Chapter: surfaces-import (Projects · Workspace · Agents). Previous chapters:
     design-round-2 (Harvey) merged 2026-08-01 e977823; design-parity archived at
     agent-memory/archive/state-frontend-design-parity-2026-07-23.md. Their Verified facts
     still govern; lessons graduated into verify-app + rules/app.md. -->

## Verified facts
- Design source: design-import/ refreshed 2026-07-23 from claude.ai project a041c61d
  (Atlas MVP.dc.html 310,406 bytes). Fetch route that works: the design viewer's GetFile
  endpoint via the founder's logged-in browser (DesignSync MCP can't write to disk; subagents
  can't see DesignSync at all). Bundle-json → unpack script.
- **The design carries its own warm→Harvey hex translation table** at Atlas MVP.dc.html
  line 154 (`[data-scheme="harvey"]` block) — THE authority for converting every old warm
  hex; my hex-sweep script (scratchpad harvey-hex-sweep.mjs) applied it to 100 occurrences.
- Design theme cycle: Harvey → Harvey light → Warm → Black rail → Black + white. Probe ONLY
  when the rail label reads exactly "Theme · Harvey" (bg rgb(250,250,250) sanity).
- Harvey anchors (probed, committed in docs/evidence/feat-design-round-2/probe/):
  mainBg #FFFFFF · body-behind #FAFAFA · paper #F7F7F7 · panel #F0F0F0 · hairline #DEDEDE ·
  ink #0A0A0A/#575757/#767676 · headlines Newsreader 500 −0.02em (42px home) · pane float =
  white/16px/rgba(28,24,14,.06) border/shadow pair · Ask panel 347px · pill row 999px.
- getComputedStyle probes on the TICKING call view can return stale values (Multi pill read
  transparent while the screenshot showed it black) — screenshots are the final word.
- `npm run build` while the dev server runs CLOBBERS .next → MODULE_NOT_FOUND white screen.
  Fix: kill dev, rm -rf .next, restart, hard refresh. Don't interleave build with eyes-on.
- Tests are an EXPLICIT file list in package.json ("test" script) — new test files must be
  appended there or they silently don't run. No DOM-test infra exists (node:test only).
- Auth: browser session cookie (Supabase); minting login links via service role is
  permission-blocked for agents — authed eyes-on needs the founder's session.

- Chrome MCP drives the FOUNDER'S OWN browser profile — my automation tab loaded /app/home
  already signed in ("Good evening, Sagi"). The old "authed eyes-on needs the founder" note in
  Verified facts is WRONG for browser work; it only holds for minting login links server-side.
  This is what let me close the composer-scissors blocker without him.

- **The DesignSync MCP CAN read the founder's design project by id** (get_project /
  list_files / get_file) even though list_projects does NOT show it — that call is filtered
  to design-SYSTEM projects only. But get_file caps at 256KiB and the design file is 409KB,
  so the browser route is still required for the big one. Endpoint:
  POST /design/anthropic.omelette.api.v1alpha.OmeletteService/GetFile {projectId, path},
  returns {content: base64}. Fetch-all-then-download-one-JSON-bundle from the page, unpack
  with a node script, verify byte sizes.
- **The design's warm->Harvey table (line 157) is INCOMPLETE for the new regions.** Five
  hexes they use are UNSET under [data-scheme=harvey] — F0ECE3, A19C90, B0AB9E, C2BCAF,
  EDE8DE — so the RENDERED design falls back to warm literals there. Porting verbatim would
  reintroduce the round-2 stray-warm-hex defect. Map by role instead; tokens.harvey.inkGhost
  #9C9C9C now covers the faintest text tier.
- **The design uses TWO headline stacks and --head-font resolves to NEWSREADER.** Anything
  using var(--head-font) is serif. But the Workspaces picker H1 is HARDCODED to the apple
  sans stack at weight 600 (line 1269) — the design is internally inconsistent, and that is
  faithful, not a bug to fix.
- The repo has a post-edit hook that runs tsc after EVERY write — a file that imports
  something not yet written is blocked immediately. Write dependencies before dependents, or
  the hook fights you; it also catches en/he dictionary drift instantly (Dictionary = typeof en).

## Lessons learned  <!-- general ones graduate into skills via the supervisor -->
- **An arbitrary Tailwind shadow with multi-layer rgba() can compile to NOTHING and fail
  SILENTLY** — the workspace floats shipped with no lift at all and it was invisible to the
  eye; only a computed-style probe caught it. Same silent-failure class as the removed call-*
  colour aliases. RULE: multi-layer shadows go through a token, never an arbitrary class —
  and probe boxShadow after adding one. STRONG candidate for verify-app's parity recipe.
- **Before building on any design value, check whether the design's own theme block maps it.**
  An unmapped var silently falls back to the pre-theme literal, so the "rendered design" is
  showing you a colour the theme never intended. Probe the var on the element that carries
  data-scheme, not on documentElement (the vars are declared on a descendant).
- Screenshot > computed-style probe on animated/ticking views (candidate for verify-app).
- Build-vs-dev .next clobber (candidate for verify-app step next to kill-stale-dev-server).
- New entry points must hide when their target is absent (snipBridge pattern) — instance of
  the visible-degradation law already in rules/app.md.
- **The hidden-tab lie also hits LAYOUT RE-FIT, not just text layers** (2026-07-31, cost ~15
  probes): with the Ask Atlas panel opened in a backgrounded automation tab, the pdf.js canvas
  kept its pre-narrowing width (1342px inside a 985px pane) across a 10s probe loop, and one
  read showed --scale-factor 3.17 (~2x). It looked exactly like a layout regression I'd caused.
  Foregrounding the tab (a screenshot) let the pending re-render land → correct 985px fit. Rule
  that would have saved the time: **before believing ANY layout/size probe, foreground the tab
  and re-probe; a size that never settles across seconds is a stalled renderer, not a bug.**
  Candidate for /verify-app's hidden-window gotcha (it currently names text layers + media only).
- Synthetic typing into a page whose composer never took focus goes to <body> and can activate
  whatever IS focused on Enter (my "send" attempt navigated the app to /app/agents). Verify the
  input actually holds focus (document.activeElement) BEFORE typing, or the "test" is fiction.
- PowerShell here-string syntax (@'...'@) in the BASH tool puts a literal @ in the commit
  subject, and force-push to fix it is hook-blocked. Use a heredoc + `git commit -F` in bash.

- **Durable screenshots ARE possible from this seat — two ways** (2026-08-01, this unblocked the
  BLOCKER): (1) `playwright` is a project dependency and its chromium is installed —
  `page.screenshot({path})` writes real files into `docs/evidence/`. Locale is a plain `locale`
  cookie, so EN/HE captures are `ctx.addCookies([{name:'locale',value:'he',domain:'localhost'}])`.
  A scratchpad script lives OUTSIDE the project, so `import 'playwright'` fails — root the
  resolver with `createRequire('<project>/package.json')`. (2) Chrome MCP `computer` screenshot
  accepts `save_to_disk:true` and returns a temp path you can `cp` into the repo — the only way
  to make an AUTHED view durable. Chrome MCP screenshots alone are NOT evidence; they expire
  with the transcript, which is precisely how the false citation survived a whole round.
- `/app/*` pages render WITHOUT auth (rules/app.md gap): the finished-call view, transcript,
  panel, workspace and company pages all captured fine unauthenticated. Only the real PDF
  (`/api/documents`) needs the session — that alone is what forces Chrome MCP.
- The live BROADCAST view is `/app/live/live` (not the demo id); `?delay=<sec>` overrides the
  buffer, and `scripts/live-replay-engine.mjs` on :8788 feeds it from `scripts/out/broadcast-*`.
  Buffering phase is where the countdown-ring overlay lives.
- Backticks inside a shell-quoted string passed to `scripts/append-log.mjs` get COMMAND-
  SUBSTITUTED — `` `snippable` `` silently vanished from a ready-queue line. Never use backticks
  in append-log text; the logs are append-only so the fix is a CORRECTION line, not a rewrite.

## Last session
- [2026-08-01 late] **CHAPTER 3 BUILT AND SHIPPED IN ONE SESSION** — feat/surfaces-import @
  c7608de pushed (10 commits, 7cad8b8..c7608de, 64 files, +5420/-239). Design landed via the
  MCP-by-id discovery + browser bundle; founder brainstorm (4 decisions, all filed); spec;
  13-task plan; built all three surfaces at FULL fidelity; verified; shipped to the queue.
  Battery 149/149 - tsc - build. 22 screenshots EN/HE + parity probe. Zero console errors.
  THE FOUNDER OVERRULED MY SCOPE PROPOSAL and was right — I proposed breadth-first (main
  state of each surface); he asked for everything, because the sub-states are where the data
  model lives. Lesson for me: when the next chapter's shape depends on what THIS chapter
  reveals, completeness beats speed, and the founder often sees that faster than I do.
  MID-CHAPTER SURPRISE: main moved (the /app/* login gate, f05b659) — merged in at 733b4ac,
  all four new routes verified gated. My 22 PNGs predate the gate and cannot be reproduced
  unauthenticated; I said so IN the evidence file and named the one post-gate authed capture
  that does prove that path, rather than leaving a reviewer to discover it. That is the
  07-31 BLOCKER lesson actually applied.
  NOW: waiting on a fresh atlas-reviewer + supervisor merge, and the founder's morning
  walkthrough. Dev server :3001 stopped (final build needed it down); design server :4321
  still up in the scratchpad.
- [2026-08-01] REVIEWER FIX ROUND SHIPPED BACK — feat/design-round-2 @ 1475ab3 pushed (3 commits
  on 88d9712; 16 over origin/main). Reviewer had returned CHANGES (1 BLOCKER / 7 WARNING / 6 NIT);
  all 14 addressed + both carried residuals closed (authed Gemini round-trip from the composer
  scissors; live surfaces against a running engine on :8788, claimed+released). Battery
  108/108 · tsc · build. Founder calls applied without re-litigation: railText #85817A (5.108:1,
  computed), Agents restyle KEPT, mic button KEPT. LESSON THAT COST THE WHOLE ROUND: an evidence
  file is a CLAIM about an artifact — I wrote "Ask Atlas panel visible in the app shot" about a
  screenshot where the panel was closed, and nobody could catch it until a reviewer opened the
  image. Write evidence captions from what is IN the frame, and say what each artifact does NOT
  show. NOW: waiting on a fresh atlas-reviewer re-gate + supervisor merge. :3001 left running.
- [2026-07-31] SHIPPED. Founder big reveal PASSED ("everything is good"); merged origin/main in
  (clean, 2 docs commits), battery 108/108 · tsc · build, pushed feat/design-round-2 @ 88d9712
  (13 commits, a9964a8..88d9712), READY entry appended to the queue. Closed the composer-scissors
  blocker myself in the founder's authed Chrome. Two founder-visible scares investigated and
  cleared as non-bugs (Chrome caret browsing; hidden-tab render stall). NOW: waiting on the
  supervisor's review+merge — Lane M's next chapter is gated on it. Nothing in flight.
- [2026-07-25] Full chapter build: spec (founder-approved, 5 decisions filed) → plan → all 8
  tasks executed → feat/design-round-2 @ ae8de31, 10 commits. Battery 108/108 · tsc · build.
  Parity: probes EXACT after 2 inline fixes (search border/shadow, black active view pill);
  accepted: player height 54 vs 52 (our player is intentionally not the design's).
  OPEN: founder big reveal · founder-assisted real-PDF composer-scissors pass · live-engine
  run for LiveBroadcastView/countdown (identical mechanical changes, unverified live).
  Dev server :3001 left RUNNING for the founder's reveal. Design server :4321 running
  (scratchpad, dies with session).
