# Multiview — founder round 3 (2026-07-16)

Founder feedback after reviewing round 2 on :3003. Items 1–8 = this plan (lane-executable).
Item 9 (new Tigbur Q1-2026 transcript from YouTube) and item 10 ("Pinge" snip-to-chat feature)
are NOT in this plan — 9 needs the transcription pipeline + founder-run source download,
10 is a new feature that starts with a founder brainstorm (parallel-work law).

## Tasks

### T1 — PDF text-selection sensitivity
Symptom: first drag-select works, next attempt selects a whole paragraph.
Root cause class: pdf.js text layers have no "endOfContent" element — when the pointer
leaves the absolutely-positioned spans mid-drag, the browser anchors the selection to the
layer/page and it balloons. pdf.js's own viewer fixes this with a `.endOfContent` div that
expands to cover the layer while a selection drag is in progress.
Fix: append `.endOfContent` after each text layer render (PdfViewer); toggle a `.selecting`
class on all layers from pointerdown → window pointerup; CSS in globals.css mirrors the
official viewer (inset 100% 0 0 → inset 0 while selecting; user-select:none).

### T2 — "Back to current word" chip: direction-aware arrow + rename
TranscriptBody chip hardcodes `↓`. Fix: track the active word's position vs the scroll
container's midpoint (recomputed on scroll + on activeIndex change while paused); arrow ↑
when the word is above, ↓ when below. Rename dict `live.backToPlaying`:
EN "Back to current word" · HE "חזרה למילה הנוכחית".

### T3 — audio bar background = nav rail background
tokens.color.player `#2B2B2E` → `#0A0A0A` (the rail's black). Shared design token —
cross-cutting append BEFORE the change. Also recolors the selection toolbar pills (same
bg-player family) — intentional, keeps one charcoal.

### T4 — closing the audio bar no longer stops playback
PlayerProvider gains `barHidden` + `hideBar()`/`showBar()`; `load()` always un-hides.
GlobalPlayer's ✕ now calls hideBar (audio + timer + karaoke keep running); ShellChrome's
data-dock accounts for hidden. The transcript view's bottom chip becomes "reopen": shown
when the bar is hidden OR the call isn't loaded; reopening a hidden bar is just showBar().

### T5 — PDF page navigation next to zoom
ReportPane header gains `‹ N / total ›` beside the zoom cluster. The pane's scroll div gets
a ref + onScroll current-page tracking (nearest [data-page] top); prev/next scrollIntoView
the target page.

### T6 — marked PDF text in chat: spacing + run-together words
Two causes: (a) `sel.toString()` on the pdf.js text layer concatenates spans with no
separator → words run together; (b) reference blocks render at tight leading with 3-line
clamp. Fix: PdfViewer builds the seeded text by walking the selection fragment's text nodes
and joining with single spaces (collapse whitespace); TranscriptChatPanel reference blocks
get transcript-like leading (1.8) and a 4-line clamp.

### T7 — Multi view auto-collapses the nav rail + speaker panel
Entering Multi: dispatch `atlas:rail-collapse {collapsed:true}` (NavRail listens) + collapse
the speaker side panel. Back to Single or leaving the page: restore only what we collapsed
(manual toggles afterwards still win — the event fires only on view changes).

### T8 — dark-mode contrast for Atlas chat output
`.md` typography hardcodes light-theme inks (#1b1b1a strong/headings/th, dark-on-light table
borders/fills) → unreadable in the dark call theme. Add `[data-call-theme='dark'] .md`
overrides driven by the call vars (ink/muted) + white-alpha fills/borders; links get a
lighter amber. Scoped to the call theme so the light app chat is untouched.

## Verify (eyes-on, :3003, /app/live/2gXp90F8s6w Multi, tab FOREGROUND)
1. Repeat-select in the PDF 5+ times — no paragraph balloon; seeded chat text has spaces.
2. Scroll up past the active word → chip says the new label with ↓; scroll below → ↑.
3. Audio bar color == rail color (screenshot both corners).
4. Play → ✕ the bar → audio keeps playing, chips-row timer runs, karaoke advances →
   bottom chip reopens the bar at the same position.
5. Page ‹ › jumps pages; label tracks manual scrolling.
6. Switch Single→Multi: rail + speaker panel collapse; back to Single: both restore.
7. Dark theme: ask for a table → readable; light theme unchanged.
8. Battery: npm test · tsc --noEmit · npm run build.
