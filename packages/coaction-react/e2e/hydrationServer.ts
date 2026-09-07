import { renderToString } from 'react-dom/server';
import { createHydrationStore, hydrationApp } from './hydrationApp';

export const renderHydrationFixture = (preloaded: boolean, strict: boolean) => {
  if (typeof window !== 'undefined')
    throw new Error('SSR requires a separate Node context');
  const store = createHydrationStore(preloaded);
  try {
    return renderToString(hydrationApp(store, strict));
  } finally {
    store.destroy();
  }
};
