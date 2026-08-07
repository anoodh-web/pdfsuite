/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
        },
        paper: 'rgb(var(--paper) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dim: 'rgb(var(--accent-dim) / <alpha-value>)',
          soft: 'var(--accent-soft)',
        },
        signal: {
          success: 'rgb(var(--signal-success) / <alpha-value>)',
          warn: 'rgb(var(--signal-warn) / <alpha-value>)',
          danger: 'rgb(var(--signal-danger) / <alpha-value>)',
        },
        muted: 'rgb(var(--muted) / <alpha-value>)',
      },
      fontFamily: {
        ui: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        ribbon: '0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 16px rgba(0,0,0,0.28)',
      },
    },
  },
  plugins: [],
}
