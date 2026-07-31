# Design Round 2 — Harvey restyle: verification evidence (2026-07-25)

Branch `feat/design-round-2` · spec `docs/superpowers/specs/2026-07-25-design-round-2-harvey-import-design.md`
· plan `docs/superpowers/plans/2026-07-25-design-round-2-harvey-restyle.md` (all 8 tasks executed).

## Battery (final, on the branch head)

- `npm test`: **108/108 pass** (104 at branch start + 4 new snipBridge tests; counts from runner output)
- `npx tsc --noEmit`: clean
- `npm run build`: ✓ Compiled successfully (the two "Dynamic server usage" notes on /api/calls
  and /api/companies are pre-existing Next.js build noise for dynamic API routes)
- Console: clean on Home/Calendar/Chat/Company/call view. (One incident during verification:
  `Cannot find module './8948.js'` — self-inflicted stale `.next` from running `npm run build`
  under the live dev server; fixed by the documented kill → `rm -rf .next` → restart. Lesson
  noted in state file.)

## Parity probes (automated self-check)

`probe/harvey-design-tokens.json` (design, verified Harvey mode) vs `probe/harvey-app-tokens.json`
(app): rail · headline · body text · section labels · page bg · search box · pane-card float
recipe · composer box · panel width all **EXACT**. Two diffs found by the probe and **fixed**:
search box border/shadow, view-pill active style (black pill) + size. One **accepted** deviation:
player height 54 vs 52 (player internals intentionally ours per founder round-3 decision).
Probe caveat recorded: computed-style reads on the ticking call view can return stale values —
final word belongs to rendered screenshots.

## Screenshots (design ↔ app)

- `design-home-harvey.jpg` ↔ `app-home-en.jpg` (app shows real empty-state data; design shows demo data)
- `design-call-multi-harvey.jpg` ↔ `app-call-multi-en.jpg` (floating pane cards, floating tab
  row, black docked player, demo-marked stub report)

  > **CORRECTION (2026-07-31, reviewer BLOCKER).** This line originally claimed the Ask Atlas
  > panel was "visible in the app shot". It is **not** — `app-call-multi-en.jpg` shows the panel
  > CLOSED, with only the "+ Ask Atlas" button present. The claim was false and the branch's
  > headline surface had no committed visual evidence. Fixed by capturing it properly:
  > `app-ask-panel-en.jpg` + `app-ask-panel-he.jpg` (panel open, both locales), described in
  > `2026-08-01-review-fixes.md`.

Eyes-on sweep (Chrome MCP, this session): Home EN+HE · Calendar HE (RTL grid, mono-LTR times) ·
Chat HE · Company (Tigbur, real data) HE · finished call HE+EN single+multi · Ask Atlas panel
(hero serif, gray composer, RTL mirroring). Theme button gone from the rail; no dark surfaces
left except rail + docked player.

## Known gaps for the founder look (explicitly not silent)

1. **Authenticated real-PDF path not exercised this session** — this browser session is not
   logged in, so the Report pane showed the demo-marked stub (correct fallback behavior, demo
   pill verified visible). The composer-scissors → drag → chip → answer flow on the REAL PDF
   needs one founder-assisted pass after login (the login-link automation door was
   permission-blocked). The scissors correctly HIDES when no real document is mounted
   (snipBridge, unit-tested + verified eyes-on).

   > **CORRECTION (2026-07-31, reviewer WARNING).** "HIDES" describes the ORIGINAL contract,
   > which commit 6661c02 replaced hours later on the founder's round-2 note: the scissors is
   > now ALWAYS RENDERED and goes visibly DISABLED with no target. The module doc, the test
   > contract comment and this line all still described the superseded rule. Words aligned to
   > the shipped behaviour 2026-08-01; both states are now captured (disabled in
   > `app-ask-panel-*.jpg`, enabled+used in `app-composer-snip-gemini-en.jpg`).

   > **CLOSED (2026-08-01).** Gap 1 no longer stands: the authenticated real-PDF path was
   > exercised end to end — see `2026-08-01-review-fixes.md`.
2. **Live view + countdown not exercised against a running engine** (LiveBroadcastView got the
   identical mechanical changes as the verified finished view; countdown ring ink pinned dark
   for the light frame). A `/live-test` or replay run before launch will cover it.

   > **CLOSED (2026-08-01).** Replay pass run on :8788 (port claimed + released in
   > cross-cutting): buffering gate, countdown ring, join, live karaoke, docked LIVE player —
   > all seen against a running engine. `app-live-buffering-en.jpg`, `app-live-playing-en.jpg`.
3. Plan called for a DOM component test for the composer scissors; the repo has no DOM-test
   infra (all tests are node:test lib tests) — replaced by snipBridge unit tests + eyes-on,
   deviation documented.
