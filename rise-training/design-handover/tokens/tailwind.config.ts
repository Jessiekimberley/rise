// Tailwind theme extension for the UI overhaul. Merge into your existing config.
// Mirrors tokens.css; keep the two in sync.
import type { Config } from 'tailwindcss';

const config: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1C1C1E', muted: '#6E6E73', soft: '#4A4A4F' },
        surface: { DEFAULT: '#FFFFFF', muted: '#F1F1EF', quiet: '#F4F4F2' },
        canvas: '#F2F2F0',
        hairline: '#ECEBE8',
        sky: '#C9D6E8',
        mist: '#E1E7F0',
        peach: { DEFAULT: '#F6CFB2', tint: '#FBE7DA', ink: '#5A4A40' },
        accent: '#E58F66',
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['34px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        title: ['28px', { lineHeight: '1.14', letterSpacing: '-0.01em' }],
        hero: ['32px', { lineHeight: '1' }],
        value: ['17px', { lineHeight: '1.3' }],
        label: ['13px', { lineHeight: '1.3' }],
      },
      borderRadius: { row: '24px', card: '26px', sheet: '32px' },
      backgroundImage: {
        page: 'radial-gradient(95% 30% at 50% 26%, #F6CFB2 0%, rgba(246,207,178,0) 72%), linear-gradient(180deg, #C9D6E8 0%, #E1E7F0 26%, #F2F2F0 52%, #F2F2F0 100%)',
        hero: 'radial-gradient(95% 34% at 50% 30%, #F6CFB2 0%, rgba(246,207,178,0) 72%), linear-gradient(180deg, #C9D6E8 0%, #E1E7F0 30%, #F2F2F0 58%, #F2F2F0 100%)',
        scrim: 'linear-gradient(180deg, rgba(12,10,8,0) 30%, rgba(12,10,8,0.6) 100%)',
      },
      boxShadow: {
        nav: '0 6px 24px rgba(28,28,30,0.10)',
        sheet: '0 -8px 30px rgba(28,28,30,0.06)',
      },
      height: { tap: '44px', primary: '60px', nav: '64px' },
    },
  },
};

export default config;
