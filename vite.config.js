import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite will look for index.html in the root directory
  // Source files are in src/ directory
  build: {
    // Output directory for built files
    outDir: 'dist',
    emptyOutDir: true,
  },
})

