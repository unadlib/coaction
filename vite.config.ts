import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const packageAlias = (packageName: string) =>
  resolve(__dirname, `packages/${packageName}/src/index.ts`);

export default {
  plugins: [
    {
      name: 'coaction-hydration-fixture',
      transformIndexHtml: {
        order: 'pre' as const,
        async handler(
          html: string,
          context: import('vite').IndexHtmlTransformContext
        ) {
          if (
            context.path !== '/examples/e2e/browser/hydration.html' ||
            !context.server
          )
            return html;
          const params = new URL(
            context.originalUrl ?? context.path,
            'http://localhost'
          ).searchParams;
          const { renderHydrationFixture } = await context.server.ssrLoadModule(
            '/packages/coaction-react/e2e/hydrationServer.ts'
          );
          const markup = renderHydrationFixture(
            params.has('preloaded'),
            params.has('strict')
          );
          return html.replace('<!-- server markup -->', markup);
        }
      }
    }
  ],
  resolve: {
    alias: {
      'coaction/derived': resolve(__dirname, 'packages/core/derived.ts'),
      'coaction/adapter': resolve(__dirname, 'packages/core/adapter.ts'),
      'coaction/shared': resolve(__dirname, 'packages/core/shared.ts'),
      coaction: resolve(__dirname, 'packages/core/index.ts'),
      '@coaction/history': packageAlias('coaction-history'),
      '@coaction/jotai': packageAlias('coaction-jotai'),
      '@coaction/logger': packageAlias('coaction-logger'),
      '@coaction/mobx': packageAlias('coaction-mobx'),
      '@coaction/ng': packageAlias('coaction-ng'),
      '@coaction/persist': packageAlias('coaction-persist'),
      '@coaction/pinia': packageAlias('coaction-pinia'),
      '@coaction/react': packageAlias('coaction-react'),
      '@coaction/redux': packageAlias('coaction-redux'),
      '@coaction/solid': packageAlias('coaction-solid'),
      '@coaction/svelte': packageAlias('coaction-svelte'),
      '@coaction/sync/crud': resolve(
        __dirname,
        'packages/coaction-sync/src/crud.ts'
      ),
      '@coaction/sync': packageAlias('coaction-sync'),
      '@coaction/valtio': packageAlias('coaction-valtio'),
      '@coaction/vue': packageAlias('coaction-vue'),
      '@coaction/xstate': packageAlias('coaction-xstate'),
      '@coaction/yjs': packageAlias('coaction-yjs'),
      '@coaction/zustand': packageAlias('coaction-zustand')
    }
  }
};
