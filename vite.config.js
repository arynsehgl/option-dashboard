/** Configures the Vite production build, tests, and stable vendor chunking. */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Separates large framework SDKs so users download only the zone they open.
 */
function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'vendor-firebase'
  if (id.includes('/lightweight-charts/')) return 'vendor-market-chart'
  if (id.includes('/chart.js/') || id.includes('/react-chartjs-2/')) return 'vendor-dashboard-chart'
  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'vendor-react'
  if (id.includes('/lucide-react/')) return 'vendor-icons'
  return 'vendor'
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite will look for index.html in the root directory
  // Source files are in src/ directory
  build: {
    // Output directory for built files
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    css: true,
    exclude: ['services/**', 'node_modules/**', 'dist/**', 'tests/firestore.rules.test.js'],
  },
})
