/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef1f6',
          100: '#d5dbe8',
          200: '#aab7d0',
          300: '#8093b9',
          400: '#556fa1',
          500: '#3b527f',
          600: '#2f4266',
          700: '#263A5A',
          800: '#1a2a43',
          900: '#14213D',
          950: '#0c1426',
        },
        gold: {
          50: '#fdf8ed',
          100: '#faecd0',
          200: '#f5d9a1',
          300: '#F4B942',
          400: '#eda82e',
          500: '#d9951f',
          600: '#b87a18',
          700: '#8e5d13',
          800: '#644110',
          900: '#3a260a',
        },
        neutral: {
          50: '#F7F8FA',
          100: '#f1f3f5',
          150: '#E5E7EB',
          200: '#d1d5db',
          300: '#b0b5bc',
          400: '#8c929c',
          500: '#6B7280',
          600: '#535963',
          700: '#3c414b',
          800: '#1F2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'elevated': '0 8px 24px rgba(0,0,0,0.08)',
        'nav': '0 1px 0 rgba(0,0,0,0.06)',
      },
      borderRadius: {
        'sm': '0.375rem',
        'DEFAULT': '0.5rem',
        'md': '0.625rem',
        'lg': '0.75rem',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
