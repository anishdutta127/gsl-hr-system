import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: 'var(--color-teal)',
          dark: 'var(--color-teal-dark)',
          light: 'var(--color-teal-light)',
        },
        navy: {
          DEFAULT: 'var(--color-navy)',
          dark: 'var(--color-navy-dark)',
          light: 'var(--color-navy-light)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          2: 'var(--color-ink-2)',
          3: 'var(--color-ink-3)',
        },
        line: {
          DEFAULT: 'var(--color-line)',
          strong: 'var(--color-line-strong)',
        },
        surface: 'var(--color-surface)',
        card: 'var(--color-card)',
        success: {
          DEFAULT: 'var(--color-success)',
          bg: 'var(--color-success-bg)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          bg: 'var(--color-warning-bg)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          bg: 'var(--color-danger-bg)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          bg: 'var(--color-info-bg)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Montserrat', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Open Sans', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        slow: '400ms',
      },
      maxWidth: {
        content: 'var(--content-max)',
      },
    },
  },
  plugins: [typography],
}

export default config
