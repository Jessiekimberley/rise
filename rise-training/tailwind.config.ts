import type { Config } from 'tailwindcss';

export default {
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: 'var(--color-ink)', muted: 'var(--color-ink-muted)', soft: 'var(--color-ink-soft)' },
        surface: { DEFAULT: 'var(--color-surface)', muted: 'var(--color-surface-muted)', quiet: 'var(--color-surface-quiet)' },
        canvas: 'var(--color-canvas)',
        hairline: 'var(--color-hairline)',
        sky: 'var(--color-sky)',
        mist: 'var(--color-mist)',
        peach: { DEFAULT: 'var(--color-peach)', tint: 'var(--color-peach-tint)', ink: 'var(--color-peach-ink)' },
        accent: 'var(--color-accent)',
      },
      fontFamily: { serif: 'var(--font-serif)', sans: 'var(--font-sans)' },
      fontSize: {
        display: ['var(--text-display)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        title: ['var(--text-title)', { lineHeight: '1.14', letterSpacing: '-0.01em' }],
        hero: ['var(--text-hero)', { lineHeight: '1' }],
        value: ['var(--text-value)', { lineHeight: '1.3' }],
        label: ['var(--text-label)', { lineHeight: '1.3' }],
      },
      borderRadius: { row: 'var(--radius-row)', card: 'var(--radius-card)', sheet: 'var(--radius-sheet)' },
      backgroundImage: { page: 'var(--gradient-page)', hero: 'var(--gradient-hero)', scrim: 'var(--scrim-photo)' },
      boxShadow: { nav: 'var(--shadow-nav)', sheet: 'var(--shadow-sheet)' },
      height: { tap: 'var(--tap-min)', primary: 'var(--button-primary-h)', nav: 'var(--nav-h)' },
    },
  },
} satisfies Partial<Config>;
