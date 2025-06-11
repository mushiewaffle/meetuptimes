/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'edc-pink': '#FF00FF',
        'edc-blue': '#00FFFF',
        'edc-purple': '#8000FF',
        'edc-black': '#000000',
      },
      fontFamily: {
        'orbitron': ['Orbitron', 'sans-serif'],
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { 
            textShadow: '0 0 5px #FF00FF, 0 0 10px #FF00FF, 0 0 15px #FF00FF, 0 0 20px #FF00FF',
            boxShadow: '0 0 5px #FF00FF, 0 0 10px #FF00FF' 
          },
          '100%': { 
            textShadow: '0 0 10px #00FFFF, 0 0 20px #00FFFF, 0 0 30px #00FFFF, 0 0 40px #00FFFF',
            boxShadow: '0 0 10px #00FFFF, 0 0 20px #00FFFF'
          },
        },
      },
    },
  },
  plugins: [],
}
