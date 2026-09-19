import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // All theme-sensitive colors → CSS variables (flip with light/dark class).
        // background/surface/accent use the rgb(var(--x-rgb) / <alpha-value>)
        // form specifically so opacity modifiers (bg-accent/70, etc.) actually
        // work — Tailwind can only inject an alpha value into a CSS variable
        // color when the variable holds a bare "R G B" triplet, not a hex
        // string, otherwise the modifier silently produces no color at all.
        background: 'rgb(var(--background-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        'surface-elevated': 'var(--surface-elevated)',
        foreground: 'var(--foreground)',
        border: 'var(--border-subtle)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-muted': 'var(--accent-muted)',
        'text-primary': 'var(--foreground)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        // Static — same in both themes
        success: '#10B981',
        danger: '#EF4444',
        info: '#3B82F6',
      },
      fontFamily: {
        // var() with a real fallback chain: if the font file has not arrived
        // yet the page still renders in something deliberate.
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Archivo', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-accent': 'linear-gradient(135deg, #F5A623 0%, #E8941A 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        shimmer: 'shimmer 2.8s ease-in-out infinite',
        // A readout sweep, for surfaces that should feel like an instrument
        // rather than a poster. Slow on purpose: a fast scan reads as a
        // loading state, which is the opposite of what it is saying.
        scan: 'scan 4.5s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '12%': { opacity: '1' },
          '88%': { opacity: '1' },
          '100%': { transform: 'translateY(2000%)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(245,166,35,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(245,166,35,0.6)' },
        },
        // A single light sweep across a card, left to right, then a pause.
        shimmer: {
          '0%': { transform: 'translateX(0)' },
          '60%, 100%': { transform: 'translateX(400%)' },
        },
      },
      boxShadow: {
        'glow-accent': '0 0 30px rgba(245,166,35,0.3)',
        'glow-sm': '0 0 15px rgba(245,166,35,0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
