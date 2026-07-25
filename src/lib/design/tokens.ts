// ─────────────────────────────────────────────────────────────────────────────
// Atlas V1 design tokens — the single source of truth for the light, near-
// monochrome, macOS-feel visual system (Quartr-style). Consumed by tailwind.config.ts
// so every component pulls from here; NO ad-hoc hex / radius / shadow inline anywhere.
//
// Palette discipline (brief §3.6.9): monochrome (ink on white) + ONE charcoal player
// accent. `live` red is reserved EXCLUSIVELY for LIVE / real-time states.
// ─────────────────────────────────────────────────────────────────────────────

export const tokens = {
  color: {
    // surfaces — Harvey retune 2026-07-25 (probe: harvey-design-tokens.json): the warm
    // family goes neutral; page/desktop are one flat #FAFAFA (no marble backdrop in Harvey)
    desktop: '#FAFAFA',
    canvas: '#FFFFFF', // floating pane cards / content canvas
    panel: '#F0F0F0', // docked panel surface (Ask Atlas panel, composer field)
    subtle: '#EFEFEF', // selection / hover fill (the one highlight token)
    subtleStrong: '#E5E5E5',
    hairline: '#DEDEDE', // the 1px card/input/panel border (Harvey is bordered, not shadowed)

    // text hierarchy — weight + gray value carry hierarchy, never loud color
    ink: '#0A0A0A', // primary: names, headers, key values (Harvey near-black, neutral)
    inkMuted: '#575757', // secondary: roles, labels, body copy
    inkFaint: '#767676', // metadata: timestamps, section labels, captions

    // the single high-contrast element: the docked media player
    player: '#0A0A0A', // matches the black nav rail (founder round-3: one continuous chrome)
    playerInk: '#ECECEA', // light text/icons on the player
    playerFaint: '#9A9A9D',
    playerTrack: '#4A4A4D',

    // reserved for LIVE / real-time ONLY — appears nowhere else.
    // V2 (Claude Design import): burnt orange-red, verified as the design's only live accent.
    live: '#CB4B2E',

    white: '#FFFFFF',
    black: '#000000',
  },

  // ── Harvey surfaces (Design Round 2 import, 2026-07-25) — values probed from the
  // RENDERED design in verified Harvey mode (docs/evidence/feat-design-round-2/probe/
  // harvey-design-tokens.json). Single theme: black rail, white page, gray panels.
  // Spec: docs/superpowers/specs/2026-07-25-design-round-2-harvey-import-design.md ──
  harvey: {
    shell: '#FAFAFA', // the page background, everywhere (incl. call views — light per spec)
    paper: '#F7F7F7', // raised inputs/flat cards (search 52px, upcoming-calls card)
    panel: '#F0F0F0', // docked panels (Ask Atlas panel, composer field)
    hairline: '#DEDEDE', // the 1px border on cards/inputs/panels (bordered, not shadowed)
    rail: '#0A0A0A', // black nav rail (230px, border-right railHair)
    railText: '#6B6862', // rail item text (active differs by weight 600 vs 450, not hue)
    railActive: 'rgba(255,255,255,0.10)', // active item fill (+ white text)
    railChip: 'rgba(255,255,255,0.06)', // quick-access chip fill
    railHair: 'rgba(255,255,255,0.09)', // rail hairlines / chip borders
    ask: '#FCE44D', // Ask-Atlas selection/highlight ONLY (functional accent, not theme)
    askInk: '#1C1B19', // ink on ask-yellow
    // composer (Harvey: neutral gray family, black send)
    field: '#F0F0F0', // composer field fill (= panel)
    fieldLine: '#DEDEDE', // composer field border (= hairline)
    chipBg: '#F7F7F7', // suggestion chip fill (= paper)
    sendIdle: '#0A0A0A', // send button — Harvey's black circle
    ghost: '#8A8A8A', // ghost/placeholder text (neutralized; verify at panel eyes-on)
  },

  // soft, consistent rounded corners (brief §3.3)
  radius: {
    sm: '8px', // chips, small controls
    md: '12px', // cards, panels, list rows
    bubble: '14px', // chat bubbles, inputs, composer
    lg: '16px', // larger cards
    win: '16px', // the app window
    pill: '9999px', // the media player + pill controls
  },

  // depth used in exactly three places (brief §3.4): window, popover, player.
  // `card` (barely-there lift for list rows / cards) and `float` (the search +
  // composer hover-float) are the softer, more diffuse recipes from the V1 design pass.
  shadow: {
    // Harvey: THE float recipe — multiview pane cards (white, 16px radius). Probed
    // 2026-07-25; the only shadow family in Harvey, everything else is bordered flat.
    pane: '0 8px 26px -18px rgba(28,24,14,0.30), 0 1px 3px rgba(28,24,14,0.05)',
    // V2 (Claude Design): the design's one soft lift for search field + live card
    soft: '0 1px 3px rgba(28,27,25,0.06), 0 8px 24px rgba(28,27,25,0.04)',
    card: '0 1px 2px rgba(20,18,15,0.05), 0 1px 1px rgba(20,18,15,0.03)',
    float: '0 24px 70px -20px rgba(20,18,15,0.16), 0 2px 8px -2px rgba(20,18,15,0.07)',
    window: '0 24px 64px -16px rgba(0,0,0,0.28), 0 2px 8px -2px rgba(0,0,0,0.10)',
    popover: '0 12px 36px -8px rgba(0,0,0,0.22), 0 2px 6px -2px rgba(0,0,0,0.10)',
    player: '0 16px 48px -12px rgba(0,0,0,0.42), 0 2px 8px -2px rgba(0,0,0,0.24)',
  },

  font: {
    // EN UI — SF-Pro-like neutral sans (documented fallback per brief §3.2)
    latin: "'Inter', system-ui, -apple-system, sans-serif",
    // HE UI — Calibri Regular with a Hebrew-supporting fallback stack
    calibri: "'Calibri', 'Segoe UI', 'IBM Plex Sans Hebrew', Heebo, system-ui, sans-serif",
  },

  z: {
    base: 0,
    sidebar: 10,
    player: 40,
    popover: 50,
    modal: 60,
  },
} as const

export type Tokens = typeof tokens
