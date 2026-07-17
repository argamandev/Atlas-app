// Pinge snip geometry (spec 2026-07-17). Pure math only — no DOM, no pdf.js — so the
// zoom-proofing (screen px → PDF page units) is unit-testable at every zoom level.

export interface SnipRect {
  x: number
  y: number
  width: number
  height: number
}

/** Max snips attachable to one question (founder decision: the compare-tables move). */
export const SNIP_MAX = 4
/** Drags smaller than this in either dimension are accidental clicks → cancel. */
export const SNIP_MIN_DRAG_PX = 8
/** Long side of the captured PNG never exceeds this (crisp digits, sane payload). */
export const SNIP_MAX_SIDE = 1600

type Pt = { x: number; y: number }
type PageBox = { left: number; top: number; width: number; height: number }

/**
 * Drag endpoints (viewport px) → rect in CSS px relative to the page element,
 * clamped to the page. Null when the drag is below the accidental-click threshold
 * (measured BEFORE clamping so a real drag that mostly overshoots still counts).
 */
export function dragToPageRect(a: Pt, b: Pt, page: PageBox): SnipRect | null {
  if (Math.abs(a.x - b.x) < SNIP_MIN_DRAG_PX || Math.abs(a.y - b.y) < SNIP_MIN_DRAG_PX) return null
  const x0 = Math.max(0, Math.min(a.x, b.x) - page.left)
  const y0 = Math.max(0, Math.min(a.y, b.y) - page.top)
  const x1 = Math.min(page.width, Math.max(a.x, b.x) - page.left)
  const y1 = Math.min(page.height, Math.max(a.y, b.y) - page.top)
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function scaleRect(r: SnipRect, f: number): SnipRect {
  return { x: r.x * f, y: r.y * f, width: r.width * f, height: r.height * f }
}

/** Offscreen render scale for a crop in PDF units: 2x, reduced so the crop's long side ≤ maxSide. */
export function snipRenderScale(rectPdf: SnipRect, maxSide = SNIP_MAX_SIDE): number {
  return Math.min(2, maxSide / Math.max(rectPdf.width, rectPdf.height))
}

/** Chip-stack append with cap: at SNIP_MAX the new snip is dropped (caller shows the toast). */
export function appendSnip<T>(list: T[], item: T, max = SNIP_MAX): { list: T[]; dropped: boolean } {
  if (list.length >= max) return { list, dropped: true }
  return { list: [...list, item], dropped: false }
}
