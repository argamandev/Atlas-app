// ─────────────────────────────────────────────────────────────────────────────
// WHO IS ALREADY SHOWING THE PLAYING CALL — a COUNT per call, not a flag.
//
// The "Return to transcript" chip floats over every page while a recorded call
// is loaded, and its whole job is to carry you back to the words. So any surface
// that is ALREADY showing those words has to be able to say so, or the chip
// offers to take you where you already are — and in a workspace it does worse
// than that: it navigates away from the panes the analyst arranged.
//
// WHY A COUNT AND NOT A SINGLE ID. Two things break a lone `viewingId`:
//   1. A workspace can have the same call open in more than one pane, and more
//      to the point can have one pane mount while another unmounts. With a
//      single slot, the LEAVING pane's cleanup clears the flag the REMAINING
//      pane still needs, and the chip reappears over a transcript that is
//      plainly on screen.
//   2. React 18 StrictMode runs mount → cleanup → mount in development. A flag
//      ends that sequence set, which only looks right; a count ends it at 1,
//      which IS right, and stays right when a real second viewer arrives.
//
// Pure on purpose: the provider owns the Map, this owns the arithmetic, and the
// arithmetic is what has an edge case worth a test.
// ─────────────────────────────────────────────────────────────────────────────

export type ViewerCounts = Map<string, number>

/** Register one more surface displaying `id`. Returns the new list of displayed ids. */
export function addViewer(counts: ViewerCounts, id: string): string[] {
  counts.set(id, (counts.get(id) ?? 0) + 1)
  return Array.from(counts.keys())
}

/**
 * Drop one surface displaying `id`. Returns the new list of displayed ids.
 *
 * Never goes negative: an unbalanced removal (a cleanup that runs twice, an id
 * that was never added) leaves the map exactly as a zero count would — absent.
 */
export function removeViewer(counts: ViewerCounts, id: string): string[] {
  const next = (counts.get(id) ?? 0) - 1
  if (next > 0) counts.set(id, next)
  else counts.delete(id)
  return Array.from(counts.keys())
}
