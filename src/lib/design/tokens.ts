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
    // surfaces
    desktop: '#E7E2DA', // stone/marble desktop backdrop base (veined via CSS gradient)
    canvas: '#FFFFFF', // the floating window + content canvas
    panel: '#F7F6F3', // sidebar / expanded-panel surface (faint warm gray)
    subtle: '#EFEDE8', // selection / hover fill (the one highlight token)
    subtleStrong: '#E5E2DB',
    hairline: 'rgba(20,20,20,0.08)', // the only divider, used sparingly

    // text hierarchy — weight + gray value carry hierarchy, never loud color
    ink: '#1B1B1A', // primary: names, headers, key values (near-black, warm)
    inkMuted: '#6C6C68', // secondary: roles, labels
    inkFaint: '#9C9A94', // metadata: timestamps, tickers, captions

    // the single high-contrast element: the docked media player
    player: '#2B2B2E', // warm graphite charcoal (not pure black)
    playerInk: '#ECECEA', // light text/icons on the player
    playerFaint: '#9A9A9D',
    playerTrack: '#4A4A4D',

    // reserved for LIVE / real-time ONLY — appears nowhere else
    live: '#E5484D',

    white: '#FFFFFF',
    black: '#000000',
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
