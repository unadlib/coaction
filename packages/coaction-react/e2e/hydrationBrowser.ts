import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { createHydrationStore, hydrationApp } from './hydrationApp';

const params = new URLSearchParams(location.search);
const store = createHydrationStore(params.has('preloaded'));
if (params.has('mismatch')) store.getState().load();
const container = document.getElementById('root')!;
const serverNodes = [...container.children];
const errors: string[] = [];
const harness = {
  ready: false,
  errors,
  reactVersion: React.version,
  retainedServerNodes: () =>
    serverNodes.every((node, index) => node === container.children[index]),
  update: () => store.getState().load(9, 'Jordan'),
  destroy: () => {
    root.unmount();
    store.destroy();
  }
};
declare global {
  interface Window {
    __hydration: typeof harness;
  }
}
window.__hydration = harness;
const root = hydrateRoot(
  container,
  hydrationApp(store, params.has('strict'), () => {
    harness.ready = true;
  }),
  { onRecoverableError: (error) => errors.push(String(error)) }
);
