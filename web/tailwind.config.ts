import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1115',
        panel: '#171a21',
        edge: '#262b36',
        muted: '#8b93a7',
        accent: '#e2725b',
      },
    },
  },
  plugins: [],
};

export default config;
