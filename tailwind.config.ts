import type { Config } from 'tailwindcss'
import { tokens } from './src/lib/design/tokens'

const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050505',
        'bg-secondary': '#0B0B0B',
        card: '#111111',
        border: '#1F1F1F',
        accent: '#C04A00',
        'accent-hover': '#A03800',
        'text-primary': '#FFFFFF',
        'text-secondary': '#A1A1A1',
        muted: '#6B6B6B',
        success: '#00C853',
        error: '#FF3B30',
        'status-processing': '#3B82F6',

        // ── V1 light design system (from src/lib/design/tokens.ts) ──
        desktop: tokens.color.desktop,
        canvas: tokens.color.canvas,
        panel: tokens.color.panel,
        subtle: tokens.color.subtle,
        'subtle-strong': tokens.color.subtleStrong,
        hairline: tokens.color.hairline,
        ink: tokens.color.ink,
        'ink-muted': tokens.color.inkMuted,
        'ink-faint': tokens.color.inkFaint,
        player: tokens.color.player,
        'player-ink': tokens.color.playerInk,
        'player-faint': tokens.color.playerFaint,
        'player-track': tokens.color.playerTrack,
        live: tokens.color.live,

        // ── V2 (Claude Design import) surfaces ──
        shell: tokens.v2.shell,
        paper: tokens.v2.paper,
        rail: tokens.v2.rail,
        'rail-text': tokens.v2.railText,
        'rail-active': tokens.v2.railActive,
        'rail-chip': tokens.v2.railChip,
        'rail-hair': tokens.v2.railHair,
        ask: tokens.v2.ask,
        'ask-ink': tokens.v2.askInk,
        'call-dark': tokens.v2.callDark,
        'call-panel': tokens.v2.callPanel,
        'call-raised': tokens.v2.callRaised,
        'call-hover': tokens.v2.callHover,
        'call-track': tokens.v2.callTrack,
        'call-ink': tokens.v2.callInk,
        'call-muted': tokens.v2.callMuted,
        'call-faint': tokens.v2.callFaint,
        field: tokens.v2.field,
        'field-line': tokens.v2.fieldLine,
        'chip-bg': tokens.v2.chipBg,
        'send-idle': tokens.v2.sendIdle,
        ghost: tokens.v2.ghost,
      },
      fontFamily: {
        // ── V2 parity pass: THE design's base stack (probed from the rendered
        // Atlas MVP.dc.html — one stack for BOTH locales; resolves to Segoe UI
        // on Windows, SF Pro on Mac; Hebrew renders from the same system face).
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'system-ui',
          'sans-serif',
        ],
        hebrew: ['"IBM Plex Sans Hebrew"', 'Heebo', 'Inter', 'system-ui', 'sans-serif'],
        // Latin/English UI font. Falls back to the Hebrew face so mixed-script
        // content (Hebrew company names inside an English UI) still renders.
        latin: ['Inter', '"IBM Plex Sans Hebrew"', 'system-ui', 'sans-serif'],
        // Hebrew V1 UI font — Calibri Regular with a Hebrew-supporting fallback stack.
        calibri: ['Calibri', '"Segoe UI"', '"IBM Plex Sans Hebrew"', 'Heebo', 'system-ui', 'sans-serif'],
        // ── V2 (Claude Design import) — serif display voice (report titles, serif accents)
        display: ['Newsreader', 'Georgia', 'serif'],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '6px',
        xl: '6px',
        full: '9999px',
        // ── V1 light design system radius scale ──
        card: tokens.radius.md, // 12px — cards, list rows, panels
        bubble: tokens.radius.bubble, // 14px — chat bubbles, inputs, composer
        win: tokens.radius.win, // 16px — the app window / large cards
        pill: tokens.radius.pill, // media player + pill controls
      },
      boxShadow: {
        // Soft, diffuse elevation used in exactly three places (brief §3.4).
        soft: tokens.shadow.soft,
        card: tokens.shadow.card,
        float: tokens.shadow.float,
        window: tokens.shadow.window,
        popover: tokens.shadow.popover,
        player: tokens.shadow.player,
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['15px', { lineHeight: '24px' }],
        lg: ['17px', { lineHeight: '28px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '38px' }],
        '4xl': ['38px', { lineHeight: '46px' }],
        '5xl': ['48px', { lineHeight: '56px' }],
      },
      letterSpacing: {
        tighter: '-0.03em',
        tight: '-0.02em',
        normal: '-0.01em',
        wide: '0.04em',
        wider: '0.08em',
        widest: '0.12em',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'progress-fill': 'progressFill 1.5s ease-in-out forwards',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        blink: 'blink 1.2s step-end infinite',
        // ── V1 design-pass motion (cubic-bezier ease-out, fill both for staggered reveals) ──
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pop-in': 'popIn 0.26s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-live': 'pulseLive 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) infinite',
        shimmer: 'shimmer 1.4s linear infinite',
      },
      keyframes: {
        progressFill: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        // softer, shorter reveal than slideUp — used for staggered list/section entrances
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // popovers, dropdowns, suggestion chips
        popIn: {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        // the reserved LIVE dot — gentle shrink+fade, not a hard blink
        pulseLive: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(0.82)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
