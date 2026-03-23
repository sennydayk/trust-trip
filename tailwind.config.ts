import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    borderRadius: {
      none: '0',
      DEFAULT: '4px',
      sm: '4px',
      md: '4px',
      lg: '4px',
      full: '9999px',
    },
    extend: {
      colors: {
        primary: { DEFAULT: '#1B5EA4', light: '#F0F5FF' },
        neutral: {
          dark: '#1E293B',
          mid: '#64748B',
          light: '#94A3B8',
          border: '#E2E6ED',
          surface: '#F8F9FB',
        },
        score: {
          high: '#16A34A',
          'high-bg': '#F0FDF4',
          'high-text': '#15803D',
          mid: '#D97706',
          'mid-bg': '#FFFBEB',
          'mid-text': '#B45309',
          low: '#DC2626',
          'low-bg': '#FEF2F2',
        },
      },
    },
  },
  plugins: [],
};

export default config;
