/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        alojau: {
          verde: '#16a34a',
          amarillo: '#eab308',
          naranja: '#f97316',
        }
      }
    },
  },
  plugins: [],
}
