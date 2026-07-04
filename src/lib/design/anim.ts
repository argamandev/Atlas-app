// ─────────────────────────────────────────────────────────────────────────────
// V2 animation vocabulary (Claude Design import) — pure helpers shared by the
// AnimCanvas / LiveBeamAvatar components. Timing values are copied VERBATIM from
// the design sources (design-import/atlas-anim.js canvas engine markup contract,
// design-import/reference/live-beam.html radar-beam reference) — never retuned.
// ─────────────────────────────────────────────────────────────────────────────

export type AnimMode = 'buffer' | 'desk' | 'globe' | 'stream'

export type AnimCanvasProps = {
  mode: AnimMode
  /** buffer length in seconds (buffer mode) */
  secs?: number
  /** ink mode for dark/light surfaces (buffer/desk) */
  ink?: 'dark' | 'light'
  /** stretch to the parent box (adds data-fill) */
  fill?: boolean
  /** extra engine opts passed as data-* attrs (labels, count, spin, r, cycle, scatter, h…) */
  opts?: Record<string, string | number>
}

/** Map AnimCanvas props to the data-* contract atlas-anim.js scans for:
 *  `data-anim="buffer|desk"` for the timeline animations, `data-field data-mode="globe|stream"`
 *  for the particle fields. */
export function animCanvasAttrs({ mode, secs, ink, fill, opts }: AnimCanvasProps): Record<string, string> {
  const attrs: Record<string, string> = {}
  if (mode === 'buffer' || mode === 'desk') {
    attrs['data-anim'] = mode
  } else {
    attrs['data-field'] = ''
    attrs['data-mode'] = mode
  }
  if (secs != null) attrs['data-secs'] = String(secs)
  if (ink) attrs['data-ink'] = ink
  if (fill) attrs['data-fill'] = ''
  for (const [k, v] of Object.entries(opts ?? {})) attrs[`data-${k}`] = String(v)
  return attrs
}

// Radar-beam LIVE indicator timing (live-beam.html): three expanding rings,
// staggered thirds of the 5.4s cycle, plus the slow-blinking dot.
export const BEAM_RING_DELAYS = ['0s', '1.8s', '3.6s'] as const
export const BEAM_RING_ANIMATION = 'radar-pulse 5.4s cubic-bezier(0.2,0.6,0.4,1) infinite'
export const BEAM_DOT_ANIMATION = 'dot-blink 2.6s ease-in-out infinite'
