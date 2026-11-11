/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          950: '#05080c',
          900: '#070c12',
          850: '#0a1118',
          800: '#0d151e',
          750: '#111c27',
          700: '#172431',
        },
        mint: {
          300: '#8cf8cf',
          400: '#54e6b1',
          500: '#29cf98',
          600: '#13ac7b',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(84, 230, 177, 0.18), 0 18px 60px -24px rgba(41, 207, 152, 0.35)',
        panel: '0 24px 60px -32px rgba(0, 0, 0, 0.8)',
      },
      animation: {
        'fade-up': 'fadeUp 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'pulse-soft': 'pulseSoft 2.6s ease-in-out infinite',
        'scan': 'scan 7s linear infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        scan: {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(500%)' },
        },
      },
    },
  },
  plugins: [],
}
