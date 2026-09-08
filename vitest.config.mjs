import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'coaction/derived': resolve(__dirname, 'packages/core/derived.ts'),
      'coaction/adapter': resolve(__dirname, 'packages/core/adapter.ts'),
      'coaction/shared': resolve(__dirname, 'packages/core/shared.ts'),
      coaction: resolve(__dirname, 'packages/core/index.ts'),
      '@coaction/history': resolve(
        __dirname,
        'packages/coaction-history/src/index.ts'
      ),
      '@coaction/jotai': resolve(
        __dirname,
        'packages/coaction-jotai/src/index.ts'
      ),
      '@coaction/logger': resolve(
        __dirname,
        'packages/coaction-logger/src/index.ts'
      ),
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
      '@coaction/react/shared': resolve(
        __dirname,
        'packages/coaction-react/src/shared.ts'
      ),
      '@coaction/react': resolve(
        __dirname,
        'packages/coaction-react/src/index.ts'
      ),
      '@coaction/sync/firestore': resolve(
        __dirname,
        'packages/coaction-sync/src/firestore.ts'
      ),
      '@coaction/sync/query': resolve(
        __dirname,
        'packages/coaction-sync/src/query.ts'
      ),
      '@coaction/sync/supabase': resolve(
        __dirname,
        'packages/coaction-sync/src/supabase.ts'
      ),
      '@coaction/sync/indexeddb': resolve(
        __dirname,
        'packages/coaction-sync/src/indexeddb.ts'
      ),
      '@coaction/sync/crud': resolve(
        __dirname,
        'packages/coaction-sync/src/crud.ts'
      ),
      '@coaction/sync': resolve(
        __dirname,
        'packages/coaction-sync/src/index.ts'
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
      reportOnFailure: true,
      thresholds: {
        statements: 92,
        branches: 85,
        functions: 94,
        lines: 92
      },
      all: true,
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/dist/**', '**/test/**']
    }
  }
});
