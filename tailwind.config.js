/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        ui: ["'Hanken Grotesk'", "'Helvetica Neue'", "Helvetica", "Arial", "sans-serif"],
        title: ["'Cormorant Garamond'", "Garamond", "serif"],
      },
    },
  },
  plugins: [],
}
