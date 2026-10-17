/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#F7F3EB',
          soft: '#FBF8F1',
          deep: '#EFE8DA',
        },
        linen: {
          DEFAULT: '#E8E0D2',
          light: '#F1EADC',
          dark: '#D8CDB8',
        },
        terracotta: {
          light: '#D9A98F',
          DEFAULT: '#B87559',
          dark: '#9A5A40',
          deep: '#7C4530',
        },
        slateink: {
          light: '#67717A',
          DEFAULT: '#525C64',
          dark: '#3E4850',
        },
        charcoal: {
          soft: '#3A3E3B',
          DEFAULT: '#202321',
        },
        sage: {
          light: '#DCE5DB',
          DEFAULT: '#7C9473',
          dark: '#4C6345',
        },
        amberclay: {
          light: '#F2E3C9',
          DEFAULT: '#7A5C28',
        },
        clayred: {
          light: '#EFD4CC',
          DEFAULT: '#96432E',
        },
      },
      fontFamily: {
        serif: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(32,35,33,0.05), 0 4px 16px rgba(32,35,33,0.06)',
        lifted: '0 2px 4px rgba(32,35,33,0.06), 0 12px 32px rgba(32,35,33,0.10)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
