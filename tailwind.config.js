/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom colors for financial dashboard
        // Green for positive/calls, Red for negative/puts
        'call-green': '#10b981',
        'put-red': '#ef4444',
      },
      animation: {
        'bounce-deep': 'bounce-deep 0.6s ease-in-out',
      },
      keyframes: {
        'bounce-deep': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '25%': { transform: 'translateY(-20px) scale(1.1)' },
          '50%': { transform: 'translateY(0) scale(0.95)' },
          '75%': { transform: 'translateY(-10px) scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
}

