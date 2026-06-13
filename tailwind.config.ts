import type { Config } from 'tailwindcss'

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
      },
      fontFamily: {
        hebrew: [
          '"IBM Plex Sans Hebrew"',
          'Heebo',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        // Latin/English UI font. Falls back to the Hebrew face so mixed-script
        // content (Hebrew company names inside an English UI) still renders.
        latin: [
          'Inter',
          '"IBM Plex Sans Hebrew"',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '6px',
        xl: '6px',
        full: '9999px',
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
        'blink': 'blink 1.2s step-end infinite',
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
      },
    },
  },
  plugins: [],
}

export default config
