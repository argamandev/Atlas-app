# Open findings — NOT laws. Do not cite these as invariants.

Moved out of `.claude/rules/app.md` on 2026-08-12: these are open items, not invariants, and
`CONTEXT.md` reserves the always-on set for law. An agent touching the code an entry names should
read it; nothing else needs it loaded.

Each needs a decision or a window, not a drive-by fix. Re-verified 2026-08-10.

- **`GET /api/live/{state,pcm}` are unauthenticated** (boundary-test allowlist, marked OPEN there
  too). The mitigation once written for them is false and was refuted the same day: both read
  `process.env.LIVE_ENGINE_URL || 'http://localhost:8788'`, and that variable exists precisely to
  point a deploy at a tunnelled engine. They are inert on `www.timlul-ai.com` only because it is
  unset — one dashboard field wide. **⇒ Gate them in the SAME change that sets it. A follow-up is
  not a plan, it is the window.** → `#api-auth-boundary-test`
- **`.gitattributes` is absent while `core.autocrlf=true`** (both confirmed 2026-08-10).
  `* text=auto eol=lf` would close the CRLF trap structurally, but it is a repo-wide behavioural
  change and must not ride in on a feature merge. Founder decision. → `#crlf`
- **Two UTC leaks, not user-visible:** `api/workspaces/[id]/intake/route.ts:542` (UTC `{TODAY}`;
  `{Y0}`/`{Y1}` server-local at 543–544) and `src/lib/maya/events.ts:106` (`getUTCFullYear`
  labelling a fiscal year). → `#timezone-israel`
- **`PUT /api/transcripts/[id]` is a standing route around the admin-only curation gates**
  (recorded 2026-08-13, reviewer finding on `fix/speaker-edit-admin-gate`). The PUT is
  owner-or-admin and replaces the whole `formatted_data` — speaker names included — so a
  non-admin OWNER can rewrite speaker attribution that the PATCH gates now reserve for admins
  (docs/DATA-MODEL.md, "Writes to the shared corpus are CURATION"). Not exposed today: queried
  2026-08-13, 3 corpus rows are owned by the one admin and 2 are ownerless (→ admin-only).
  The decision it needs is the founder's: does a transcript's OWNER keep full-content edit
  rights on a shared-corpus row (then the curation law needs an owner-exception stated), or
  does the PUT become admin-only / field-restricted too? Natural home: ticket 13's menu or
  the smart-layer spec (ticket 10).
