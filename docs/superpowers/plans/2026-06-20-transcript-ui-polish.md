# Transcript UI Polish (Live + Offline) Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Each task = its own commit on a
> NEW branch `feat/transcript-ui-polish` off `main`. **Do NOT push/merge** — founder reviews first.

**Goal:** A batch of founder-approved live/offline transcript UI changes: a chat button on Live, identical
chat layout in both, yellow text-selection, a persistent (no-auto-dismiss) live notification with buffer copy,
a minimizable speaker panel, removing two dead buttons, a "copy text" icon, and a universal audio-bar fix
(remove the white block behind the global bar + make it chat-aware).

**Architecture:** Mostly small, isolated UI edits. The one cross-cutting change is the global audio bar: the
white "block" is the full-width reserved band (`pb-[84px]`) in `ShellChrome`; we drop it (side panels go
full-height, the black pill floats) and replace its job with transparent bottom padding inside the transcript
scroll areas. The bar becomes chat-aware via a `chatOpen` flag on the player context, so it narrows left of an
open chat (offline now, Live later when it adopts the global bar).

**Tech stack:** Next.js 14, TypeScript, Tailwind, React context.

**File map:** `src/app/globals.css` · `src/components/live/TranscriptBody.tsx` ·
`src/components/ds/icons.tsx` · `src/components/live/LiveTranscriptView.tsx` ·
`src/components/live/LiveBroadcastView.tsx` · `src/components/live/LiveSession.tsx` ·
`src/components/live/TranscriptSidePanel.tsx` · `src/components/app/ShellChrome.tsx` ·
`src/lib/player/PlayerProvider.tsx` · `src/components/app/GlobalPlayer.tsx` ·
`src/components/live/MediaPlayer.tsx`.

---

### Task 0: Branch
- [ ] `git checkout main && git checkout -b feat/transcript-ui-polish`

### Task 1: Yellow text selection (both views, shared component)
**Files:** `src/app/globals.css`, `src/components/live/TranscriptBody.tsx`
- [ ] In `globals.css`, after the global `::selection` block (line ~44), add a scoped rule:
```css
  .select-mark ::selection {
    background: #FDE047; /* highlighter yellow */
    color: #1A1A1A;
  }
```
- [ ] In `TranscriptBody.tsx`, add the class to the root div:
  `<div ref={rootRef} dir="rtl" className="select-mark space-y-7 text-right">`
- [ ] `npx tsc --noEmit` → clean. Commit `feat(transcript): yellow highlighter on text selection (live + offline)`.

### Task 2: "Copy text" icon (offline copy button)
**Files:** `src/components/ds/icons.tsx`, `src/components/live/LiveTranscriptView.tsx`
- [ ] In `icons.tsx`, add a new icon next to `CopyIcon` (the two boxes + a centered "T" in the front box):
```tsx
export const CopyTextIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M6 15H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1" />
    <path d="M11.8 13H17.2M14.5 13V17.5" />
  </Base>
)
```
- [ ] In `LiveTranscriptView.tsx`: import `CopyTextIcon` (replace `CopyIcon` in the import) and use it in the
  copy button (currently `<CopyIcon size={16} />` inside the `dict.live.copy` IconButton).
- [ ] `npx tsc --noEmit` → clean. Commit `feat(transcript): copy icon shows a T (copy-text affordance)`.

### Task 3: Chat button on the Live view
**Files:** `src/components/live/LiveBroadcastView.tsx`
- [ ] In the live sub-toolbar (the `<div className="flex items-center justify-between px-6 py-2">` that holds
  the auto-scroll `IconButton`), add a chat button after it (opens the existing chat panel):
```tsx
        <IconButton label={dict.live.askAboutQuote} size={30} onClick={() => setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1 }))}>
          <SparkleIcon size={16} />
        </IconButton>
```
  (`SparkleIcon` is already imported; `setChat` already exists; the panel + `TranscriptChatPanel` already render
  when `chat.open`.)
- [ ] `npx tsc --noEmit` → clean. Commit `feat(live): chat button opens the Ask-Atlas panel directly`.

### Task 4: Live notification — buffer copy + no auto-dismiss
**Files:** `src/components/live/LiveSession.tsx`
- [ ] Append the buffer sentence to the processing card text (the `finishStatus === 'processing'` span):
```tsx
              Investor call ended — AI is processing your transcript. This takes a few minutes; we&apos;ll notify
              you. On our platform the call is still LIVE until we finish the 4-minute buffer.
```
- [ ] DELETE the 5-second auto-dismiss effect (the `useEffect` added in the last pass that does
  `setDismissed((d) => ({ ...d, processing: true }))` after 5000ms). The card now stays until ✕.
- [ ] `npx tsc --noEmit` → clean. Commit `feat(live): notification keeps it LIVE-through-buffer copy; no auto-dismiss`.

### Task 5: Minimizable speaker/timeline panel (offline)
**Files:** `src/components/live/TranscriptSidePanel.tsx`
- [ ] Add `useState` + `CollapseIcon`/`ChevronRightIcon` imports. Add `const [collapsed, setCollapsed] = useState(false)`.
- [ ] When `collapsed`, render a thin rail (mirror `CollapsiblePanel`):
```tsx
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title={companyName}
        className="hidden w-10 shrink-0 items-start justify-center border-e border-hairline bg-panel pt-3 text-ink-faint transition-colors hover:text-ink lg:flex"
      >
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </button>
    )
  }
```
- [ ] In the expanded `<aside>`, add a collapse button in the header row (the `px-4 pb-1 pt-4` block) — wrap its
  contents in a flex row with the title on one side and the collapse button on the other:
```tsx
      <div className="flex items-start justify-between px-4 pb-1 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-ink">{companyName}</h2>
          {sub && <div className="mt-0.5 truncate text-xs text-ink-faint">{sub}</div>}
        </div>
        <button type="button" onClick={() => setCollapsed(true)} title={dict.nav.collapseSidebar} className="shrink-0 text-ink-faint transition-colors hover:text-ink">
          <CollapseIcon size={15} />
        </button>
      </div>
```
- [ ] `npx tsc --noEmit` → clean. Commit `feat(transcript): minimizable speaker/timeline panel`.

### Task 6: Remove the two dead buttons (offline)
**Files:** `src/components/live/LiveTranscriptView.tsx`
- [ ] In the sub-toolbar, DELETE the auto-scroll `IconButton` (`SyncIcon`, `dict.live.autoScroll`) and the
  refresh `IconButton` (`RefreshIcon`, `dict.live.refresh`). Keep copy / chat / edit.
- [ ] Change `const [autoScroll, setAutoScroll] = useState(true)` → `const [autoScroll] = useState(true)` (the
  toggle is gone; the scroll-pause chip manages it). Remove now-unused `SyncIcon` / `RefreshIcon` imports.
- [ ] `npx tsc --noEmit` → clean. Commit `feat(transcript): drop dead auto-scroll + refresh buttons`.

### Task 7a: Audio bar — remove the white block
**Files:** `src/components/app/ShellChrome.tsx`, `src/components/live/LiveTranscriptView.tsx`,
`src/components/live/TranscriptSidePanel.tsx`
- [ ] In `ShellChrome.tsx`, drop the reserved band so panels go full-height + the black pill floats:
  change `cn('relative flex min-w-0 flex-1 flex-col overflow-hidden', dockOpen && 'pb-[84px]')` →
  `'relative flex min-w-0 flex-1 flex-col overflow-hidden'` (remove the `dockOpen && 'pb-[84px]'`).
- [ ] Replace its job with transparent in-scroll padding so the last lines clear the floating pill:
  - `LiveTranscriptView.tsx` main scroll: `pb-8` → `pb-28` (on the `app-scroll relative min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2` div).
  - `TranscriptSidePanel.tsx` content: `px-3 pb-8` → `px-3 pb-24`.
- [ ] `npx tsc --noEmit` → clean. Commit `fix(player): remove white reserved block behind the global bar`.
- [ ] **Manual check (founder review):** Home + Chat pages with a loaded call — confirm no important bottom
  content hides behind the floating pill; if it does, add bottom padding to that page's main scroll area.

### Task 7b: Audio bar — chat-aware (narrows left of an open chat)
**Files:** `src/lib/player/PlayerProvider.tsx`, `src/components/app/GlobalPlayer.tsx`,
`src/components/live/MediaPlayer.tsx`, `src/components/live/LiveTranscriptView.tsx`
- [ ] `PlayerProvider.tsx`: add to `PlayerApi`: `chatOpen: boolean` and `setChatOpen: (v: boolean) => void`.
  Add state `const [chatOpen, setChatOpen] = useState(false)`, a memoized setter, and include both in `api`.
- [ ] `LiveTranscriptView.tsx`: sync the flag with the side chat:
```tsx
  useEffect(() => {
    player.setChatOpen(chat.open)
    return () => player.setChatOpen(false)
  }, [chat.open, player.setChatOpen])
```
- [ ] `GlobalPlayer.tsx`: pass `chatNarrow={p.chatOpen}` to `<MediaPlayer .../>`.
- [ ] `MediaPlayer.tsx`: add optional prop `chatNarrow?: boolean`; on the outer container
  (`pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4`) append
  `chatNarrow && 'lg:pe-[396px]'` (380px panel + 16px gap; lg-only since the chat panel is `lg:flex`). Import
  `cn` from `@/lib/utils` for the conditional class.
- [ ] `npx tsc --noEmit` → clean. Commit `feat(player): global bar narrows left of an open chat (offline = live)`.

### Task 8: Verify + record
- [ ] `npx tsc --noEmit` · `npm test` (43 pass) · `npm run build` (clean).
- [ ] Add a PROGRESS.md entry (status: built on `feat/transcript-ui-polish`, awaiting founder review; NOT
  pushed). Commit `docs: transcript UI polish pass (PROGRESS)`.
- [ ] Restart dev server on the branch (clear `.next`) so the founder can review at `:3000`.

## Self-Review
- **Coverage:** chat button→T3 · identical chat layout→T7b (chat-aware bar; panel already shared) · yellow
  selection→T1 · notification copy+no-auto-dismiss→T4 · minimizable panel→T5 · remove 2 buttons→T6 · copy
  "T"→T2 · audio-bar white-block→T7a. ✓
- **Placeholders:** none — concrete code/classes throughout. ✓
- **Type consistency:** `chatOpen`/`setChatOpen` on `PlayerApi` used identically in provider, `LiveTranscriptView`,
  `GlobalPlayer`; `chatNarrow` prop name consistent (`GlobalPlayer` → `MediaPlayer`). `CopyTextIcon` defined in
  T2 before use. ✓
- **Risk:** the only cross-cutting change is T7a (global `pb` removal) — flagged for a home/chat visual check.
  Everything else is isolated + revertible per commit.
