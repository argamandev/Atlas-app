// Snip-target bridge (design round 2): ReportPane publishes whether a REAL, snippable
// document is mounted; the Ask Atlas composer scissors subscribes to it.
//
// CONTRACT (founder round-2 note, 6661c02 — supersedes this module's original
// hide-when-unavailable rule): the scissors is ALWAYS RENDERED and goes visibly
// DISABLED when no target exists. That still satisfies the visible-degradation law
// (rules/app.md) — the affordance never silently does nothing — while keeping the
// composer's control row a stable shape instead of one that pops a button in and out.
//
// Module-level store + subscribe, shaped for React's useSyncExternalStore.

type Listener = (available: boolean) => void

let available = false
const listeners = new Set<Listener>()

export function setSnipTarget(v: boolean): void {
  available = v
  listeners.forEach((l) => l(v))
}

export function getSnipTarget(): boolean {
  return available
}

export function subscribeSnipTarget(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Arm the mounted document pane's snip mode (same machinery as its header scissors). */
export function armSnip(): void {
  window.dispatchEvent(new Event('atlas:arm-snip'))
}
