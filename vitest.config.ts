/**
 * Vitest config — deliberately standalone (NOT the app's vite.config.ts):
 * unit tests cover pure store/logic modules and run in a plain node
 * environment, so the React/dev plugins are unnecessary.
 */
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
