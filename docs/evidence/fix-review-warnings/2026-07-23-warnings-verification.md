# fix/review-warnings — verification evidence (2026-07-23)

Branch: `fix/review-warnings` off main @ `3e7f0d5` (post-pinge-merge). 4 commits.
Scope: the 6 reviewer WARNINGs earmarked for Lane M (4 from the feat/pinge verdict
2026-07-23, 2 carried from the feat/multiview-backend verdict 2026-07-17).

## What was fixed

1. **Snip-only send poisoned follow-ups into silent GPT fallback**
   (TranscriptChatPanel.tsx:122 + /api/chat). New pure module `src/lib/chat/history.ts`
   (`sanitizeHistory`): drops empty/blank turns, junk roles, non-string content; prefers
   `apiContent` (what the model actually received — snip default / reference-labeled
   message) over display content. Panel stores `apiContent` per user turn and builds
   history through the sanitizer; the route sanitizes the untrusted body independently.
2. **Live view swallowed snip-capture failures** (LiveBroadcastView.tsx:594) — was
   `onSnipError={() => {}}`; now toasts like the finished view.
3. **Process WARNING (wire-shape change unfiled)** — no code; lesson recorded in
   state-multiview.md. This branch touches no shared wire shapes (history.ts is a new
   internal module; /api/chat request/response shape unchanged).
4. **Oversized snip silently stripped server-side** (PdfViewer.tsx:186) — new
   `attachmentOversized()` in attachments.ts mirrors `parseAttachments`' cap;
   PdfViewer refuses the capture with `onSnipError('toolarge')` → dedicated toast
   (`dict.chat.snipTooBig`, both locales) instead of rendering a chip the server strips.
5. **pdfjs-dist undeclared** — pinned exact `"pdfjs-dist": "5.4.296"` as a direct
   dependency (the version the committed public/pdf.min.mjs copies came from);
   `node_modules` version verified unchanged post-install.
6. **Stub report fallback had no demo marker** (FacetPanes.tsx:207) — the stub card
   (both the no-document AND fetch-error paths) now carries a bordered pill:
   `dict.live.demoContent` = "Demo content — not real company data" /
   "תוכן הדגמה — לא נתוני חברה אמיתיים".

## How verified (2026-07-23, Chrome MCP on :3003, fresh dev server — the stale
July-17 server on the port was killed first)

- **Battery:** 104/104 tests (5 new: sanitizeHistory ×4, attachmentOversized boundary ×1;
  history.test.ts registered in package.json test list) · `tsc --noEmit` clean ·
  production build green.
- **TDD:** both new pure functions red-first (TypeError: not a function), then green.
- **Real-PDF regression check:** /app/live/PyuMxe88e8g_live → Report pane renders the
  real Tigbur Q1-2026 directors' report (page 1/31, scissors + zoom controls intact),
  console error-free. No demo badge on the real document (correct).
- **Poison-history behavioral probe (server sanitize path, real Gemini):** in-page
  `fetch('/api/chat')` with `history: [{user, ''}, {assistant, 'תשובה קודמת'}, {user, '   '}]`
  → **200, `x-chat-fallback: null`, streamed Gemini answer** ("פריז"). Pre-fix this
  history produced `{text:''}` parts → Gemini reject → silent OpenAI fallback.
- **Demo badge eyes-on:** /app/live/2gXp90F8s6w (no report doc) → Report pane stub card
  shows the pill in BOTH themes (dark screenshot + light zoom inspected), RTL placement
  correct, console clean.
- **Caveat (honest):** the two toast paths themselves (snipFailed in the live view,
  snipTooBig anywhere) were not visually triggered — inducing a real capture failure /
  >2MB PNG is impractical in-session. Wiring is typechecked and code-identical to the
  finished-view toast verified in the Pinge e2e; `attachmentOversized` boundary is
  unit-tested against `parseAttachments`' own cap.
- Test tab closed at session end; fresh dev server left running on :3003.
