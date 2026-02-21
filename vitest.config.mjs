import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      coaction: resolve(__dirname, 'packages/core/src/index.ts'),
      '@coaction/alien-signals': resolve(
        __dirname,
        'packages/coaction-alien-signals/src/index.ts'
      ),
      '@coaction/history': resolve(
        __dirname,
        'packages/coaction-history/src/index.ts'
      ),
      '@coaction/jotai': resolve(
        __dirname,
        'packages/coaction-jotai/src/index.ts'
      ),
      '@coaction/logger': resolve(__dirname, 'packages/logger/src/index.ts'),
      '@coaction/mobx': resolve(
        __dirname,
        'packages/coaction-mobx/src/index.ts'
      ),
      '@coaction/ng': resolve(__dirname, 'packages/coaction-ng/src/index.ts'),
      '@coaction/persist': resolve(
        __dirname,
        'packages/coaction-persist/src/index.ts'
      ),
      '@coaction/pinia': resolve(
        __dirname,
        'packages/coaction-pinia/src/index.ts'
      ),
      '@coaction/react': resolve(
        __dirname,
        'packages/coaction-react/src/index.ts'
      ),
      '@coaction/redux': resolve(
        __dirname,
        'packages/coaction-redux/src/index.ts'
      ),
      '@coaction/solid': resolve(
        __dirname,
        'packages/coaction-solid/src/index.ts'
      ),
      '@coaction/svelte': resolve(
        __dirname,
        'packages/coaction-svelte/src/index.ts'
      ),
      '@coaction/valtio': resolve(
        __dirname,
        'packages/coaction-valtio/src/index.ts'
      ),
      '@coaction/vue': resolve(__dirname, 'packages/coaction-vue/src/index.ts'),
      '@coaction/xstate': resolve(
        __dirname,
        'packages/coaction-xstate/src/index.ts'
      ),
      '@coaction/yjs': resolve(__dirname, 'packages/coaction-yjs/src/index.ts'),
      '@coaction/zustand': resolve(
        __dirname,
        'packages/coaction-zustand/src/index.ts'
      )
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
