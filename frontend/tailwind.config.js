/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#ebf0ff',
          200: '#d6e0ff',
          300: '#b3c7ff',
          400: '#80a3ff',
          500: '#4d7cff',
          600: '#1a55ff',
          700: '#003be6',
          800: '#002eb3',
          900: '#002280',
        }
      }
    },
  },
  plugins: [],
}
