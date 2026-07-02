# Phase 2B — Toolbar on the Live View Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> Inline execution on `feat/live-phase2`. **COMMITS as we go.** Approach: incremental — duplicate the
> small selection+toolbar glue into `LiveBroadcastView`, reuse the shared `TranscriptChatPanel` +
> `createQuote` (+ the already-shared `TranscriptBody`). The 2D unify will delete the duplication.

**Goal:** Highlight a live caption → a floating **Save Quote / Ask Atlas / Share** toolbar (mirroring
the finished page), with the in-transcript side chat. Lets analysts capture/ask/share *while a call
airs*.

**Live-specific (approved):** Save Quote → raw caption + speaker + the live playhead timestamp, under
the company, `transcriptId: null` (2C links/upgrades to the finished transcript later). Ask Atlas →
`TranscriptChatPanel` with `transcriptId={undefined}` (grounds on company + the highlighted quote).
Share → WhatsApp only (no PDF/print on live).

**File:** `src/components/live/LiveBroadcastView.tsx` (only).

**Status (2026-06-16):** Tasks 1–3 built; verify pass green (`tsc` clean · 42/42 tests · `next build`
green · `/app/live/[id]` dev route compiles + renders 200). Dev (`:3000`, 60s buffer) + replay
(`REPLAY_OFFSET=90`, buffer pre-filled) running. **Awaiting founder live test** before commit.

---

### Task 1: Imports + state

- [ ] Add imports: `Link` (next/link), `QuoteIcon`, `ShareIcon`, `SparkleIcon` (from ds/icons),
  `TranscriptChatPanel` (`./TranscriptChatPanel`), `createQuote` (`@/lib/api/quotes`).
- [ ] Add state below the existing `useState`s:
```tsx
  const [selection, setSelection] = useState<{ text: string; top: number; left: number; speaker: string | null; segmentId: string | null } | null>(null)
  const [chat, setChat] = useState<{ open: boolean; seed: string; nonce: number }>({ open: false, seed: '', nonce: 0 })
  const [toast, setToast] = useState<{ text: string; action?: { label: string; href: string } } | null>(null)
```
- [ ] Auto-dismiss toast (mirror finished):
```tsx
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])
```

---

### Task 2: Selection + actions (mirror finished, no edit-mode)

- [ ] Add the helpers + handlers (place above the `return`):
```tsx
  function selectionSpeaker(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    return ((node as Element | null)?.closest('[data-segment-id]') ?? null)?.getAttribute('data-speaker') ?? null
  }
  function selectionSegmentId(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    return ((node as Element | null)?.closest('[data-segment-id]') ?? null)?.getAttribute('data-segment-id') ?? null
  }
  function onTextSelect() {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    const text = sel?.toString().trim() ?? ''
    if (!text || !sel || sel.rangeCount === 0) { setSelection(null); return }
    // chat open → drop the highlight straight into the composer as a reference (Claude-style)
    if (chat.open) { setChat((c) => ({ ...c, seed: text, nonce: c.nonce + 1 })); setSelection(null); return }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) { setSelection(null); return }
    setSelection({ text, top: rect.top, left: rect.left + rect.width / 2, speaker: selectionSpeaker(sel), segmentId: selectionSegmentId(sel) })
  }
  async function saveSelection(sel: { text: string; speaker: string | null; segmentId: string | null }) {
    if (!sel.text || !companyId) { setToast({ text: dict.common.error }); return }
    try {
      await createQuote({
        companyId,
        transcriptId: null, // live: no finished transcript yet — 2C links/upgrades it
        text: sel.text,
        speaker: sel.speaker ?? companyName,
        quarter,
        startSec: playingRel,
        anchor: sel.segmentId ? { segmentId: sel.segmentId, text: sel.text.slice(0, 80) } : null,
      })
      setToast({ text: dict.live.quoteSaved, action: companyId ? { label: dict.company.myQuotes, href: `/app/company/${companyId}?tab=quotes` } : undefined })
    } catch (err) {
      setToast({ text: (err as Error).message })
    }
  }
  function shareSelection(text: string) {
    const msg = `${companyName} said on ${quarter ? `the ${quarter}` : 'an'} investor call: "${text}"`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }
```

---

### Task 3: Render — wrap in a row (chat beside), wire selection, toolbar, toast

- [ ] Wrap the existing root column in a row so the chat panel sits beside it. Change the root
`<div className="relative flex h-full min-h-0 flex-1 flex-col">` to:
```tsx
    <div className="flex h-full min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
```
and add, just before the component's final closing `)`:
```tsx
      </div>
      {chat.open && (
        <TranscriptChatPanel
          companyId={companyId}
          transcriptId={undefined}
          quote={chat.seed}
          seedNonce={chat.nonce}
          onClose={() => setChat((c) => ({ ...c, open: false }))}
        />
      )}
    </div>
```
(i.e. the existing content becomes the inner column; the chat is the second child of the new row.)

- [ ] Wire selection on the transcript scroll div — change its opening tag to add:
```tsx
        onMouseUp={onTextSelect}
        onScroll={() => selection && setSelection(null)}
```

- [ ] Add the floating toolbar + toast right after the transcript scroll `</div>` (inside the inner column), mirroring the finished view's non-edit-mode branch:
```tsx
        {selection && (
          <div
            style={{ position: 'fixed', top: selection.top, left: selection.left, transform: 'translate(-50%, -120%)' }}
            className="z-50 flex items-center gap-0.5 rounded-full bg-player px-1 py-1 shadow-player"
          >
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { void saveSelection(selection); setSelection(null) }} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15">
              <QuoteIcon size={13} />{dict.live.saveQuote}
            </button>
            <span className="h-4 w-px bg-white/15" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { shareSelection(selection.text); setSelection(null) }} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15">
              <ShareIcon size={13} />{dict.common.share}
            </button>
            <span className="h-4 w-px bg-white/15" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setChat((c) => ({ open: true, seed: selection.text, nonce: c.nonce + 1 })); setSelection(null) }} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15">
              <SparkleIcon size={14} />{dict.live.askAboutQuote}
            </button>
          </div>
        )}
        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
            <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white shadow-popover">
              {toast.text}
              {toast.action && (
                <Link href={toast.action.href} className="flex items-center gap-0.5 text-white/80 underline-offset-2 transition-colors hover:text-white hover:underline">
                  {toast.action.label}<ChevronRightIcon size={13} className="rtl:rotate-180" />
                </Link>
              )}
            </span>
          </div>
        )}
```
(Add `ChevronRightIcon` to the ds/icons import.)

---

### Task 4: Verify + test

- [ ] `npx tsc --noEmit` clean · `npm test` pass · `npx next build` green (kill dev first to avoid `.next` contention).
- [ ] Reset row, restart dev + replay (60s buffer), send founder the link. Verify: highlight a live
  caption → toolbar appears → Save Quote (toast → My Quotes) / Ask Atlas (side chat opens, highlight
  auto-references) / Share (WhatsApp). No live test until founder OKs.

## Self-Review
Reuses `TranscriptChatPanel` + `createQuote` + `TranscriptBody` (shared); duplicates only the small
selection/toolbar glue (2D deletes it). Live-specific: `transcriptId: null` quote, `transcriptId=undefined`
chat, WhatsApp-only share. `playingRel`/`companyId`/`companyName`/`quarter` all exist on the live view.
Layout: root column → row + chat-beside (mirrors the finished view's structure).
