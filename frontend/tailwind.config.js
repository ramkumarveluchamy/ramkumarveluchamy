/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        income: { DEFAULT: '#16a34a', light: '#dcfce7', dark: '#15803d' },
        expense: { DEFAULT: '#dc2626', light: '#fee2e2', dark: '#b91c1c' },
        neutral: { DEFAULT: '#2563eb', light: '#dbeafe', dark: '#1d4ed8' },
      },
    },
  },
  plugins: [],
};
