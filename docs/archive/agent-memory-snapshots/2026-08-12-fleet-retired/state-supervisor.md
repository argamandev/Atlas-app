# State — supervisor
<!-- Private working memory. Owner-only writes. Write before walking away; read at start. -->

## Where things stand (2026-08-10, rewritten after the cold meta-review)

**main = `aacb641`, pushed. Battery green: 652/652 tests (`npm test`), `node
.claude/hooks/gate-tests.mjs` → 79/79.** Counts here came from those commands at this rewrite;
re-run them rather than trusting this line — the version of this page dated 2026-08-08 asserted
`main = 713c114` and **556 tests**, and was two days and five merges cold when the meta-review
caught it.

**⚠ THE LESSON THIS PAGE ITSELF IS: I am the seat that owns the "state files must be fresh" check,
I ran that check at 01:45 today, I filed Lane M's stale state file as its worst finding, and I did
not look at my own.** Prior-audit finding 9, regressed inside the seat that owns it. Read the
newest MERGE line in cross-cutting before trusting anything below.

Merged since `713c114` (`git log --oneline --merges 713c114..main`):

| merged | what |
|---|---|
| `a94f33d` | MAYA calendar + company profiles + the empty-state honesty round (4 review rounds on one empty state) |
| `796fdbd` | Atlas renders **Israel time**, everywhere, for every viewer — founder law |
| `0b593c0` | the three israel-time gaps the hotfix left open |
| `47bf674` | **the documents catalog** — years → periods → report·presentation·transcript, no new table; invented slides DELETED |
| (today) | five environment commits: log compaction, CLAUDE.md corrections, the `rules/app.md` split + restructure |

**Atlas is LIVE on Railway at `www.timlul-ai.com` since 2026-08-08.** A mistake on main is no
longer local. `LIVE_ENGINE_URL` is still unset there, which is the only thing keeping
`/api/live/{state,pcm}` inert — see Open below.

## The single most important thing on this page

**Do not read "the route exists" as "the feature works."** Projects has been real since
2026-08-02, Workspace since 2026-08-08; **`/app/agents` is still the one persisting nothing**
(`lib/demo/DemoStateProvider`, `DemoBanner` on screen). On these very branches a project page had
never rendered once behind a green battery, the workspace intake announced "I'm pulling them in
now" over nothing for two review rounds, and Home showed every call three hours early **in
production** while 610 tests passed.

## Standing law for any new table (unchanged — still what blocks a chapter)

1. **`docs/DATA-MODEL.md` is the founder's decision, not a proposal.** Shared corpus (one copy,
   any signed-in user reads, NO `user_id`) vs personal layer (`user_id NOT NULL REFERENCES
   auth.users(id)`, RLS on BOTH `USING` and `WITH CHECK`). Projects, workspaces, agents and chat
   are personal layer. `maya_issuers` is the shared-corpus shape.
2. **`.claude/rules/db.md` ownership law — all four things at `CREATE TABLE`, never bolted on.**
   Half the existing schema is the bad half: five tables have `user_id NOT NULL` with **no foreign
   key at all**. `20260803_016_workspaces.sql` is the best worked example in the repo.
3. **Authentication is not authorisation.** Every route resolves a user (enforced by
   `apiAuthBoundary.test.ts`), but `supabaseAdmin` bypasses RLS and most older `lib/db` modules
   still use it. `projects.ts` and `workspaces.ts` are the pattern to copy — verify with
   `git grep -l "^import { supabaseAdmin }" -- src/lib/db`, **not** a `supabaseAdmin\.` grep,
   which returns the list backwards (it hits prose and misses chained calls).
4. **DDL against the shared DB is reviewed BEFORE it is applied** (graduated to `rules/db.md`
   after I got it backwards on migration 014).

## Founder decisions in force
- **The smart layer is the active chapter (2026-08-10), all of it in Lane M** — *"i will do
  everything in lane m"* — chat · agents · workspace chat as one layer. Its acceptance test is the
  live בז"א/בית זיקוק אשדוד intake defect (`intake/route.ts:87` reads only the FIRST user turn, so
  a corrected company name never reaches `resolveIssuer`, which resolves it fine).
- **Phase order (2026-08-07):** Workspace V1 ✅ → MAYA across the product (4/5 merged) → Railway ✅
  → Workspace v2.
- *"We haven't built the backend yet"* is fine; *"the UI says something untrue"* is not, and needs
  no backend to fix.
- Login/auth polish waits until the product is good — **schema never waits**.
- Lane I re-mission still DEFERRED; seat + worktree parked.
- **When a guard refuses something the founder has approved, guide him through doing it himself
  and file the record — never look for a way around the guard.** (Migration 020; and the same path
  was used again today to place the compacted logs.)

## Lessons learned
- (graduated 2026-07-14 → `rules/app.md`, `/ship`. 2026-07-23 → `/verify-app`. 2026-08-01 →
  `rules/db.md` blast radius on `auth.users`; `rules/app.md` `<bdi>`.)
- (graduated 2026-08-10 → `rules/app.md` M1–M4 meta-laws; `/ship` environment-diff gate;
  `fleet-lint` check 5 preamble budget + check 11 three-places rule.)
- **The gate that works is the one with no attachment to the work.** My worst failure this cycle
  was certifying a hardcoded-English demo marker inside a Hebrew citation from a screenshot; my
  *fix* then regressed the print path. Both caught by the cold reviewer. Keep it even when the
  founder waives it.
- **Never invite a subagent toward credentials it does not already hold.** I told a reviewer to
  "verify with the Supabase MCP if available"; it had none, so it read the token out of
  `.mcp.json`. Root cause was my prompt.
- **Counts come from a command, and today proved I still do this.** In one day I shipped: a cited
  grep that returns its classification backwards, "four matchers" when there are three, "610
  tests" when there are 652, and two harness counts thirteen lines apart that were both wrong.
  Every one was a single command away.
- **I cannot be a cold reader of a file I just rewrote.** That is now `/ship`'s environment-diff
  gate, not a resolution.

## Open, owned by me
- 🔴 **`/api/live/{state,pcm}` are unauthenticated** and inert only because `LIVE_ENGINE_URL` is
  unset on Railway — one dashboard field. **Gate them in the SAME change that sets it.**
- 🔴 **Two meta-review findings need the FOUNDER, not me:** (a) both live log headers lost their
  greppable line-type schema and the "`LINT` is RESERVED" rule in today's rebuild — prior findings
  19+20, regressed by my own compaction; the files are deny-listed so he must place the restored
  header text. (b) The `CLAUDE.md` word budget went 380 → 550 in a docs commit with no DECISION
  line, ten hours after a lint filed it as over budget — either trim or file it as his decision.
- **`public.profiles` is effectively world-writable** on a DB shared with deployed Timlul
  (always-true policy granted to `public`). Deliberately NOT fixed — destructive, hook-blocked,
  Timlul may depend on it. Founder decision.
- `NEXT_PUBLIC_SITE_HOST` in `.env.example` — founder-only, still owed.
- `PROGRESS.md:466` "rotate the Supabase token" — prior-audit finding 18, open 39 days, and the
  environment still has no home for open FOUNDER actions. Meta-review finding 20 asks for a BOARD
  section; not built.
- `docs/LAUNCH-KIT.md`: Lane F's prompt still describes the merged `feat/surfaces-import` (open
  since 07-14, fifth lint). Lane M's is banner-marked pending its re-mission brainstorm.
- Prunable merged branches: `feat/company-profiles`, `feat/workspace-tables`,
  `fix/israel-time-residue`. Three others are held by live worktrees — never delete those.
- Meta-review findings 10, 13, 16 unactioned: a `preambleBudget.test.ts` (the budget is the only
  guarantee here enforced by a paragraph instead of a test), the queue-archive filename misstating
  its own range, and `DECISIONS.md`'s generation count + three truncated entry heads.

## Ritual counters (from a command, at this rewrite)
20 MERGE · 7 LINT · **0 META** lines across live + archived cross-cutting. The meta-review ran
today for the first time since 2026-07-07, at 16 merges against a ~10-merge law — 60% late,
because it was the only periodic ritual with no mechanical trigger. `/ship` step 6 now carries
one, and **the `META` line convention starts with this audit** — append it when the report lands.

## Last session
2026-08-10 · Root-caused the workspace intake defect (filed, not fixed — it is the smart layer's
acceptance test). Compacted both fleet logs 2,744 → 543 lines and split `DECISIONS.md` out as the
permanent record; founder placed the files, since every door is sealed to me. Corrected two false
claims in `CLAUDE.md`/`ARCHITECTURE.md` found by a cold audit. Split `.claude/rules/app.md`
4,121 → 2,351 words into always-on law + `docs/case-history/app.md`, then restructured it as
LAW/ENFORCED/VERIFY with four meta-laws. Ran the overdue cold meta-review: **20 findings, 3
CRITICAL; of the 2026-07-07 audit's 26, 22 hold, 3 regressed, 1 never done.** Fixed the CRITICALs
and my own same-day defects on `fix/meta-review-2026-08-10`.
**NEXT: get that branch reviewed and merged, then the two founder items above.**
