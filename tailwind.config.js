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
        lift: '0 22px 48px -28px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.04)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'fade-up': 'fadeUp 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fadeIn 260ms ease both',
        'page-in': 'pageIn 380ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'modal-in': 'modalIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'overlay-in': 'overlayIn 200ms ease both',
        'menu-in': 'menuIn 170ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'toast-in': 'toastIn 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'tab-in': 'tabIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.7s linear infinite',
        'pulse-soft': 'pulseSoft 2.6s ease-in-out infinite',
        scan: 'scan 7s linear infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        pageIn: {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.995)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        modalIn: {
          from: { opacity: '0', transform: 'translateY(18px) scale(0.975)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        overlayIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        menuIn: {
          from: { opacity: '0', transform: 'translateY(-6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        tabIn: {
          from: { opacity: '0', transform: 'translateX(6px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
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
