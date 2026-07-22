# Pinge (snip-to-chat) — e2e verification evidence, 2026-07-17

Branch `feat/pinge` (worktree Atlas-multiview, :3003). Autonomous overnight run (founder away);
spec `docs/superpowers/specs/2026-07-17-pinge-design.md`, plan
`docs/superpowers/plans/2026-07-17-pinge-plan.md` (branch checkout).

## Battery
- `npm test` 99/99 (13 new: 6 snip geometry + 7 attachment validation/provider-parts)
- `npx tsc --noEmit` clean · `npm run build` green
- Per-edit typecheck hook green at every commit

## Environment caveat (drove the method)
The founder-Chrome automation window was `visibility: hidden` the whole session → Chrome froze
rAF + IntersectionObserver ticks and most CDP screenshots timed out (known lane class, filed
2026-07-16/17). pdf.js paces rendering on rAF, so verification used: (a) a page-context
rAF→setTimeout shim installed before pdf.js loads (test-driver only, no product change),
(b) screenshot calls as one-frame pumps, (c) DOM/class/fiber probes + dispatched PointerEvents
(pauses between events — React must commit between pointerdown/up). Real users always have a
visible tab; none of this affects product behavior.

## Verified eyes-on / probe-level (Tigbur Q1-2026, /app/live/PyuMxe88e8g_live, EN locale)
1. Scissors button renders in Report pane header; click arms: veil + crosshair overlay
   (screenshot ss_7847u7c7a page render; armed state + veil probed true).
2. Esc exits snip mode cleanly (armed→false).
3. Drag over the page-6 financial table (תוצאות הפעילות העסקית — screenshot ss_2324e3ov7)
   → floating "Ask Atlas" button at the anchor with chat CLOSED.
4. Button press → chat opens with a thumbnail chip (PNG data URL, label "p. 6").
5. Snip with chat OPEN → chip auto-appends (no button).
6. Cap: 5th snip dropped, "Up to 4 snips per question" message shown; chips stayed 4.
7. ✕ removes a chip (4→3).
8. Send with typed Hebrew question → history shows 3 thumbnails + text bubble; STREAMED Gemini
   answer opened "על פי הטבלה שבעמוד 6 של דוח הדירקטוריון (המצורפת בצילומים)" and read the
   table's exact digits from the image: הכנסות 358.7/358.5 · רווח גולמי 25.9/27.7 (6.5%-) ·
   שיעור 7.2%/7.7% — every number matches the page-6 pixels; Markdown table + citation chip.
9. Empty-text send with one chip → default question used; grounded answer explained the snipped
   region (trade receivables 5.6M; security-sector drop, מבצע שאגת הארי — matches the table's
   comment column).
10. Marking unification: chat closed + PDF text selection + mouseup → floating button, NO
    auto-open (old behavior gone); button press seeds the composer with the passage, correctly
    spaced Hebrew ("תוצאות הפעילות העסקית להלן ניתוח..."); window pointerdown dismisses the
    pending button.
11. Zoom-proof capture verified numerically at 100% and 125%: chip naturalWidth/Height match
    2×-PDF-unit math to the pixel (100%: 972×498 & 477×233 predicted=observed; 125%: 300px drag
    ÷ 1.415 cssScale × 2 = 424 predicted, 424 observed).
12. Light theme: report + tables render clean (screenshot ss_04955hnsa, 125% zoom, pan arrows).
13. Console: zero errors/exceptions across the whole session.

## Bug found + fixed during verification
`setPointerCapture` throws for synthetic/stale pointer ids and killed the overlay's pointerdown
handler → drag never registered. Fix: guarded try/catch (capture is best-effort; overlay covers
the pane). Commit `fix(pinge): guard setPointerCapture`.

## Founder one-look items (real-hand-only)
- One real mouse drag-snip (feel of veil/rectangle/button placement) — synthetic drives can't
  judge feel; mechanics fully verified above.
- Dark-theme visual polish of chips/veil (dark screenshots rendered but most captures timed out
  in the hidden window; light verified visually, dark verified by class/tokens only).
- Live-call parity is wired (same components/handlers, tsc-verified) but NOT exercised against a
  running engine — no live call during the run; behavior is identical code paths to finished.
