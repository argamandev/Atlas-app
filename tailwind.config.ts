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
        '2xs': ['12px', { lineHeight: '18px' }],
        xs: ['13px', { lineHeight: '20px' }],
        sm: ['15px', { lineHeight: '22px' }],
        base: ['16px', { lineHeight: '26px' }],
        lg: ['18px', { lineHeight: '28px' }],
        xl: ['21px', { lineHeight: '30px' }],
        '2xl': ['25px', { lineHeight: '34px' }],
        '3xl': ['32px', { lineHeight: '40px' }],
        '4xl': ['40px', { lineHeight: '48px' }],
        '5xl': ['50px', { lineHeight: '58px' }],
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
