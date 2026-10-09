/**
 * Runs Firestore security-rule tests in Node while the official emulator is active.
 * @module vitest.firestore.config
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/firestore.rules.test.js'],
    hookTimeout: 20000,
    testTimeout: 20000,
    fileParallelism: false,
  },
})
