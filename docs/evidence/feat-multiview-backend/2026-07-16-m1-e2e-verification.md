# Multiview M1 — end-to-end verification (Lane M, 2026-07-16)

Branch `feat/multiview-backend` @ `47ac911` (verification pass ran against `b1e0240` + founder settings commit).
Verifier: Lane M session, Chrome MCP on `http://localhost:3003/app/live/demo`, eyes-on.

## What was verified (in order, same session)

1. **Migration applied to the shared DB** via `mcp__supabase__apply_migration`
   (`20260714_012_company_documents`). SQL check confirmed: `company_documents` +
   `document_pages` exist, `rowsecurity=true`, 1 authenticated-read policy each.
2. **Demo report seeded**: `npx tsx scripts/ingest-document.ts --file .../demo-report.pdf
   --company 1105022 --quarter "Q2 2026" --type report` → document
   `7b5a2be6-feeb-4bcd-bf2a-f9d890a3b49b`, 31 pages. SQL check: 31/31 `document_pages`
   rows with >50 chars of text; page-2 sample reads in correct Hebrew logical order
   ("חלק א' - הסברי הדירקטוריון למצב עסקי החברה..."). Storage object 686,115 bytes.
3. **Report pane renders the real PDF** in the call view's Multi mode (dark theme):
   white paper pages, Hebrew title page ("דוח הדירקטוריון על ענייני התאגיד..."),
   numbered lists and bold run-ins correct RTL, financial table page shows LTR numbers
   inside RTL layout correctly.
4. **Mark text inside the PDF → Ask Atlas**: drag-selected Hebrew prose on page 2.
   The Ask Atlas panel received the reference chip with the exact selected passage
   ("...בתחומים שונים וכן שרותי שמירה ואבטחה ולה40 סניפים ברחבי הארץ. לחברה ארבעה
   תחומי פעילות המדווחות כמגזרים").
5. **Grounded streamed answer** to "מה הקטע המסומן מספר על תחומי הפעילות של החברה?" —
   answer text (captured from the DOM, verbatim): "על פי הקטע המסומן בדוח הדירקטוריון,
   החברה מספקת שירותים בתחומים הבאים ולה 40 סניפים ברחבי הארץ:" + section "תחומי
   הפעילות המוזכרים בקטע המסומן" listing "שירותי כוח אדם בתחומים שונים" and
   "שירותי שמירה ואבטחה". The answer explicitly references the marked report passage.
6. **Light theme**: toggled in-view; PDF pages stay paper-white, pane layout intact.
7. **Console**: zero uncaught errors after the fixes below (only pre-fix errors remained
   in the buffer, timestamped before the last reload).
8. **Auth posture**: `GET /api/documents?...` and the file route return 401 without a
   session (curl); in-browser (signed-in) both return 200.
9. **Battery** (after all fixes, post-merge with origin/main): `npm test` 86/86 ·
   `npx tsc --noEmit` clean · `npm run build` green.

## Three live-run bugs found and fixed during this pass (commit `b1e0240` + `9c9ff0d`)

No unit test could have caught these — they only exist against the real DB/browser:

1. **Ingest CLI ticker lookup** queried `companies.ticker` — column doesn't exist; the
   real key is `tase_security_id` (`9c9ff0d`).
2. **webpack-mangled pdf.js**: Next 14's webpack breaks the pdfjs-dist 5.4.x ESM bundle at
   import time ("Object.defineProperty called on non-object" — pdf.js#20478 /
   webpack#20095). Fix: pdf.js loaded natively from `public/pdf.min.mjs` (committed copy,
   same build as the worker) via `webpackIgnore` import.
3. **Detached upload buffer**: pdf.js *transfers* the `Uint8Array` given to `getDocument`,
   detaching the caller's buffer — ingest extracted first, then uploaded the same array →
   0-byte PDF in storage, no error. Fix: extraction hands pdf.js a copy. Compounding it,
   the file route's `max-age=3600` pinned the bad empty response in the browser cache —
   now `private, no-store`.

## Environment/process artifacts from this session

- New sanctioned append door for the fleet logs: `scripts/append-log.mjs` + founder-added
  allow rule (`45ba28e`, `47ac911`) — DECISION/MIGRATION/ENV lines filed by the lane itself.
- Supabase MCP access restored by a fresh personal access token in the worktree `.mcp.json`
  (the 07-02 token had been rotated out; old token-less registration was shadowing it).
