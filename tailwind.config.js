/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html"
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors for financial dashboard
        // Green for positive/calls, Red for negative/puts
        'call-green': '#10b981',
        'put-red': '#ef4444',
      },
    },
  },
  plugins: [],
}

