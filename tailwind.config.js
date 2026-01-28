/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light theme colors
        'navy-dark': '#001E44',
        'navy': '#041E42',
        // Dark theme colors  
        'rose': '#E0115F',
        'magenta': '#C71585',
        // Pitch colors
        'grass-light': '#2E8B57',
        'grass-dark': '#228B22',
        'pitch-line': '#FFFFFF',
      },
      animation: {
        'pulse-marker': 'pulseMarker 1.5s ease-in-out infinite',
      },
      keyframes: {
        pulseMarker: {
          '0%, 100%': { 
            transform: 'scale(1)',
            opacity: '1',
          },
          '50%': { 
            transform: 'scale(1.3)',
            opacity: '0.7',
          },
        },
      },
    },
  },
  plugins: [],
}
