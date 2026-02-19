import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      coaction: resolve(__dirname, 'packages/core/src/index.ts')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/test/**/*.test.ts'],
    setupFiles: [resolve(__dirname, 'vitest.setup.js')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      all: true,
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/dist/**', '**/test/**']
    }
  }
});
