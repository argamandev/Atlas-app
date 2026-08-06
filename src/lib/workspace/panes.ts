/**
 * HOW MANY DOCUMENTS FIT ON ONE SCREEN.
 *
 * Founder, 2026-08-06: *"lets limit multi view to 3 pages at a time."* Three is
 * a readability limit, not a technical one — a fourth column on a laptop leaves
 * each pane too narrow for a line of a Hebrew filing to survive, and the PDF
 * toolbar in each pane header already has to scroll at three.
 */
export const MAX_PANES = 3

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
 *
 * THE CAP IS APPLIED HERE TOO, not only where panes are added, and the
 * belt-and-braces is deliberate: a workspace's layout is PERSISTED, so a shelf
 * arranged before this limit existed still has four `is_open` rows in the
 * database and would otherwise render four columns on the next load. Clamping
 * at the render chokepoint means no stored state can exceed the limit, and
 * `addPane` below means live state never grows into needing the clamp.
 */
export function shownPanes(state: {
  split: boolean
  openTabs: string[]
  multi: string[]
  activeTab: string
}): string[] {
  const panes = state.split ? state.openTabs.filter((id) => state.multi.includes(id)).slice(0, MAX_PANES) : []
  if (panes.length > 0) return panes
  return state.activeTab ? [state.activeTab] : []
}

/**
 * Put a tab on screen, WITHOUT EVER REFUSING TO.
 *
 * At the cap the oldest pane leaves rather than the new one being turned away,
 * and that choice is the whole reason this is a function. Every caller in the
 * shell exists to satisfy an invariant its own comment states — *"in multi-view
 * a newly opened file must APPEAR"* — because a file that lands as a tab with no
 * pane makes clicking it look like it did nothing. Capping by refusal would have
 * reintroduced exactly that: silently, and only ever on the fourth file, which is
 * the hardest kind of nothing to report as a bug.
 *
 * Eviction is visible instead: the tab that lost its pane goes hollow in the tab
 * bar the same instant, so the swap can be read off the screen.
 */
export function addPane(multi: string[], id: string, max = MAX_PANES): string[] {
  if (multi.includes(id)) return multi
  return [...multi, id].slice(-max)
}

/**
 * The panes multi-view opens with — up to `max`, ALWAYS INCLUDING the tab being
 * read.
 *
 * Founder decision, 2026-08-04: one click shows the open files side by side. The
 * cap makes "all of them" impossible past three, and the one file that may not
 * be dropped is the one already on screen — turning multi-view on must never
 * take away the document you were looking at when you reached for the control.
 */
export function initialPanes(openTabs: string[], activeTab: string, max = MAX_PANES): string[] {
  const i = openTabs.indexOf(activeTab)
  if (i < 0) return openTabs.slice(0, max)
  // Start at the active tab and run forward; if that would overrun the end,
  // slide the window back so it stays full rather than returning fewer panes.
  const start = Math.min(i, Math.max(0, openTabs.length - max))
  return openTabs.slice(start, start + max)
}
