/**
 * Vitest configuration for isolated trade-worker unit tests.
 * @module vitest.config
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
})
