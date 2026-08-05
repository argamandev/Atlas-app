/**
 * WHICH TABS ARE ACTUALLY ON SCREEN.
 *
 * One function because TWO places need the answer and they must never disagree:
 * WorkspaceDocs renders these panes, and the shell has to know whether the
 * working document is among them before it hands it something to insert — if it
 * is not mounted there is no DOM to splice into, and the insertion has to go
 * into the stored HTML instead.
 *
 * The fallback to the active tab is a guard, not a feature: `multi` going empty
 * while split is on used to blank the whole card (founder, 2026-08-04). Keeping
 * it here means the shell's idea of "shown" includes the same rescue the
 * renderer performs, rather than being right about a screen that is not there.
 */
export function shownPanes(state: {
  split: boolean
  openTabs: string[]
  multi: string[]
  activeTab: string
}): string[] {
  const panes = state.split ? state.openTabs.filter((id) => state.multi.includes(id)) : []
  if (panes.length > 0) return panes
  return state.activeTab ? [state.activeTab] : []
}
