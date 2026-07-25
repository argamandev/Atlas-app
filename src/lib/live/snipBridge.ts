// Snip-target bridge (design round 2): ReportPane publishes whether a REAL, snippable
// document is mounted; the Ask Atlas composer scissors subscribes and only renders when
// a target exists — an entry point that silently does nothing is invisible degradation
// (rules/app.md). Module-level store + subscribe, shaped for React's useSyncExternalStore.

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
