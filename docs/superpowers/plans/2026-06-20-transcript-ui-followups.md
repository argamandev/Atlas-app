# Transcript UI Follow-ups (4 small changes) — Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Each task = its own commit on `feat/transcript-ui-polish`.
> Founder-approved descriptions. NOT pushed — founder reviews.

**Goal:** Four refinements to the just-built transcript UI: chat minimizes (not closes) the speaker panel,
the offline chat button opens the side panel, an "Open audio bar" chip to reopen the bar after ✕, and
drag-to-scrub the audio timeline.

---

### Task 1: Chat open → minimize the speaker panel (not unmount it)
**Files:** `src/components/live/TranscriptSidePanel.tsx`, `src/components/live/LiveTranscriptView.tsx`
- [ ] Make `TranscriptSidePanel` collapse **controlled**: replace its internal `useState` with props
  `collapsed: boolean` and `onToggleCollapsed: () => void`. The collapsed rail's expand button and the
  header collapse button both call `onToggleCollapsed`. (Remove `import { useState }`.)
- [ ] In `LiveTranscriptView`: add `const [panelCollapsed, setPanelCollapsed] = useState(false)`. Render the
  panel **always** (delete the `{!chat.open && ...}` guard) and pass
  `collapsed={chat.open || panelCollapsed}` + `onToggleCollapsed={() => setPanelCollapsed((v) => !v)}`.
  → opening the chat minimizes the panel to its rail (speaker context one click away); closing the chat
  restores the user's own collapsed/expanded choice.
- [ ] tsc · commit `feat(transcript): chat open minimizes the speaker panel (no longer unmounts it)`.

### Task 2: Offline chat button opens the side panel (not the Chat page)
**Files:** `src/components/live/LiveTranscriptView.tsx`
- [ ] Change the `dict.company.openInChat` IconButton's `onClick` from `openInChat` to
  `() => setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1 }))`.
- [ ] Delete the now-unused `openInChat` function.
- [ ] tsc · commit `feat(transcript): chat button opens the side panel, not the chat page`.

### Task 3: "Open audio bar" chip to reopen the docked bar after ✕
**Files:** `src/components/live/LiveTranscriptView.tsx`
- [ ] Track the last playhead so reopening resumes position. Near the top:
```tsx
  const lastPosRef = useRef(0)
  useEffect(() => { if (isActiveCall) lastPosRef.current = currentTime }, [isActiveCall, currentTime])
```
  (`useRef` is already imported via React? add `useRef` to the `react` import if missing.)
- [ ] Build the PlayerCall once (it's the same object the mount effect loads). Reuse by extracting a
  `const playerCall = useMemo(() => ({ id: call.id, companyId: call.companyId, title: name, subtitle:
  call.quarter, logoUrl: call.logoUrl, audioUrl: call.audioUrl!, isLive: false, duration:
  call.transcript.durationSec || undefined }), [...])` — only when `call.audioUrl`.
- [ ] Render a floating chip in the main column (sibling of the transcript scroll), shown when the bar is
  closed for this call:
```tsx
        {call.audioUrl && !isActiveCall && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center">
            <button
              type="button"
              onClick={() => player.load({ ...playerCall, startAt: lastPosRef.current })}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-popover transition-opacity hover:opacity-90"
            >
              <PlayIcon size={13} /> {dict.live.openAudioBar}
            </button>
          </div>
        )}
```
- [ ] Add i18n key `live.openAudioBar` → EN `'Open audio bar'`, HE `'פתחו את נגן השמע'`.
- [ ] tsc · commit `feat(transcript): "Open audio bar" chip reopens the docked bar after close (resumes position)`.

### Task 4: Drag-to-scrub the audio timeline
**Files:** `src/components/live/MediaPlayer.tsx`
- [ ] Extract the click math into a helper that takes a clientX and seeks:
```tsx
  function seekFromClientX(clientX: number) {
    const el = trackRef.current
    if (!el || duration <= 0) return
    const rect = el.getBoundingClientRect()
    let ratio = (clientX - rect.left) / rect.width
    if (dir === 'rtl') ratio = 1 - ratio
    props.onSeek(Math.min(duration, Math.max(0, ratio * duration)))
  }
```
- [ ] Add a `draggingRef = useRef(false)`. On the track `<button>` add pointer handlers (drag = continuous
  seek; keep the keyboard click path):
```tsx
            onPointerDown={(e) => { if (duration <= 0) return; draggingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekFromClientX(e.clientX) }}
            onPointerMove={(e) => { if (draggingRef.current) seekFromClientX(e.clientX) }}
            onPointerUp={(e) => { draggingRef.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {} }}
            onClick={(e) => { if (e.detail === 0) return /* keyboard */; /* pointer already handled drag/click */ }}
```
  Keep `seekFromEvent` only if still referenced; otherwise replace its body with `seekFromClientX(e.clientX)`
  guarded by `e.detail === 0` return. Ensure no double-seek (pointerup + click both firing) — gate the click
  to keyboard only (`e.detail === 0` is keyboard; a real click has detail≥1 and is already covered by
  pointerdown/up, so the click handler should no-op for pointer clicks).
- [ ] tsc · commit `feat(player): drag-to-scrub the audio timeline (not just click-to-point)`.

### Task 5: Verify
- [ ] tsc · `npm test` · `npm run build`. (No PROGRESS entry needed — covered by the pass entry; add a line if useful.)

## Self-Review
- Covers all 4 founder-approved changes. Controlled-collapse (T1) is offline-only (TranscriptSidePanel is only
  used by LiveTranscriptView). T3 resumes position via `lastPosRef`. T4 keeps click + adds drag without
  double-seek. ✓
