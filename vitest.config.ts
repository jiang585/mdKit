import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/component/**/*.test.tsx',
      'tests/integration/**/*.spec.ts',
      'tests/perf/**/*.spec.ts',
    ],
    environmentMatchGlobs: [
      ['tests/component/**', 'jsdom'],
      ['tests/integration/**', 'jsdom'],
    ],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/**', 'src/shared/**'],
    },
  },
});
